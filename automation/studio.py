from __future__ import annotations

import asyncio
import json
import math
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from PIL import Image, ImageDraw, ImageFilter

from .browser import BrowserError, PublishUnknown, WorkflowPublisher, workflows
from .config import Settings
from .db import Database
from .media import MediaProcessor
from .providers import ProviderError, ProviderStore
from .studio_db import StudioStore, utcnow


class StudioError(ValueError):
    pass


class OfflineError(StudioError):
    pass


def _json_object(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE | re.DOTALL)
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise ValueError("لا يوجد JSON في الاستجابة")
    value = json.loads(match.group(0))
    if not isinstance(value, dict):
        raise ValueError("استجابة غير صالحة")  # noqa: TRY004 - قيمة استجابة خارجية وليست وسيطة دالة.
    return value


class StudioService:
    def __init__(self, settings: Settings, db: Database):
        self.settings = settings
        self.db = db
        self.store = StudioStore(settings.database_path)
        self.media = MediaProcessor(settings)
        self.providers = ProviderStore(settings)
        self.publisher = WorkflowPublisher(settings)
        self.ensure_profiles()

    def ensure_profiles(self) -> None:
        """ملفان افتراضيان قابلان للتعديل؛ لا جلسات ولا نشر تلقائي عند الإنشاء."""
        if self.db.list_accounts():
            return
        common = {"review_required": True, "auto_publish": False, "enabled": False,
                  "monitor_interval_sec": 1800, "min_delay_sec": 45, "max_delay_sec": 180}
        news = self.db.create_account({
            **common, "name": "أخبار الجامعة", "platform": "x", "username": "",
            "settings": {
                "account_kind": "university_news", "profile_id": "university",
                "posting_times": ["08:30", "14:30", "20:00"], "posts_per_day": 3,
                "strict_instructions": "انشر الأخبار والمواعيد الموثقة فقط. لا تخترع قرارًا أو تاريخًا، واذكر مصدر الإعلان عند توفره.",
                "services": [], "facebook_groups": [],
                "template": {"mode": "rebuild", "background": "#0b1220", "surface": "#121d2e", "text": "#f3f7fb",
                             "muted": "#9caec2", "accent": "#5eead4", "font_size": 66, "margin": 76,
                             "watermark_opacity": 0.9, "source_attribution": True},
            },
        })
        services = self.db.create_account({
            **common, "name": "خدمات الطلبة", "platform": "instagram", "username": "", "phone_replacement": "",
            "settings": {
                "account_kind": "student_promo", "profile_id": "services", "dialect": "عربية بسيطة ودافئة",
                "posting_times": ["10:00", "16:00", "21:00"], "posts_per_day": 3,
                "strict_instructions": "لا تَعِد بدرجات أو قبول جامعي. اشرح الخدمة بوضوح، واذكر اسم الحساب صوتيًا وصورة، وأنهِ بدعوة للتواصل.",
                "services": ["تنسيق الأبحاث والتقارير", "إعداد العروض التقديمية", "المساعدة في التلخيص والمراجعة"],
                "facebook_groups": [], "cta": "راسلنا لمعرفة التفاصيل والتكلفة",
                "template": {"mode": "rebuild", "background": "#111827", "surface": "#1f2937", "text": "#fff7ed",
                             "muted": "#d1d5db", "accent": "#fbbf24", "font_size": 64, "margin": 76,
                             "watermark_opacity": 0.92, "source_attribution": True},
            },
        })
        for account, brief in ((news, "تذكير بموعد محاضرة أو تحديث مهم للطلبة"),
                               (services, "التعريف بخدمة تنسيق الأبحاث والعروض للطلبة")):
            kind = str(account["settings"]["account_kind"])
            draft = self.local_copy(account, brief, kind)
            self.store.create_project({"account_id": account["id"], "title": draft["title"], "brief": brief,
                "kind": kind, "output_format": "image" if kind == "university_news" else "video",
                "platforms": ["x", "facebook"] if kind == "university_news" else ["instagram", "tiktok", "facebook"],
                "template": "campus_brief" if kind == "university_news" else "service_spotlight", **draft})

    def account(self, account_id: str) -> dict[str, Any]:
        account = self.db.get_account(account_id)
        if not account:
            raise StudioError("الحساب غير موجود")
        return account

    def project(self, project_id: str) -> dict[str, Any]:
        project = self.store.get_project(project_id)
        if not project:
            raise StudioError("المشروع غير موجود")
        return project

    @staticmethod
    def local_copy(account: dict[str, Any], brief: str, kind: str) -> dict[str, Any]:
        name = account["name"]
        handle = account.get("username", "").strip().lstrip("@")
        mention = f"@{handle}" if handle else name
        contact = account.get("phone_replacement", "").strip()
        services = account.get("settings", {}).get("services", [])
        service = services[0] if services else "الخدمات الطلابية"
        topic = brief.strip() or service
        if kind == "university_news":
            title = topic[:70]
            caption = f"{topic}\n\nللتفاصيل والتحديثات الرسمية تابع {mention}.\n#أخبار_الجامعة #شؤون_الطلبة"
            scenes = ["خبر جامعي", topic, "راجع الموعد والتفاصيل من الإعلان الرسمي", f"تابع {mention}"]
            script = f"من {name}. {topic}. راجع التفاصيل من الإعلان الرسمي، وتابع {name} ليصلك كل جديد."
        else:
            title = topic[:70]
            cta = account.get("settings", {}).get("cta") or "راسلنا لمعرفة التفاصيل"
            contact_line = f" على {contact}" if contact else ""
            caption = f"هل تحتاج إلى {topic}؟\n\nمع {name} تبدأ بخطوات واضحة وتعرف التفاصيل قبل التنفيذ. {cta}{contact_line}.\n\nتابع {mention}\n#خدمات_طلابية #مساعدة_الطلبة"
            scenes = [f"معك {name}", topic, "خطوات واضحة · متابعة مستمرة · تفاصيل قبل البدء", f"{cta}{contact_line}\n{mention}"]
            script = f"معك {name} للخدمات الطلابية. هل تحتاج إلى {topic}؟ نساعدك بخطوات واضحة ومتابعة مستمرة، وتعرف التفاصيل قبل أن نبدأ. {cta}{contact_line}. تابع {name}."
        return {"title": title, "caption": caption, "script": script,
                "scenes": [{"heading": f"0{index + 1}", "text": text} for index, text in enumerate(scenes)]}

    async def generate_copy(self, account: dict[str, Any], brief: str, kind: str,
                            use_ai: bool = True) -> tuple[dict[str, Any], str, str]:
        fallback = self.local_copy(account, brief, kind)
        if not use_ai:
            return fallback, "local_rules", ""
        learning = self.db.learning_context(account["id"])
        system = """أنت كاتب محتوى جامعي وإعلاني عربي. أعد JSON فقط بالمفاتيح title,caption,script,scenes.
scenes مصفوفة من 4 عناصر، كل عنصر {heading,text}. النص قصير ومناسب لشاشة عمودية.
لا تخترع مواعيد أو خدمات أو ضمانات. يجب أن يتضمن script اسم الحساب في البداية والنهاية ليُنطق في الفيديو."""
        prompt = json.dumps({"account": {"name": account["name"], "username": account.get("username"),
            "kind": kind, "services": account.get("settings", {}).get("services", []),
            "phone": account.get("phone_replacement", ""), "settings": account.get("settings", {})},
            "brief": brief, "learning": learning, "fallback_structure": fallback}, ensure_ascii=False)
        try:
            text, provider = await self.providers.complete(system, prompt, 1800)
            value = _json_object(text)
            scenes = value.get("scenes")
            if not isinstance(scenes, list) or len(scenes) < 2:
                raise ValueError("المشاهد غير مكتملة")
            clean_scenes = [{"heading": str(item.get("heading", f"0{i+1}"))[:18], "text": str(item.get("text", ""))[:240]}
                            for i, item in enumerate(scenes[:6]) if isinstance(item, dict) and item.get("text")]
            result = {"title": str(value.get("title") or fallback["title"])[:100],
                      "caption": str(value.get("caption") or fallback["caption"])[:6000],
                      "script": str(value.get("script") or fallback["script"])[:4000], "scenes": clean_scenes}
            if account["name"] not in result["script"]:
                result["script"] = f"معك {account['name']}. " + result["script"]
            return result, provider, ""
        except (ProviderError, ValueError, json.JSONDecodeError) as exc:
            return fallback, "local_rules", f"استُخدم التوليد المحلي لأن مزود الذكاء الاصطناعي لم يكتمل: {str(exc)[:300]}"

    async def create_project(self, data: dict[str, Any]) -> dict[str, Any]:
        account = self.account(data["account_id"])
        kind = data.get("kind") or account.get("settings", {}).get("account_kind", "student_promo")
        if data.get("source_mode") == "reuse":
            if data.get("output_format") != "video":
                raise StudioError("إعادة استخدام الوسائط المصرح بها متاحة للفيديو العمودي فقط")
            if not data.get("rights_confirmed"):
                raise StudioError("أكد أنك تملك الفيديو أو لديك إذن صريح لإعادة استخدامه")
            asset = self.store.get_asset(str(data.get("source_asset_id") or ""))
            if not asset or asset["account_id"] != account["id"]:
                raise StudioError("اختر فيديو مرفوعًا لهذا الحساب")
        generated, provider, warning = await self.generate_copy(account, data.get("brief", ""), kind, bool(data.get("use_ai", False)))
        project = self.store.create_project({**data, **generated, "kind": kind, "provider": provider})
        if warning:
            project = self.store.update_project(project["id"], {"warning": warning}) or project
        self.db.add_event("studio_created", f"أُنشئت مسودة «{project['title']}» بمزود {provider}", account["id"])
        return project

    async def update_project(self, project_id: str, data: dict[str, Any]) -> dict[str, Any]:
        project = self.project(project_id)
        if project["status"] in {"rendering", "publishing", "published"}:
            raise StudioError("لا يمكن تعديل مشروع أثناء التنفيذ أو بعد نشره")
        if "scenes" in data:
            if not isinstance(data["scenes"], list) or not data["scenes"]:
                raise StudioError("أضف مشهدًا واحدًا على الأقل")
            data["scenes"] = [{"heading": str(item.get("heading", f"0{i+1}"))[:18],
                               "text": str(item.get("text", ""))[:240]} for i, item in enumerate(data["scenes"][:8])]
        allowed = {key: value for key, value in data.items() if key in {
            "title", "brief", "caption", "script", "scenes", "platforms", "voice", "template", "output_format"
        }}
        if project["source_mode"] == "reuse" and allowed.get("output_format", "video") != "video":
            raise StudioError("لا يمكن تحويل مشروع إعادة الاستخدام إلى صورة أو نص")
        if allowed:
            # أي تغيير بعد التجهيز يلغي الملف القديم كي لا يُنشر نص جديد مع وسائط قديمة.
            allowed.update({"status": "draft", "scheduled_at": None, "output_path": None, "cover_path": None,
                            "voice_path": None, "voice_provider": None, "error": None})
        return self.store.update_project(project_id, allowed)  # type: ignore[return-value]

    async def request_render(self, project_id: str) -> dict[str, Any]:
        project = self.project(project_id)
        if project["status"] in {"rendering", "publishing", "published"}:
            raise StudioError("المشروع قيد التنفيذ أو منشور بالفعل")
        if not project["script"].strip() and project["output_format"] == "video":
            raise StudioError("اكتب التعليق الصوتي أولًا")
        if project["source_mode"] == "reuse" and not project["rights_confirmed"]:
            raise StudioError("تأكيد حقوق إعادة الاستخدام مطلوب")
        self.store.update_project(project_id, {"status": "draft", "error": None, "warning": None})
        self.db.enqueue("studio_render", project["account_id"], project_id, max_attempts=2,
                        payload={"idempotency_key": project["idempotency_key"]})
        return self.project(project_id)

    async def render(self, project_id: str) -> dict[str, Any]:
        project = self.project(project_id)
        if project["status"] == "published" or (project.get("output_path") and project["status"] == "ready"):
            return project
        account = self.account(project["account_id"])
        self.store.update_project(project_id, {"status": "rendering", "error": None})
        output_dir = self.settings.data_dir / "studio" / project_id
        output_dir.mkdir(parents=True, exist_ok=True)
        try:
            if project["output_format"] == "text":
                result = self.store.update_project(project_id, {"status": "ready", "output_path": None, "cover_path": None})
            elif project["source_mode"] == "reuse":
                result = await self._render_reuse(project, account, output_dir)
            elif project["output_format"] == "image":
                cover = output_dir / "post.png"
                # المشهد الأول تعريفي غالبًا؛ الصورة المنشورة تعرض الإعلان أو الخدمة نفسها.
                content_index = 1 if len(project["scenes"]) > 1 else 0
                await asyncio.to_thread(self._render_scene, project, account, project["scenes"][content_index], content_index, cover, 1080, 1350)
                result = self.store.update_project(project_id, {"status": "ready", "output_path": str(cover.relative_to(self.settings.data_dir)),
                    "cover_path": str(cover.relative_to(self.settings.data_dir)), "voice_provider": None})
            else:
                result = await self._render_generated(project, account, output_dir)
            self.db.add_event("studio_ready", f"اكتمل تجهيز «{project['title']}» وأصبح متاحًا للتنزيل", account["id"])
            return result  # type: ignore[return-value]
        except Exception as exc:
            self.store.update_project(project_id, {"status": "failed", "error": str(exc)[:1600]})
            self.db.add_event("studio_render_failed", str(exc)[:900], account["id"], "error")
            raise

    def _brand(self, account: dict[str, Any]) -> dict[str, str]:
        config = self.media.template_config(account)
        return {"bg": config["background"], "surface": config["surface"], "text": config["text"],
                "muted": config["muted"], "accent": config["accent"]}

    def _draw_text(self, draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font: Any,
                   fill: str, anchor: str = "ra") -> None:
        shaped, kwargs = self.media._prepare_text(text)
        draw.text(xy, shaped, font=font, fill=fill, anchor=anchor, **kwargs)

    def _wrap(self, draw: ImageDraw.ImageDraw, text: str, font: Any, width: int) -> list[str]:
        _, kwargs = self.media._prepare_text(text)
        return self.media._wrap(draw, text, font, width, kwargs)

    def _render_scene(self, project: dict[str, Any], account: dict[str, Any], scene: dict[str, Any],
                      index: int, output: Path, width: int = 720, height: int = 1280) -> None:
        brand = self._brand(account)
        base = Image.new("RGB", (width, height), brand["bg"])
        # تعريج لوني هادئ مرسوم محليًا؛ لا صور خارجية ولا موارد مدفوعة.
        glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse((-width // 2, -height // 8, width, height // 2), fill=brand["accent"] + "38")
        gd.ellipse((width // 2, height * 3 // 5, width * 3 // 2, height * 6 // 5), fill=brand["accent"] + "20")
        glow = glow.filter(ImageFilter.GaussianBlur(width // 7))
        base = Image.alpha_composite(base.convert("RGBA"), glow)
        draw = ImageDraw.Draw(base)
        margin = int(width * 0.075)
        small = self.media._font(max(22, width // 28), True)
        tiny = self.media._font(max(18, width // 38), False)
        # علامة الحساب ظاهرة في كل مشهد.
        logo = self.media._logo_path(account)
        if logo.exists():
            with Image.open(logo) as original:
                mark = original.convert("RGBA")
                mark.thumbnail((width // 10, width // 10), Image.Resampling.LANCZOS)
                base.alpha_composite(mark, (width - margin - mark.width, margin))
        self._draw_text(draw, (width - margin - width // 9, margin + 5), account["name"], small, brand["text"])
        handle = account.get("username", "").strip().lstrip("@")
        self._draw_text(draw, (margin, margin + 10), f"@{handle}" if handle else "محتوى طلابي", tiny, brand["muted"], "la")
        line_y = margin + width // 8
        draw.line((margin, line_y, width - margin, line_y), fill=brand["surface"], width=max(2, width // 360))
        # رقم المشهد وعنصر بصري كبير غير مزخرف زيادة.
        self._draw_text(draw, (margin, line_y + margin // 2), str(scene.get("heading") or f"0{index+1}"), small, brand["accent"], "la")
        max_text_width = width - margin * 2
        size = int(width * (0.074 if len(scene.get("text", "")) < 90 else 0.061))
        while size > 29:
            font = self.media._font(size, True)
            lines = self._wrap(draw, scene.get("text", ""), font, max_text_width)
            if len(lines) * int(size * 1.55) < height * 0.48:
                break
            size -= 2
        font = self.media._font(size, True)
        lines = self._wrap(draw, scene.get("text", ""), font, max_text_width)
        line_height = int(size * 1.55)
        y = int(height * 0.34)
        for line in lines[:8]:
            self._draw_text(draw, (width - margin, y), line, font, brand["text"])
            y += line_height
        # مؤشر المشاهد وتذييل ثابت بالمعرف.
        footer_y = height - margin - 35
        for i in range(len(project.get("scenes", []))):
            x = margin + i * width // 28
            draw.rounded_rectangle((x, footer_y, x + (width // 22 if i == index else width // 55), footer_y + 5),
                                   radius=3, fill=brand["accent"] if i == index else brand["surface"])
        self._draw_text(draw, (width - margin, footer_y - 12), handle and f"@{handle}" or account["name"], tiny, brand["accent"])
        output.parent.mkdir(parents=True, exist_ok=True)
        base.convert("RGB").save(output, "PNG", optimize=True)

    async def _speech(self, text: str, voice: str, output_dir: Path) -> tuple[Path | None, str, str]:
        try:
            import edge_tts
            target = output_dir / "narration.mp3"
            communicate = edge_tts.Communicate(text, voice, rate="+0%", volume="+0%")
            await asyncio.wait_for(communicate.save(str(target)), timeout=90)
            if target.exists() and target.stat().st_size > 500:
                return target, "edge-tts", ""
        except Exception as exc:  # noqa: BLE001 - المزود الصوتي اختياري وله بديل محلي.
            edge_error = str(exc)[:240]
        executable = shutil.which("espeak-ng") or shutil.which("espeak")
        if executable:
            target = output_dir / "narration.wav"
            process = await asyncio.create_subprocess_exec(executable, "-v", "ar", "-s", "150", "-w", str(target), text,
                                                           stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            _, stderr = await asyncio.wait_for(process.communicate(), timeout=60)
            if process.returncode == 0 and target.exists():
                return target, "espeak-offline", "استُخدم الصوت المحلي بعد تعذر الصوت العصبي"
            edge_error += "؛ " + stderr.decode(errors="ignore")[:160]
        return None, "captions_only", "تعذر توليد الصوت؛ أُنتج الفيديو بالنصوص ومسار صامت. ثبّت edge-tts أو espeak-ng. " + edge_error

    async def _duration(self, path: Path | None) -> float:
        if not path:
            return 0
        metadata = await self.media.probe(path)
        try:
            return float(metadata.get("format", {}).get("duration", 0))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    async def _run(command: list[str], timeout: int = 600) -> None:
        process = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        _, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        if process.returncode != 0:
            raise StudioError("فشل FFmpeg: " + stderr.decode(errors="ignore")[-800:])

    async def _render_generated(self, project: dict[str, Any], account: dict[str, Any], output_dir: Path) -> dict[str, Any]:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise StudioError("FFmpeg غير مثبت")
        scenes = project["scenes"]
        images = []
        for index, scene in enumerate(scenes):
            path = output_dir / f"scene-{index}.png"
            await asyncio.to_thread(self._render_scene, project, account, scene, index, path)
            images.append(path)
        speech, voice_provider, warning = await self._speech(project["script"], project["voice"], output_dir)
        speech_duration = await self._duration(speech)
        total = min(150, max(len(scenes) * 3.6, speech_duration + 1.0))
        durations = [total / len(scenes)] * len(scenes)
        segments = []
        fps = 24
        for index, (image, duration) in enumerate(zip(images, durations, strict=True)):
            segment = output_dir / f"segment-{index}.mp4"
            frames = max(1, math.ceil(duration * fps))
            fade_out = max(0, duration - 0.28)
            vf = (f"scale=800:1422:force_original_aspect_ratio=increase,crop=800:1422,"
                  f"zoompan=z='min(zoom+0.00035,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=720x1280:fps={fps},"
                  f"fade=t=in:st=0:d=0.22,fade=t=out:st={fade_out:.3f}:d=0.28,format=yuv420p")
            await self._run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", str(image),
                "-vf", vf, "-t", f"{duration:.3f}", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", str(segment)])
            segments.append(segment)
        concat = output_dir / "segments.txt"
        concat.write_text("".join(f"file '{path.name}'\n" for path in segments), encoding="utf-8")
        video_only = output_dir / "video-only.mp4"
        await self._run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
                         "-c", "copy", str(video_only)])
        output = output_dir / "vertical.mp4"
        if speech:
            await self._run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(video_only), "-i", str(speech),
                "-map", "0:v", "-map", "1:a", "-af", "apad", "-t", f"{total:.3f}", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart", str(output)])
        else:
            await self._run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(video_only),
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-map", "0:v", "-map", "1:a",
                "-t", f"{total:.3f}", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", str(output)])
        status = "scheduled" if project.get("scheduled_at") else "ready"
        return self.store.update_project(project["id"], {"status": status, "output_path": str(output.relative_to(self.settings.data_dir)),
            "cover_path": str(images[0].relative_to(self.settings.data_dir)), "voice_path": str(speech.relative_to(self.settings.data_dir)) if speech else None,
            "voice_provider": voice_provider, "warning": warning or None})  # type: ignore[return-value]

    async def _render_reuse(self, project: dict[str, Any], account: dict[str, Any], output_dir: Path) -> dict[str, Any]:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise StudioError("FFmpeg غير مثبت")
        asset = self.store.get_asset(project.get("source_asset_id") or "")
        if not asset:
            raise StudioError("الفيديو المصدر غير موجود")
        source = (self.settings.data_dir / asset["path"]).resolve()
        source.relative_to(self.settings.data_dir.resolve())
        if not source.is_file():
            raise StudioError("ملف الفيديو المصدر غير موجود")
        overlay = output_dir / "brand-overlay.png"
        await asyncio.to_thread(self._render_overlay, project, account, overlay)
        cover = output_dir / "cover.png"
        await asyncio.to_thread(self._render_scene, project, account, project["scenes"][0], 0, cover)
        speech, voice_provider, warning = await self._speech(project["script"], project["voice"], output_dir)
        source_duration = await self._duration(source)
        speech_duration = await self._duration(speech)
        # لا نقطع التعليق الصوتي عند نهاية مقطع قصير؛ نكرر الصورة حتى نهاية الصوت.
        duration = min(90, max(source_duration or 30, speech_duration + 0.6 if speech else 0))
        loop_source = bool(speech and speech_duration + 0.6 > source_duration)
        output = output_dir / "vertical.mp4"
        graph = ("[0:v]split[bgs][fgs];[bgs]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,gblur=sigma=28[bg];"
                 "[fgs]scale=720:1280:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[base];"
                 "[1:v]format=rgba[brand];[base][brand]overlay=0:0,format=yuv420p[v]")
        command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
        if loop_source:
            command += ["-stream_loop", "-1"]
        command += ["-i", str(source), "-loop", "1", "-i", str(overlay)]
        if speech:
            command += ["-i", str(speech)]
        command += ["-filter_complex", graph, "-map", "[v]"]
        if speech:
            command += ["-map", "2:a"]
        else:
            command += ["-map", "0:a?"]
        if speech:
            command += ["-af", "apad"]
        command += ["-t", f"{duration:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "128k",
                    "-movflags", "+faststart", str(output)]
        await self._run(command, 900)
        status = "scheduled" if project.get("scheduled_at") else "ready"
        return self.store.update_project(project["id"], {"status": status, "output_path": str(output.relative_to(self.settings.data_dir)),
            "cover_path": str(cover.relative_to(self.settings.data_dir)), "voice_path": str(speech.relative_to(self.settings.data_dir)) if speech else None,
            "voice_provider": voice_provider, "warning": warning or None})  # type: ignore[return-value]

    def _render_overlay(self, project: dict[str, Any], account: dict[str, Any], output: Path) -> None:
        width, height = 720, 1280
        brand = self._brand(account)
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((30, 30, 690, 145), radius=20, fill=brand["bg"] + "e8")
        self._draw_text(draw, (660, 54), account["name"], self.media._font(31, True), brand["text"])
        handle = account.get("username", "").strip().lstrip("@")
        self._draw_text(draw, (660, 101), f"@{handle}" if handle else "إعادة إنتاج بإذن", self.media._font(21), brand["accent"])
        draw.rounded_rectangle((55, 1135, 665, 1230), radius=18, fill=brand["bg"] + "e8")
        self._draw_text(draw, (635, 1162), account.get("settings", {}).get("cta") or f"تابع {account['name']}", self.media._font(26, True), brand["text"])
        image.save(output)

    def file_path(self, project_id: str, kind: str) -> tuple[Path, str]:
        project = self.project(project_id)
        key = {"video": "output_path", "file": "output_path", "cover": "cover_path", "audio": "voice_path"}.get(kind)
        if kind == "caption":
            target = self.settings.data_dir / "studio" / project_id / "caption.txt"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(project["caption"], encoding="utf-8")
            return target, "text/plain; charset=utf-8"
        if not key or not project.get(key):
            raise StudioError("الملف المطلوب غير جاهز")
        path = (self.settings.data_dir / project[key]).resolve()
        path.relative_to(self.settings.data_dir.resolve())
        if not path.is_file():
            raise StudioError("الملف غير موجود على القرص")
        media_type = "video/mp4" if path.suffix == ".mp4" else "image/png" if path.suffix == ".png" else "application/octet-stream"
        return path, media_type

    async def schedule(self, project_id: str, scheduled_at: str | None = None) -> dict[str, Any]:
        project = self.project(project_id)
        if project["status"] not in {"ready", "scheduled", "failed"} or (project["output_format"] != "text" and not project.get("output_path")):
            raise StudioError("جهّز المحتوى أولًا ثم حدد موعد النشر")
        account = self.account(project["account_id"])
        if not scheduled_at:
            scheduled_at = self.store.next_slot(account["id"], account.get("settings", {}).get("posting_times", []))
        try:
            parsed = datetime.fromisoformat(scheduled_at)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            scheduled_at = parsed.isoformat(timespec="seconds")
        except ValueError as exc:
            raise StudioError("صيغة الموعد غير صالحة") from exc
        result = self.store.update_project(project_id, {"scheduled_at": scheduled_at, "status": "scheduled", "error": None})
        self.db.add_event("studio_scheduled", f"حُدد موعد «{project['title']}»: {scheduled_at}", account["id"])
        return result  # type: ignore[return-value]

    async def unschedule(self, project_id: str) -> dict[str, Any]:
        project = self.project(project_id)
        if project["status"] in {"publishing", "published", "publish_unknown"}:
            raise StudioError("لا يمكن سحب المشروع في حالته الحالية")
        return self.store.update_project(project_id, {"status": "ready", "scheduled_at": None})  # type: ignore[return-value]

    async def publish(self, project_id: str) -> dict[str, Any]:
        project = self.project(project_id)
        if project["status"] == "published" or project.get("publication", {}).get("receipt"):
            return project
        if project["status"] == "publish_unknown":
            return project
        if project["status"] == "publishing":
            # توقف التطبيق بعد بدء محاولة النشر؛ لا يمكن الجزم هل وصل المنشور.
            return self.store.update_project(project_id, {"status": "publish_unknown",
                "error": "استؤنف التطبيق أثناء محاولة نشر سابقة؛ تحقق من المنصة قبل أي إجراء"})  # type: ignore[return-value]
        account = self.account(project["account_id"])
        if self.settings.dry_run or not self.settings.publishing_enabled:
            self.store.update_project(project_id, {"status": "ready", "error": None})
            self.db.add_event("studio_export_ready", "الموعد مستحق ووضع الاختبار منع الإرسال؛ الملف جاهز للتنزيل والنشر اليدوي", account["id"])
            return self.project(project_id)
        session_url = workflows()["platforms"][account["platform"]].get("session_url", "https://www.google.com/")
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=6), follow_redirects=True) as client:
                await client.head(session_url)
        except (httpx.NetworkError, httpx.TimeoutException) as exc:
            self.store.update_project(project_id, {"status": "scheduled", "error": "لا يوجد اتصال؛ سيبقى الموعد في الطابور"})
            raise OfflineError("انقطع الاتصال قبل بدء النشر؛ لم تُرسل العملية") from exc
        self.store.update_project(project_id, {"status": "publishing", "error": None})
        media = []
        if project.get("output_path"):
            media.append({"kind": "video" if project["output_format"] == "video" else "image", "url": "",
                          "processed_path": project["output_path"]})
        pseudo = {"id": project["id"], "processed_text": project["caption"], "raw_text": project["caption"], "media": media}
        try:
            receipt = await self.publisher.publish(account, pseudo)
            publication = {"receipt": receipt, "published_at": utcnow(), "idempotency_key": project["idempotency_key"]}
            self.store.update_project(project_id, {"status": "published", "publication": publication, "error": None})
            self.db.add_event("studio_published", f"تأكد نشر «{project['title']}»", account["id"])
        except PublishUnknown as exc:
            self.store.update_project(project_id, {"status": "publish_unknown", "error": str(exc)})
            self.db.add_event("studio_publish_unknown", str(exc), account["id"], "warning")
        except BrowserError as exc:
            self.store.update_project(project_id, {"status": "failed", "error": str(exc)})
            self.db.add_event("studio_publish_failed", str(exc), account["id"], "error")
        return self.project(project_id)

    async def confirm(self, project_id: str, status: str, note: str = "") -> dict[str, Any]:
        project = self.project(project_id)
        if status == "published":
            if project["status"] == "published" and project.get("publication", {}).get("receipt"):
                return project
            if project["status"] not in {"ready", "scheduled", "failed", "publish_unknown"}:
                raise StudioError("جهّز الملف أولًا؛ لا يمكن تأكيد نشر مسودة أو عملية جارية")
            return self.store.update_project(project_id, {"status": "published", "error": None,
                "publication": {"receipt": {"manual_confirmation": note or "نشره المستخدم يدويًا"}, "published_at": utcnow(),
                                "idempotency_key": project["idempotency_key"]}})  # type: ignore[return-value]
        if project["status"] != "publish_unknown":
            raise StudioError("تسجيل «لم يُنشر» متاح للنتيجة غير المؤكدة فقط")
        return self.store.update_project(project_id, {"status": "failed", "error": note or "أكد المستخدم أن المنشور لم يصل"})  # type: ignore[return-value]

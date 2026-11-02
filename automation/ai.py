from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx

from .config import Settings, reset_settings_cache
from .db import Database
from .models import AIClassification
from .providers import ProviderError, ProviderStore


class AIError(RuntimeError):
    pass


def parse_json_object(text: str) -> dict[str, Any]:
    """واجهة متوافقة مع الإصدارات السابقة والاختبارات والإضافات المحلية."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE | re.DOTALL).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise AIError("لم يُرجع النموذج JSON صالحًا")
        try:
            value = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise AIError("تعذر تفسير JSON المُرجع") from exc
    if not isinstance(value, dict):
        raise AIError("استجابة النموذج ليست كائن JSON")
    return value


extract_json = parse_json_object


class AIProvider:
    def __init__(self, settings: Settings, db: Database):
        self.settings = settings
        self.db = db
        self.providers = ProviderStore(settings)

    def public_config(self) -> dict[str, Any]:
        return self.settings.public_ai_config()

    async def list_models(self) -> list[str]:
        provider = next((p for p in self.providers.all(include_keys=True) if p.get("enabled", True)), None)
        if not provider:
            raise AIError("لا يوجد مزود مفعّل")
        headers = {"Authorization": f"Bearer {provider['api_key']}"}
        try:
            async with httpx.AsyncClient(timeout=float(provider.get("timeout_seconds", 45))) as client:
                response = await client.get(str(provider["base_url"]).rstrip("/") + "/models", headers=headers)
                response.raise_for_status()
                return [str(item["id"]) for item in response.json().get("data", []) if item.get("id")]
        except Exception as exc:
            raise AIError(str(exc)) from exc

    async def test_connection(self, model: str | None = None) -> dict[str, Any]:
        providers = self.providers.all(include_keys=True)
        if not providers:
            raise AIError("لا يوجد مزود مفعّل")
        provider = providers[0]
        if model:
            provider = {**provider, "model": model}
        started = time.monotonic()
        text = await self.providers._request(provider, "أجب بكلمة تم فقط", "اختبار الاتصال", 24)
        return {"ok": True, "requested_model": provider["model"], "resolved_model": provider["model"],
                "seconds": round(time.monotonic() - started, 2), "reply": text[:100]}

    async def _complete(self, system: str, prompt: str, max_tokens: int = 1800) -> str:
        try:
            text, _ = await self.providers.complete(system, prompt, max_tokens)
            return text
        except ProviderError as exc:
            raise AIError(str(exc)) from exc

    async def classify_post(self, account: dict[str, Any], source: dict[str, Any] | None,
                            post: dict[str, Any], ocr_text: str = "") -> AIClassification:
        context = self.db.learning_context(account["id"])
        system = """أنت محرر جامعي عربي دقيق. أعد JSON فقط بالمفاتيح:
decision (publish/ignore/review), reason, category, confidence (0..1), important, replace_phone, cleaned_text.
لا تخترع مواعيد أو أخبارًا. احذف الإعلانات غير المرتبطة، ولا تستبدل أرقام التواصل الرسمية إلا في خدمات الطلبة.
التزم بالتعليمات الدائمة وأسباب القبول والرفض السابقة، وعند الشك اختر review."""
        prompt = json.dumps({
            "account": {"name": account["name"], "platform": account["platform"], "settings": account.get("settings", {})},
            "source": source or {}, "post": {"text": post.get("raw_text", ""), "author": post.get("author", ""),
            "url": post.get("url", ""), "ocr": ocr_text}, "learning": context,
        }, ensure_ascii=False)
        try:
            data = extract_json(await self._complete(system, prompt, 1300))
            return AIClassification.model_validate(data)
        except (AIError, ValueError) as exc:
            raise AIError(str(exc)) from exc

    async def rebuild_profile(self, account: dict[str, Any], posts: list[dict[str, Any]]) -> dict[str, Any]:
        system = "حلّل أسلوب الحساب العربي وأعد JSON فقط: dialect, topics (array), style_notes, publishing_guidelines. لا تخترع حقائق."
        prompt = json.dumps({"account": account["name"], "posts": [
            {"text": p.get("processed_text") or p.get("raw_text", ""), "category": p.get("category")} for p in posts
        ]}, ensure_ascii=False)
        try:
            profile = extract_json(await self._complete(system, prompt, 1200))
        except AIError:
            if not posts:
                raise
            profile = {"dialect": "عربية واضحة من سجل الحساب", "topics": [], "style_notes": "ملف محلي مؤقت؛ أعد التحليل عند توفر مزود.", "publishing_guidelines": "المراجعة البشرية قبل النشر."}
        self.db.save_profile(account["id"], profile)
        return profile

    async def chat(self, account: dict[str, Any] | None, message: str) -> str:
        account_id = account["id"] if account else None
        self.db.add_chat(account_id, "user", message)
        context = self.db.learning_context(account_id) if account_id else {}
        history = self.db.list_chat(account_id, 12)[:-1]
        system = "أنت مساعد إعداد نظام محتوى عربي. أجب بخطوات عملية ولا تدّعِ تنفيذ إجراء لم يحدث."
        prompt = json.dumps({"message": message, "account": account or {}, "learning": context, "history": history}, ensure_ascii=False)
        try:
            answer = await self._complete(system, prompt, 1400)
        except AIError as exc:
            answer = f"تعذر الوصول لأي مزود حاليًا. المحتوى والجدولة المحليان يعملان دون مفتاح. التفاصيل: {exc}"
        self.db.add_chat(account_id, "assistant", answer)
        return answer


def update_ai_environment(**values: Any) -> None:
    from .server import write_env
    write_env(**values)
    reset_settings_cache()

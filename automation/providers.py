from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

import httpx

from .config import Settings


class ProviderError(RuntimeError):
    pass


class ProviderStore:
    """سلسلة OpenAI-compatible محلية الإعداد؛ المفاتيح في ملف خاص ولا تظهر في API."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.path = settings.data_dir / "ai_providers.json"

    def _read(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, OSError):
            return []

    def _write(self, providers: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(providers, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            os.chmod(temporary, 0o600)
        except OSError:
            pass
        temporary.replace(self.path)

    def all(self, include_keys: bool = False) -> list[dict[str, Any]]:
        providers = self._read()
        if not providers and self.settings.ai_api_key and self.settings.ai_api_key.get_secret_value():
            providers = [{
                "id": "environment", "name": "المزود الأساسي", "base_url": self.settings.ai_base_url,
                "model": self.settings.ai_model, "api_key": self.settings.ai_api_key.get_secret_value(),
                "timeout_seconds": self.settings.ai_timeout_seconds, "enabled": True, "priority": 10,
            }]
        providers.sort(key=lambda item: (int(item.get("priority", 100)), str(item.get("name", ""))))
        if include_keys:
            return providers
        return [{key: value for key, value in item.items() if key != "api_key"} | {
            "key_configured": bool(item.get("api_key")),
            "key_hint": ("••••" + str(item.get("api_key"))[-4:]) if item.get("api_key") else "",
        } for item in providers]

    def upsert(self, data: dict[str, Any], provider_id: str | None = None) -> dict[str, Any]:
        providers = self._read()
        existing = next((item for item in providers if item["id"] == provider_id), None) if provider_id else None
        if provider_id and not existing:
            raise ValueError("المزود غير موجود")
        item = dict(existing or {})
        item.update({key: value for key, value in data.items() if key in {
            "name", "base_url", "model", "timeout_seconds", "enabled", "priority"
        } and value is not None})
        if data.get("api_key"):
            item["api_key"] = str(data["api_key"]).strip()
        if not existing:
            item["id"] = uuid.uuid4().hex[:12]
            item.setdefault("name", "مزود جديد")
            item.setdefault("base_url", "https://api.openai.com/v1")
            item.setdefault("model", "auto")
            item.setdefault("timeout_seconds", 45)
            item.setdefault("enabled", True)
            item.setdefault("priority", (max([int(p.get("priority", 0)) for p in providers] or [0]) + 10))
        item["base_url"] = str(item["base_url"]).strip().rstrip("/").removesuffix("/chat/completions").removesuffix("/models")
        if not item["base_url"].startswith(("https://", "http://")):
            raise ValueError("رابط المزود يجب أن يبدأ بـ https:// أو http://")
        if not item.get("api_key") and not existing:
            raise ValueError("أدخل مفتاح المزود؛ لن يظهر كاملًا بعد الحفظ")
        providers = [item if p["id"] == item["id"] else p for p in providers]
        if not existing:
            providers.append(item)
        self._write(providers)
        return next(p for p in self.all() if p["id"] == item["id"])

    def delete(self, provider_id: str) -> bool:
        providers = self._read()
        remaining = [item for item in providers if item["id"] != provider_id]
        if len(remaining) == len(providers):
            return False
        self._write(remaining)
        return True

    async def test(self, provider_id: str) -> dict[str, Any]:
        provider = next((item for item in self.all(include_keys=True) if item["id"] == provider_id), None)
        if not provider:
            raise ValueError("المزود غير موجود")
        started = time.monotonic()
        text = await self._request(provider, "أجب بكلمة: تم", "اختبار اتصال قصير.", max_tokens=24)
        return {"ok": True, "provider_id": provider_id, "model": provider["model"],
                "seconds": round(time.monotonic() - started, 2), "reply": text[:100]}

    async def complete(self, system: str, prompt: str, max_tokens: int = 1800) -> tuple[str, str]:
        errors = []
        for provider in self.all(include_keys=True):
            if not provider.get("enabled", True) or not provider.get("api_key"):
                continue
            try:
                return await self._request(provider, system, prompt, max_tokens), str(provider.get("name") or provider["id"])
            except Exception as exc:  # noqa: BLE001 - الانتقال للمزود التالي هو الغرض من السلسلة.
                errors.append(f"{provider.get('name', provider['id'])}: {str(exc)[:240]}")
        raise ProviderError("؛ ".join(errors) if errors else "لا يوجد مزود ذكاء اصطناعي مفعّل؛ استخدم التوليد المحلي")

    async def _request(self, provider: dict[str, Any], system: str, prompt: str, max_tokens: int) -> str:
        base = str(provider["base_url"]).rstrip("/")
        model = str(provider.get("model") or "auto")
        timeout = httpx.Timeout(float(provider.get("timeout_seconds", 45)), connect=12)
        headers = {"Authorization": f"Bearer {provider['api_key']}", "Content-Type": "application/json"}
        payload: dict[str, Any] = {
            "model": model, "temperature": 0.35, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            if model == "auto":
                response = await client.get(base + "/models", headers=headers)
                response.raise_for_status()
                models = response.json().get("data", [])
                candidates = [str(item.get("id")) for item in models if item.get("id")]
                if not candidates:
                    raise ProviderError("النماذج المتاحة فارغة؛ حدد اسم النموذج يدويًا")
                payload["model"] = candidates[0]
            try:
                response = await client.post(base + "/chat/completions", headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                text = data["choices"][0]["message"]["content"]
                if isinstance(text, list):
                    text = "\n".join(str(part.get("text", "")) for part in text if isinstance(part, dict))
                if not str(text).strip():
                    raise ProviderError("الاستجابة فارغة")
                return str(text).strip()
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:300]
                raise ProviderError(f"HTTP {exc.response.status_code}: {detail}") from exc
            except (httpx.TimeoutException, httpx.NetworkError, KeyError, IndexError, TypeError) as exc:
                raise ProviderError(f"تعذر الاتصال أو قراءة الاستجابة: {exc}") from exc

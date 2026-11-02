from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


def utcnow() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:16]


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def loads(value: str | None, default: Any) -> Any:
    try:
        return json.loads(value) if value else default
    except (json.JSONDecodeError, TypeError):
        return default


class StudioStore:
    """مخزون الإنتاج والجدولة؛ كل انتقال حالة محفوظ قبل تنفيذ الشبكة."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        with self.lock:
            conn = sqlite3.connect(self.path, timeout=30)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=30000")
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

    def initialize(self) -> None:
        with self.connect() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS studio_assets (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                path TEXT NOT NULL,
                original_name TEXT NOT NULL DEFAULT '',
                source_url TEXT NOT NULL DEFAULT '',
                rights_note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS studio_projects (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                title TEXT NOT NULL,
                brief TEXT NOT NULL DEFAULT '',
                kind TEXT NOT NULL DEFAULT 'student_promo',
                source_mode TEXT NOT NULL DEFAULT 'generated',
                output_format TEXT NOT NULL DEFAULT 'video',
                platforms_json TEXT NOT NULL DEFAULT '[]',
                caption TEXT NOT NULL DEFAULT '',
                script TEXT NOT NULL DEFAULT '',
                scenes_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'draft',
                scheduled_at TEXT,
                voice TEXT NOT NULL DEFAULT 'ar-SA-HamedNeural',
                template TEXT NOT NULL DEFAULT 'service_spotlight',
                source_asset_id TEXT,
                rights_confirmed INTEGER NOT NULL DEFAULT 0,
                output_path TEXT,
                cover_path TEXT,
                voice_path TEXT,
                provider TEXT NOT NULL DEFAULT 'local_rules',
                voice_provider TEXT,
                error TEXT,
                warning TEXT,
                idempotency_key TEXT NOT NULL UNIQUE,
                publication_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_studio_account ON studio_projects(account_id,created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_studio_schedule ON studio_projects(status,scheduled_at);
            CREATE INDEX IF NOT EXISTS idx_studio_assets_account ON studio_assets(account_id,created_at DESC);
            """)

    @staticmethod
    def _project(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        item = dict(row)
        item["platforms"] = loads(item.pop("platforms_json", "[]"), [])
        item["scenes"] = loads(item.pop("scenes_json", "[]"), [])
        item["publication"] = loads(item.pop("publication_json", "{}"), {})
        item["rights_confirmed"] = bool(item["rights_confirmed"])
        return item

    def create_project(self, data: dict[str, Any]) -> dict[str, Any]:
        project_id, now = new_id(), utcnow()
        key = str(data.get("idempotency_key") or f"studio:{project_id}")
        with self.connect() as conn:
            conn.execute("""INSERT INTO studio_projects(
                id,account_id,title,brief,kind,source_mode,output_format,platforms_json,caption,script,
                scenes_json,status,scheduled_at,voice,template,source_asset_id,rights_confirmed,
                provider,idempotency_key,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                project_id, data["account_id"], data.get("title") or "مسودة بلا عنوان", data.get("brief", ""),
                data.get("kind", "student_promo"), data.get("source_mode", "generated"),
                data.get("output_format", "video"), dumps(data.get("platforms", [])), data.get("caption", ""),
                data.get("script", ""), dumps(data.get("scenes", [])), data.get("status", "draft"),
                data.get("scheduled_at"), data.get("voice", "ar-SA-HamedNeural"),
                data.get("template", "service_spotlight"), data.get("source_asset_id"),
                int(bool(data.get("rights_confirmed"))), data.get("provider", "local_rules"), key, now, now,
            ))
        return self.get_project(project_id)  # type: ignore[return-value]

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute("""SELECT p.*,a.name AS account_name,a.username,a.platform AS account_platform
                FROM studio_projects p JOIN accounts a ON a.id=p.account_id WHERE p.id=?""", (project_id,)).fetchone()
        return self._project(row)

    def list_projects(self, account_id: str | None = None, status: str | None = None,
                      scheduled: bool = False, limit: int = 200) -> list[dict[str, Any]]:
        clauses, params = [], []
        if account_id:
            clauses.append("p.account_id=?"); params.append(account_id)
        if status:
            statuses = [part for part in status.split(",") if part]
            clauses.append(f"p.status IN ({','.join('?' * len(statuses))})"); params.extend(statuses)
        if scheduled:
            clauses.append("p.scheduled_at IS NOT NULL")
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        order = "p.scheduled_at IS NULL,p.scheduled_at" if scheduled else "p.created_at DESC"
        with self.connect() as conn:
            rows = conn.execute(f"""SELECT p.*,a.name AS account_name,a.username,a.platform AS account_platform
                FROM studio_projects p JOIN accounts a ON a.id=p.account_id{where}
                ORDER BY {order} LIMIT ?""", (*params, max(1, min(limit, 500)))).fetchall()
        return [self._project(row) for row in rows]  # type: ignore[misc]

    def update_project(self, project_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        allowed = {"title", "brief", "kind", "source_mode", "output_format", "caption", "script", "status",
                   "scheduled_at", "voice", "template", "source_asset_id", "output_path", "cover_path",
                   "voice_path", "provider", "voice_provider", "error", "warning"}
        updates = {key: value for key, value in data.items() if key in allowed}
        if "platforms" in data:
            updates["platforms_json"] = dumps(data["platforms"])
        if "scenes" in data:
            updates["scenes_json"] = dumps(data["scenes"])
        if "rights_confirmed" in data:
            updates["rights_confirmed"] = int(bool(data["rights_confirmed"]))
        if "publication" in data:
            updates["publication_json"] = dumps(data["publication"])
        if not updates:
            return self.get_project(project_id)
        updates["updated_at"] = utcnow()
        assignments = ",".join(f"{key}=:{key}" for key in updates)
        updates["id"] = project_id
        with self.connect() as conn:
            conn.execute(f"UPDATE studio_projects SET {assignments} WHERE id=:id", updates)
        return self.get_project(project_id)

    def delete_project(self, project_id: str) -> bool:
        with self.connect() as conn:
            return conn.execute("DELETE FROM studio_projects WHERE id=?", (project_id,)).rowcount > 0

    def create_asset(self, account_id: str, kind: str, path: str, original_name: str,
                     source_url: str = "", rights_note: str = "") -> dict[str, Any]:
        asset_id = new_id()
        with self.connect() as conn:
            conn.execute("""INSERT INTO studio_assets(id,account_id,kind,path,original_name,source_url,rights_note,created_at)
                VALUES(?,?,?,?,?,?,?,?)""", (asset_id, account_id, kind, path, original_name, source_url, rights_note, utcnow()))
        return self.get_asset(asset_id)  # type: ignore[return-value]

    def get_asset(self, asset_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM studio_assets WHERE id=?", (asset_id,)).fetchone()
        return dict(row) if row else None

    def due_projects(self, now: str | None = None) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute("""SELECT id FROM studio_projects
                WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at<=?
                ORDER BY scheduled_at LIMIT 20""", (now or utcnow(),)).fetchall()
        return [self.get_project(row["id"]) for row in rows]  # type: ignore[misc]

    def next_slot(self, account_id: str, times: list[str], start: datetime | None = None) -> str:
        """يحجز أقرب موعد فعلي غير مستخدم، بحد أقصى ثلاث خانات يوميًا افتراضيًا."""
        current = start or datetime.now(UTC)
        if current.tzinfo is None:
            current = current.replace(tzinfo=UTC)
        with self.connect() as conn:
            booked = {row[0] for row in conn.execute("""SELECT scheduled_at FROM studio_projects
                WHERE account_id=? AND scheduled_at IS NOT NULL AND status NOT IN ('rejected','failed')""", (account_id,)).fetchall()}
        clean_times = times[:3] or ["09:00", "15:00", "21:00"]
        for day in range(45):
            date = (current + timedelta(days=day)).date()
            for value in clean_times:
                try:
                    hour, minute = (int(part) for part in value.split(":", 1))
                except (ValueError, TypeError):
                    continue
                candidate = datetime(date.year, date.month, date.day, hour, minute, tzinfo=current.tzinfo)
                iso = candidate.isoformat(timespec="seconds")
                if candidate > current + timedelta(minutes=2) and iso not in booked:
                    return iso
        raise ValueError("لا توجد خانة فارغة خلال 45 يومًا؛ عدّل مواعيد النشر")

    def stats(self) -> dict[str, int]:
        with self.connect() as conn:
            result = {"total": conn.execute("SELECT COUNT(*) FROM studio_projects").fetchone()[0]}
            for key, statuses in {
                "drafts": ("draft",), "ready": ("ready",), "rendering": ("rendering",),
                "scheduled": ("scheduled",), "published": ("published",), "failed": ("failed", "publish_unknown"),
            }.items():
                result[key] = conn.execute(f"SELECT COUNT(*) FROM studio_projects WHERE status IN ({','.join('?' * len(statuses))})", statuses).fetchone()[0]
            today = datetime.now(UTC).date().isoformat()
            result["today"] = conn.execute("SELECT COUNT(*) FROM studio_projects WHERE substr(scheduled_at,1,10)=?", (today,)).fetchone()[0]
        return result

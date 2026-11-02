from __future__ import annotations

import shutil
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from .providers import ProviderError, ProviderStore
from .studio import StudioError, StudioService

router = APIRouter(prefix="/api/studio", tags=["studio"])
provider_router = APIRouter(prefix="/api/providers", tags=["providers"])


def service(request: Request) -> StudioService:
    return request.app.state.studio


class ProjectInput(BaseModel):
    account_id: str
    brief: str = Field(default="", max_length=6000)
    kind: Literal["university_news", "student_promo"] | None = None
    source_mode: Literal["generated", "reuse"] = "generated"
    output_format: Literal["video", "image", "text"] = "video"
    platforms: list[Literal["x", "facebook", "instagram", "tiktok"]] = Field(default_factory=list)
    voice: str = Field(default="ar-SA-HamedNeural", max_length=100)
    template: str = Field(default="service_spotlight", max_length=80)
    source_asset_id: str | None = None
    rights_confirmed: bool = False
    use_ai: bool = False

    @field_validator("platforms")
    @classmethod
    def unique_platforms(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class ProjectPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    brief: str | None = Field(default=None, max_length=6000)
    caption: str | None = Field(default=None, max_length=10000)
    script: str | None = Field(default=None, max_length=5000)
    scenes: list[dict[str, Any]] | None = None
    platforms: list[str] | None = None
    voice: str | None = Field(default=None, max_length=100)
    template: str | None = Field(default=None, max_length=80)
    output_format: Literal["video", "image", "text"] | None = None


class ScheduleInput(BaseModel):
    scheduled_at: str | None = None


class ConfirmInput(BaseModel):
    status: Literal["published", "failed"]
    note: str = Field(default="", max_length=1500)


class ProviderInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    base_url: str = Field(min_length=8, max_length=500)
    model: str = Field(min_length=1, max_length=150)
    api_key: str | None = Field(default=None, max_length=1000)
    timeout_seconds: float = Field(default=45, ge=5, le=180)
    enabled: bool = True
    priority: int = Field(default=100, ge=1, le=9999)


class ProviderPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    base_url: str | None = Field(default=None, min_length=8, max_length=500)
    model: str | None = Field(default=None, min_length=1, max_length=150)
    api_key: str | None = Field(default=None, max_length=1000)
    timeout_seconds: float | None = Field(default=None, ge=5, le=180)
    enabled: bool | None = None
    priority: int | None = Field(default=None, ge=1, le=9999)


@router.get("/projects")
def list_projects(request: Request, account_id: str | None = None, status: str | None = None,
                  scheduled: bool = False) -> list[dict[str, Any]]:
    return service(request).store.list_projects(account_id, status, scheduled)


@router.post("/projects", status_code=201)
async def create_project(request: Request, data: ProjectInput) -> dict[str, Any]:
    return await service(request).create_project(data.model_dump())


@router.get("/projects/{project_id}")
def get_project(request: Request, project_id: str) -> dict[str, Any]:
    return service(request).project(project_id)


@router.patch("/projects/{project_id}")
async def patch_project(request: Request, project_id: str, data: ProjectPatch) -> dict[str, Any]:
    return await service(request).update_project(project_id, data.model_dump(exclude_none=True))


@router.delete("/projects/{project_id}")
def delete_project(request: Request, project_id: str) -> dict[str, bool]:
    studio = service(request)
    project = studio.project(project_id)
    if project["status"] in {"rendering", "publishing"}:
        raise StudioError("انتظر انتهاء العملية قبل الحذف")
    result = studio.store.delete_project(project_id)
    folder = studio.settings.data_dir / "studio" / project_id
    if folder.exists():
        shutil.rmtree(folder)
    return {"ok": result}


@router.post("/projects/{project_id}/regenerate")
async def regenerate(request: Request, project_id: str, use_ai: bool = False) -> dict[str, Any]:
    studio = service(request)
    project = studio.project(project_id)
    if project["status"] not in {"draft", "failed"}:
        raise StudioError("إعادة التوليد متاحة للمسودة فقط")
    account = studio.account(project["account_id"])
    generated, provider, warning = await studio.generate_copy(account, project["brief"], project["kind"], use_ai)
    return studio.store.update_project(project_id, {**generated, "provider": provider, "warning": warning or None,
                                                   "status": "draft", "error": None})  # type: ignore[return-value]


@router.post("/projects/{project_id}/render")
async def render_project(request: Request, project_id: str) -> dict[str, Any]:
    return await service(request).request_render(project_id)


@router.get("/projects/{project_id}/file/{kind}")
def project_file(request: Request, project_id: str, kind: str, download: bool = False) -> FileResponse:
    path, media_type = service(request).file_path(project_id, kind)
    return FileResponse(path, media_type=media_type, filename=path.name if download else None,
                        content_disposition_type="attachment" if download else "inline")


@router.post("/projects/{project_id}/schedule")
async def schedule_project(request: Request, project_id: str, data: ScheduleInput) -> dict[str, Any]:
    return await service(request).schedule(project_id, data.scheduled_at)


@router.post("/projects/{project_id}/unschedule")
async def unschedule_project(request: Request, project_id: str) -> dict[str, Any]:
    return await service(request).unschedule(project_id)


@router.post("/projects/{project_id}/confirm")
async def confirm_project(request: Request, project_id: str, data: ConfirmInput) -> dict[str, Any]:
    return await service(request).confirm(project_id, data.status, data.note)


@router.post("/autoplan")
async def autoplan(request: Request, account_id: str) -> list[dict[str, Any]]:
    studio = service(request)
    studio.account(account_id)
    planned = []
    for project in studio.store.list_projects(account_id, "ready"):
        planned.append(await studio.schedule(project["id"]))
    return planned


@router.post("/assets", status_code=201)
async def upload_asset(
    request: Request,
    file: Annotated[UploadFile, File()],
    account_id: Annotated[str, Form()],
    source_url: Annotated[str, Form()] = "",
    rights_note: Annotated[str, Form()] = "",
) -> dict[str, Any]:
    studio = service(request)
    studio.account(account_id)
    suffix = Path(file.filename or "").suffix.lower()
    kind = "video" if suffix in {".mp4", ".mov", ".webm", ".mkv"} else "image" if suffix in {".png", ".jpg", ".jpeg", ".webp"} else ""
    if not kind:
        raise StudioError("الصيغ المدعومة: MP4/MOV/WebM للفيديو وPNG/JPG/WebP للصور")
    asset_id = __import__("uuid").uuid4().hex[:16]
    target_dir = studio.settings.data_dir / "studio-assets" / account_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{asset_id}{suffix}"
    size = 0
    with target.open("wb") as handle:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > studio.settings.max_download_mb * 1024 * 1024:
                handle.close()
                target.unlink(missing_ok=True)
                raise StudioError("الملف أكبر من الحد المسموح")
            handle.write(chunk)
    return studio.store.create_asset(account_id, kind, str(target.relative_to(studio.settings.data_dir)),
                                     file.filename or target.name, source_url, rights_note)


@provider_router.get("")
def providers(request: Request) -> list[dict[str, Any]]:
    return ProviderStore(request.app.state.settings).all()


@provider_router.post("", status_code=201)
def add_provider(request: Request, data: ProviderInput) -> dict[str, Any]:
    return ProviderStore(request.app.state.settings).upsert(data.model_dump())


@provider_router.patch("/{provider_id}")
def patch_provider(request: Request, provider_id: str, data: ProviderPatch) -> dict[str, Any]:
    return ProviderStore(request.app.state.settings).upsert(data.model_dump(exclude_none=True), provider_id)


@provider_router.delete("/{provider_id}")
def delete_provider(request: Request, provider_id: str) -> dict[str, bool]:
    return {"ok": ProviderStore(request.app.state.settings).delete(provider_id)}


@provider_router.post("/{provider_id}/test")
async def test_provider(request: Request, provider_id: str) -> dict[str, Any]:
    try:
        return await ProviderStore(request.app.state.settings).test(provider_id)
    except ProviderError as exc:
        raise HTTPException(422, str(exc)) from exc

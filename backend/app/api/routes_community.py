"""Community feed: posts with optional photos + comments (login required to write)."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.api.deps_auth import get_current_user, get_current_user_optional
from app.core.config import settings
from app.db.database import get_db
from app.db.models import CommunityComment, CommunityPost, User

router = APIRouter(prefix="/community", tags=["community"])

# Soft content filter — never allow consumption-permission language in community
_FORBIDDEN = re.compile(
    r"\b(segura para comer|safe to eat|puedes comer|comestible sin riesgo|"
    r"safe to consume|apta para consumo)\b",
    re.IGNORECASE,
)

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
_MAX_IMAGE_BYTES = 8 * 1024 * 1024


class AuthorOut(BaseModel):
    id: int
    username: str
    display_name: str

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: int
    body: str
    created_at: str
    author: AuthorOut


class PostOut(BaseModel):
    id: int
    body: str
    image_url: str | None
    created_at: str
    author: AuthorOut
    comments: list[CommentOut]
    orientation_only: bool = True
    safety_note: str = (
        "Espacio orientativo y educativo. Nunca uses el chat como permiso de consumo."
    )


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


def _check_body(text: str) -> str:
    body = text.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Texto vacío")
    if _FORBIDDEN.search(body):
        raise HTTPException(
            status_code=400,
            detail="Lenguaje de consumo seguro no permitido (política R1). Usa orientación de riesgo.",
        )
    return body


def _serialize_post(post: CommunityPost) -> PostOut:
    comments = [
        CommentOut(
            id=c.id,
            body=c.body,
            created_at=c.created_at.isoformat() if c.created_at else "",
            author=AuthorOut(
                id=c.author.id,
                username=c.author.username,
                display_name=c.author.display_name,
            ),
        )
        for c in (post.comments or [])
    ]
    return PostOut(
        id=post.id,
        body=post.body,
        image_url=post.image_url,
        created_at=post.created_at.isoformat() if post.created_at else "",
        author=AuthorOut(
            id=post.author.id,
            username=post.author.username,
            display_name=post.author.display_name,
        ),
        comments=comments,
        orientation_only=True,
    )


async def _save_community_image(upload: UploadFile) -> tuple[str, str]:
    """Return (stored_path, public_url)."""
    name = upload.filename or "photo.jpg"
    ext = Path(name).suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Formato no permitido: {ext}")
    data = await upload.read()
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx 8MB)")
    # Magic bytes basic check (JPEG / PNG / WebP)
    is_jpeg = len(data) >= 3 and data[:3] == b"\xff\xd8\xff"
    is_png = len(data) >= 8 and data[:8].startswith(b"\x89PNG")
    is_webp = len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if not (is_jpeg or is_png or is_webp):
        raise HTTPException(status_code=400, detail="Archivo no es una imagen válida")

    community_dir = settings.upload_dir / "community"
    community_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    path = community_dir / stored_name
    path.write_bytes(data)
    # Served via /uploads mount
    public = f"/uploads/community/{stored_name}"
    return str(path), public


@router.get("/posts", response_model=list[PostOut])
def list_posts(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _user: User | None = Depends(get_current_user_optional),
) -> list[PostOut]:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    rows = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author),
            joinedload(CommunityPost.comments).joinedload(CommunityComment.author),
        )
        .order_by(CommunityPost.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_serialize_post(p) for p in rows]


@router.post("/posts", response_model=PostOut, status_code=201)
async def create_post(
    body: str = Form(...),
    image: UploadFile | None = File(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PostOut:
    text = _check_body(body)
    image_path = None
    image_url = None
    if image is not None and image.filename:
        image_path, image_url = await _save_community_image(image)

    post = CommunityPost(
        author_id=user.id,
        body=text,
        image_path=image_path,
        image_url=image_url,
        orientation_only=True,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    # reload relations
    post = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author),
            joinedload(CommunityPost.comments).joinedload(CommunityComment.author),
        )
        .filter(CommunityPost.id == post.id)
        .one()
    )
    return _serialize_post(post)


@router.post("/posts/{post_id}/comments", response_model=CommentOut, status_code=201)
def create_comment(
    post_id: int,
    payload: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommentOut:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post no encontrado")
    text = _check_body(payload.body)
    comment = CommunityComment(post_id=post_id, author_id=user.id, body=text)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    comment = (
        db.query(CommunityComment)
        .options(joinedload(CommunityComment.author))
        .filter(CommunityComment.id == comment.id)
        .one()
    )
    return CommentOut(
        id=comment.id,
        body=comment.body,
        created_at=comment.created_at.isoformat() if comment.created_at else "",
        author=AuthorOut(
            id=comment.author.id,
            username=comment.author.username,
            display_name=comment.author.display_name,
        ),
    )

"""S4: image dimension parsing + rejection of oversized images."""

from __future__ import annotations

import io
import struct

from fastapi.testclient import TestClient

from app.services.image_storage import read_image_dimensions, validate_image_dimensions
from app.core.config import settings


def _minimal_png(width: int, height: int) -> bytes:
    """Build a tiny valid-ish PNG with IHDR width/height (no real image data needed for dim parse)."""
    signature = b"\x89PNG\r\n\x1a\n"
    # IHDR chunk: length(13) + type + data + crc (crc may be wrong; we only read dims)
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr = struct.pack(">I", 13) + b"IHDR" + ihdr_data + b"\x00\x00\x00\x00"
    return signature + ihdr + b"\x00" * 32


def test_read_png_dimensions():
    raw = _minimal_png(800, 600)
    assert read_image_dimensions(raw, "png") == (800, 600)


def test_validate_rejects_oversized(monkeypatch):
    monkeypatch.setattr(settings, "max_image_dimension", 100)
    big = _minimal_png(200, 50)
    try:
        validate_image_dimensions(big, "png")
        raised = False
    except Exception as exc:  # HTTPException
        raised = True
        assert "exceed" in str(exc.detail).lower() or getattr(exc, "status_code", None) == 400
    assert raised


def test_upload_rejects_oversized_png(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "max_image_dimension", 64)
    r = client.post("/observations", json={"title": "dim test"})
    assert r.status_code == 201
    obs_id = r.json()["id"]
    big = _minimal_png(128, 128)
    files = [("images", ("big.png", io.BytesIO(big), "image/png"))]
    r = client.post(f"/observations/{obs_id}/images", files=files)
    assert r.status_code == 400
    assert "dimension" in r.text.lower() or "exceed" in r.text.lower()

"""Tests for media routes, catalog API, EXIF strip, safety i18n (P0 bar)."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.safety_i18n import contains_consumption_language, get_safety_bundle
from app.services.unified_catalog import get_by_slug, load_catalog, resolve_vernaculars


@pytest.fixture()
def client(tmp_path) -> TestClient:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db.database import Base, get_db
    from app.main import app

    database_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_catalog_loads_species():
    cat = load_catalog()
    assert cat.get("count", 0) > 0 or len(cat.get("species") or []) > 0
    amanita = get_by_slug("amanita-phalloides")
    assert amanita is not None
    for loc in ("es", "ca", "eu", "en"):
        assert resolve_vernaculars(amanita, loc)
    # O(1) maps present
    assert "amanita-phalloides" in cat.get("_by_slug", {})


def _hide_species_media(slug: str):
    """Temporarily rename media/species/{slug} so tests exercise missing-asset path."""
    root = Path(settings.species_media_root) if hasattr(settings, "species_media_root") else None
    # Default layout: repo media/species
    candidates = []
    if root:
        candidates.append(Path(root) / slug)
    # relative to backend tests → repo root media
    repo_media = Path(__file__).resolve().parents[3] / "media" / "species" / slug
    candidates.append(repo_media)
    for d in candidates:
        if d.exists() and d.is_dir():
            hidden = d.with_name(d.name + ".__hidden_test__")
            if hidden.exists():
                import shutil

                shutil.rmtree(hidden)
            d.rename(hidden)
            return hidden, d
    return None, None


def _restore_species_media(hidden: Path | None, original: Path | None) -> None:
    if hidden and hidden.exists() and original and not original.exists():
        hidden.rename(original)


def test_deadly_taxon_without_asset_returns_deadly_placeholder_body(client: TestClient):
    """Plan §1.6: deadly taxon sin asset + fallback=1 → body = deadly placeholder, 200."""
    slug = "amanita-virosa"
    rec = get_by_slug(slug)
    assert rec is not None
    assert rec.get("risk_level") in ("deadly", "critical") or rec.get("edibility_code") == "mortifero"

    hidden, original = _hide_species_media(slug)
    try:
        r = client.get(f"/media/species/{slug}/card.webp?fallback=1")
        assert r.status_code == 200
        assert len(r.content) > 0

        deadly = client.get("/media/placeholder/deadly")
        assert deadly.status_code == 200
        assert r.content == deadly.content
    finally:
        _restore_species_media(hidden, original)

    # Species with own asset should NOT equal deadly placeholder
    fixture = client.get("/media/species/amanita-phalloides/card.webp")
    assert fixture.status_code == 200
    deadly = client.get("/media/placeholder/deadly")
    assert fixture.content != deadly.content


def test_unknown_slug_placeholder(client: TestClient):
    r = client.get("/media/species/zzzz-not-in-catalog/card.webp?fallback=1")
    assert r.status_code == 200
    unknown = client.get("/media/placeholder/unknown")
    assert unknown.status_code == 200
    assert r.content == unknown.content


def test_fallback_zero_missing_returns_404(client: TestClient):
    slug = "amanita-virosa"
    hidden, original = _hide_species_media(slug)
    try:
        r = client.get(f"/media/species/{slug}/card.webp?fallback=0")
        assert r.status_code == 404
    finally:
        _restore_species_media(hidden, original)


def test_media_invalid_slug_rejected(client: TestClient):
    r = client.get("/media/species/Not_A_Valid_Slug/card")
    assert r.status_code == 400
    r2 = client.get("/media/species/foo_bar/card")
    assert r2.status_code == 400


def test_media_placeholder_always_200(client: TestClient):
    for kind in ("default", "toxic", "deadly", "unknown"):
        r = client.get(f"/media/placeholder/{kind}")
        assert r.status_code == 200
        # .webp suffix also accepted
        r2 = client.get(f"/media/placeholder/{kind}.webp")
        assert r2.status_code == 200


def test_media_manifest_slim(client: TestClient):
    r = client.get("/media/manifest/slim")
    assert r.status_code == 200
    data = r.json()
    assert "species" in data


def test_species_gallery_endpoint(client: TestClient):
    r = client.get("/media/species/amanita-phalloides/gallery")
    assert r.status_code == 200
    data = r.json()
    assert data.get("slug") == "amanita-phalloides"
    assert "items" in data
    assert data.get("count", 0) >= 1
    assert data["items"][0].get("url")


def test_species_list_envelope(client: TestClient):
    r = client.get("/species?limit=5&locale=es")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "catalog_version" in data
    assert data["locale"] == "es"
    assert len(data["items"]) <= 5


def test_species_detail_and_invalid_locale(client: TestClient):
    r = client.get("/species/amanita-phalloides?locale=es")
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == "amanita-phalloides"
    assert body.get("vernacular_names")

    bad = client.get("/species?locale=fr")
    assert bad.status_code == 400
    assert bad.json()["error"] == "invalid_locale"


def test_species_poisonous_compat(client: TestClient):
    r = client.get("/species/poisonous")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_exif_strip_removes_maker_tag():
    # Lazy import: strip_exif may be absent on branches that lost PR-03b wiring.
    from app.services.image_storage import strip_exif

    im = Image.new("RGB", (32, 32), color=(10, 20, 30))
    buf = io.BytesIO()
    exif = im.getexif()
    exif[271] = "VisionSetilTestCamera"  # Make
    im.save(buf, format="JPEG", exif=exif, quality=90)
    original = buf.getvalue()
    assert b"VisionSetilTestCamera" in original

    cleaned = strip_exif(original, "jpg")
    assert cleaned.startswith(b"\xff\xd8\xff")
    assert b"VisionSetilTestCamera" not in cleaned
    # Re-open: no Make tag
    reopened = Image.open(io.BytesIO(cleaned))
    re_exif = reopened.getexif()
    assert re_exif.get(271) in (None, "")


def test_hydrate_image_card_url_uses_public_prefix():
    from app.api.routes_classify import _hydrate_prediction

    pred = _hydrate_prediction("Amanita phalloides", 0.9, "unknown", "es")
    assert pred.image_card_url is not None
    assert pred.image_card_url.startswith(settings.media_public_prefix.rstrip("/"))
    assert "/api/media/" in pred.image_card_url or pred.image_card_url.startswith(
        settings.media_public_prefix
    )
    assert pred.image_card_url.endswith("/card.webp")
    assert pred.slug == "amanita-phalloides"
    assert pred.risk_level in ("deadly", "high", "critical")


def test_hydrate_synonym_normalizes_to_preferred_scientific_name():
    """B-41: historical/ML synonyms resolve to preferred catalog scientific name."""
    from app.services.prediction_hydrate import (
        hydrate_prediction,
        normalize_to_preferred_scientific_name,
        reload_synonyms,
    )

    reload_synonyms()

    assert (
        normalize_to_preferred_scientific_name("Galerina autumnalis")
        == "Galerina marginata"
    )
    assert (
        normalize_to_preferred_scientific_name("  agaricus   PHALLOIDES ")
        == "Amanita phalloides"
    )
    assert (
        normalize_to_preferred_scientific_name("Pholiota marginata")
        == "Galerina marginata"
    )
    # Unknown taxa pass through cleaned, not invented
    assert (
        normalize_to_preferred_scientific_name("  Fakeus  inventus  ")
        == "Fakeus inventus"
    )

    pred = hydrate_prediction("Galerina autumnalis", 0.88, "poisonous", "es")
    assert pred.species == "Galerina marginata"
    assert pred.in_catalog is True
    assert pred.slug == "galerina-marginata"
    assert pred.risk_level in ("deadly", "high", "critical")
    assert pred.image_card_url is not None
    assert pred.image_card_url.endswith("/species/galerina-marginata/card.webp")

    pred2 = hydrate_prediction("Agaricus phalloides", 0.91, "deadly", "es")
    assert pred2.species == "Amanita phalloides"
    assert pred2.in_catalog is True
    assert pred2.slug == "amanita-phalloides"
    assert pred2.risk_level in ("deadly", "high", "critical")
    assert pred2.common_name  # vernacular from preferred catalog row


def test_hydrate_unknown_taxon_not_forced_into_catalog():
    from app.services.prediction_hydrate import hydrate_prediction

    pred = hydrate_prediction("Completely Unknown Fungus", 0.5, "unknown", "es")
    assert pred.species == "Completely Unknown Fungus"
    assert pred.in_catalog is False
    assert pred.common_name is None
    assert pred.risk_level is None
    assert pred.slug == "completely-unknown-fungus"


def test_safety_i18n_all_locales():
    for loc in ("es", "ca", "eu", "en"):
        b = get_safety_bundle(loc)
        assert b["final_warning"]
        assert b["message"]
        hits = contains_consumption_language(b["message"], loc)
        assert hits == [], hits
        hits2 = contains_consumption_language(b["final_warning"], loc)
        assert hits2 == [], hits2


def test_safety_blacklist_detects_phrases():
    assert contains_consumption_language("This is safe to eat", "en")
    assert contains_consumption_language("es pot menjar tranquil", "ca")
    assert contains_consumption_language("jan daiteke gaur", "eu")
    assert contains_consumption_language("es seguro comer esto", "es")


def test_readyz_includes_catalog(client: TestClient):
    r = client.get("/readyz")
    assert r.status_code in (200, 503)
    data = r.json()
    assert "checks" in data
    assert "catalog_version" in data["checks"] or "catalog" in data["checks"]


def test_media_root_configured():
    root = Path(settings.species_media_root)
    assert "media" in str(root).replace("\\", "/")
    assert root.exists(), f"species_media_root missing: {root}"
    placeholders = root / "placeholders"
    assert placeholders.exists(), f"placeholders missing: {placeholders}"
    assert (placeholders / "deadly.webp").exists() or (placeholders / "deadly.png").exists()

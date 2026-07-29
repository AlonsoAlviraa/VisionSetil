"""Index Fungorum client + nomenclature routes (mocked network)."""
from __future__ import annotations

from unittest.mock import patch

from app.services import index_fungorum as ifs


SAMPLE_XML = """<?xml version="1.0" encoding="utf-8"?>
<NewDataSet>
  <IndexFungorum>
    <NAME_x0020_OF_x0020_FUNGUS>Amanita phalloides</NAME_x0020_OF_x0020_FUNGUS>
    <AUTHORS>(Vaill. ex Fr.) Link</AUTHORS>
    <YEAR_x0020_OF_x0020_PUBLICATION>1833</YEAR_x0020_OF_x0020_PUBLICATION>
    <NAME_x0020_STATUS>Legitimate</NAME_x0020_STATUS>
    <RECORD_x0020_NUMBER>178962</RECORD_x0020_NUMBER>
    <CURRENT_x0020_NAME>Amanita phalloides</CURRENT_x0020_NAME>
    <CURRENT_x0020_NAME_x0020_RECORD_x0020_NUMBER>178962</CURRENT_x0020_NAME_x0020_RECORD_x0020_NUMBER>
    <BASIONYM_x0020_RECORD_x0020_NUMBER>452913</BASIONYM_x0020_RECORD_x0020_NUMBER>
    <UUID>46d99dda-51f8-4a33-b1fd-9dc579942947</UUID>
  </IndexFungorum>
  <IndexFungorum>
    <NAME_x0020_OF_x0020_FUNGUS>Amanita phalloides</NAME_x0020_OF_x0020_FUNGUS>
    <AUTHORS>Secr.</AUTHORS>
    <NAME_x0020_STATUS>Invalid</NAME_x0020_STATUS>
    <RECORD_x0020_NUMBER>178461</RECORD_x0020_NUMBER>
    <CURRENT_x0020_NAME>Amanita phalloides</CURRENT_x0020_NAME>
  </IndexFungorum>
</NewDataSet>
"""

SYNONYM_XML = """<?xml version="1.0" encoding="utf-8"?>
<NewDataSet>
  <IndexFungorum>
    <NAME_x0020_OF_x0020_FUNGUS>Coprinus atramentarius</NAME_x0020_OF_x0020_FUNGUS>
    <AUTHORS>(Bull.) Fr.</AUTHORS>
    <NAME_x0020_STATUS>Legitimate</NAME_x0020_STATUS>
    <RECORD_x0020_NUMBER>220725</RECORD_x0020_NUMBER>
    <CURRENT_x0020_NAME>Coprinopsis atramentaria</CURRENT_x0020_NAME>
    <CURRENT_x0020_NAME_x0020_RECORD_x0020_NUMBER>474167</CURRENT_x0020_NAME_x0020_RECORD_x0020_NUMBER>
  </IndexFungorum>
  <IndexFungorum>
    <NAME_x0020_OF_x0020_FUNGUS>Agaricus atramentarius</NAME_x0020_OF_x0020_FUNGUS>
    <RECORD_x0020_NUMBER>111</RECORD_x0020_NUMBER>
    <NAME_x0020_STATUS>Legitimate</NAME_x0020_STATUS>
  </IndexFungorum>
</NewDataSet>
"""


def test_parse_and_pick_best_prefers_legitimate():
    rows = ifs._parse_index_fungorum_xml(SAMPLE_XML)
    assert len(rows) == 2
    names = [ifs._row_to_name(r) for r in rows]
    best = ifs.pick_best(names, "Amanita phalloides")
    assert best is not None
    assert best.record_number == "178962"
    assert best.name_status == "Legitimate"
    assert best.record_url and "178962" in best.record_url


def test_resolve_name_mocked():
    def fake_get(url: str, timeout: float = 20.0) -> str:
        if "NameSearch" in url:
            return SAMPLE_XML
        if "NamesByCurrentKey" in url:
            return SYNONYM_XML
        raise AssertionError(url)

    with patch.object(ifs, "_http_get", side_effect=fake_get):
        # clear cache
        ifs.resolve_name_cached.cache_clear()
        out = ifs.resolve_name("Amanita phalloides", include_synonyms=True)
    assert out["ok"] is True
    assert out["best"]["record_number"] == "178962"
    assert out["current_name"] == "Amanita phalloides"
    assert out["attribution"]["url"].startswith("https://www.indexfungorum.org")
    assert out["policy"] == "nomenclature_only_never_consumption"
    assert any(s["name"] == "Coprinus atramentarius" for s in out["synonyms"]) or len(
        out["synonyms"]
    ) >= 1
    # never edible language
    blob = str(out).lower()
    assert "safe to eat" not in blob
    assert "comestible" not in blob or "never" in blob


def test_attribution_required():
    a = ifs.attribution_block()
    assert a["required"] == "true"
    assert "indexfungorum.org" in a["url"]
    assert "Kew" in a["maintainer"] or "Kew" in a["label"]


def test_routes_attribution_and_resolve(client=None):
    from fastapi.testclient import TestClient

    from app.main import app

    def fake_get(url: str, timeout: float = 20.0) -> str:
        if "IsAlive" in url:
            return '<?xml version="1.0"?><boolean xmlns="http://Cabi/FungusServer/">true</boolean>'
        if "NameSearch" in url:
            return SAMPLE_XML
        if "NamesByCurrentKey" in url:
            return SYNONYM_XML
        return SAMPLE_XML

    with patch.object(ifs, "_http_get", side_effect=fake_get):
        ifs.resolve_name_cached.cache_clear()
        c = TestClient(app)
        r = c.get("/nomenclature/attribution")
        assert r.status_code == 200
        assert r.json()["product_unlock"] is False
        assert "indexfungorum.org" in r.json()["url"]

        h = c.get("/nomenclature/health")
        assert h.status_code == 200
        assert h.json()["alive"] is True

        res = c.get("/nomenclature/resolve", params={"q": "Amanita phalloides"})
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert body["product_unlock"] is False
        assert body["best"]["name"] == "Amanita phalloides"

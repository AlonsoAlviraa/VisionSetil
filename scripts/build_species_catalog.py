#!/usr/bin/env python3
"""Build species_catalog_v2.json from FE TypeScript seed + BE poisonous/mock (PR-01).

Usage:
  python scripts/build_species_catalog.py
  python scripts/build_species_catalog.py --check   # parity only, no write
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE_DATA = ROOT / "frontend" / "src" / "data"
OUT_DIR = ROOT / "data" / "species_catalog"
OUT_JSON = OUT_DIR / "species_catalog_v2.json"
GOLDEN_DIR = OUT_DIR / "golden"
GOLDEN_NAMES = GOLDEN_DIR / "parity_seed.json"
FE_SNAPSHOT = ROOT / "frontend" / "src" / "data" / "generated" / "species_catalog_snapshot.json"
BE_POISONOUS = ROOT / "backend" / "app" / "data" / "poisonous_species.json"
OVERRIDES_DIR = OUT_DIR / "overrides"
LAYERS_DIR = OUT_DIR / "layers"
IBERIA_LAYER = LAYERS_DIR / "iberia_common.json"
GBIF_LAYER = LAYERS_DIR / "gbif_iberia_top.json"
CATALOG_VERSION = "2.2.0"

LOCALES = ("es", "ca", "eu", "en")

# Curated multilingual vernaculars for deadly / high-risk taxa (PR-07a).
DEADLY_VERNACULARS: dict[str, dict[str, list[str]]] = {
    "Amanita phalloides": {
        "es": ["Oronja verde", "Hongo de la muerte", "Cicuta verde"],
        "ca": ["Farinera borda", "Oronja verda"],
        "eu": ["Hiltzaile berdea", "Amanita phalloides"],
        "en": ["Death cap"],
    },
    "Amanita virosa": {
        "es": ["Oronja blanca", "Ángel destructor"],
        "ca": ["Àngel destructor", "Oronja blanca"],
        "eu": ["Aingeru suntsitzailea"],
        "en": ["Destroying angel"],
    },
    "Amanita verna": {
        "es": ["Oronja blanca de primavera", "Cicuta blanca"],
        "ca": ["Farinera de primavera"],
        "eu": ["Udaberriko oronja zuria"],
        "en": ["Fool's mushroom", "Spring destroying angel"],
    },
    "Galerina marginata": {
        "es": ["Galerina de los márgenes", "Galerina mortal"],
        "ca": ["Galerina de la vora"],
        "eu": ["Galerina hilgarria"],
        "en": ["Funeral bell", "Deadly galerina"],
    },
    "Lepiota brunneoincarnata": {
        "es": ["Lepiota mortal", "Lepiota pardo-rosada"],
        "ca": ["Lepiota mortal"],
        "eu": ["Lepiota hilgarria"],
        "en": ["Deadly dapperling"],
    },
    "Cortinarius orellanus": {
        "es": ["Cortinario de Orellanus", "Cortinario mortal"],
        "ca": ["Cortinari d'Orellanus"],
        "eu": ["Orellanus kortinarioa"],
        "en": ["Fool's webcap"],
    },
    "Cortinarius rubellus": {
        "es": ["Cortinario rojizo mortal"],
        "ca": ["Cortinari vermellós"],
        "eu": ["Kortinario gorrixka"],
        "en": ["Deadly webcap"],
    },
    "Amanita muscaria": {
        "es": ["Matamoscas", "Amanita muscaria"],
        "ca": ["Reig de fageda", "Reig bord"],
        "eu": ["Kuletoa", "Euli-hiltzailea"],
        "en": ["Fly agaric"],
    },
    "Gyromitra esculenta": {
        "es": ["Colmenilla falsa", "Bordea", "Bonete"],
        "ca": ["Boletera falsa", "Bonet"],
        "eu": ["Kasko faltsua"],
        "en": ["False morel"],
    },
    "Inocybe erubescens": {
        "es": ["Inocybe rojiza"],
        "ca": ["Inocybe vermellosa"],
        "eu": ["Inocybe gorrixka"],
        "en": ["Deadly fibrecap"],
    },
    "Entoloma sinuatum": {
        "es": ["Entoloma lívido", "Pérfido"],
        "ca": ["Bolet de riera"],
        "eu": ["Entoloma lividoa"],
        "en": ["Livid entoloma", "Lead poisoner"],
    },
    "Omphalotus olearius": {
        "es": ["Seta de olivo", "Clitocibe del olivo"],
        "ca": ["Bolet d'olivera"],
        "eu": ["Olibondo-perretxikoa"],
        "en": ["Jack-o'-lantern mushroom"],
    },
    "Paxillus involutus": {
        "es": ["Paxilo arrollado"],
        "ca": ["Paxil enrotllat"],
        "eu": ["Paxilo bihurritua"],
        "en": ["Brown roll-rim"],
    },
    "Boletus satanas": {
        "es": ["Boleto de Satanás", "Hongo del diablo"],
        "ca": ["Cepe de Satanàs"],
        "eu": ["Satanasen onddoa"],
        "en": ["Devil's bolete"],
    },
    "Amanita pantherina": {
        "es": ["Amanita pantera"],
        "ca": ["Reig pantera"],
        "eu": ["Amanita pantera"],
        "en": ["Panther cap"],
    },
}

# Lightweight CA/EU/EN taglines for featured + known taxa; rest fall back at runtime.
COMMON_EN_NAMES: dict[str, list[str]] = {
    "Boletus edulis": ["Porcini", "King bolete", "Cep"],
    "Cantharellus cibarius": ["Chanterelle", "Golden chanterelle"],
    "Lactarius deliciosus": ["Saffron milk cap", "Red pine mushroom"],
    "Agaricus campestris": ["Field mushroom"],
    "Morchella esculenta": ["Yellow morel", "Common morel"],
    "Macrolepiota procera": ["Parasol mushroom"],
    "Hydnum repandum": ["Wood hedgehog", "Sweet tooth"],
    "Craterellus cornucopioides": ["Horn of plenty", "Black trumpet"],
    "Calocybe gambosa": ["St. George's mushroom"],
    "Pleurotus ostreatus": ["Oyster mushroom"],
    "Amanita caesarea": ["Caesar's mushroom"],
    "Tuber melanosporum": ["Black truffle", "Périgord truffle"],
}

COMMON_CA_NAMES: dict[str, list[str]] = {
    "Boletus edulis": ["Cep", "Sureny", "Siureny"],
    "Cantharellus cibarius": ["Rossinyol", "Agerola"],
    "Lactarius deliciosus": ["Rovelló", "Pinetell"],
    "Agaricus campestris": ["Bolet de camp"],
    "Morchella esculenta": ["Múrgola", "Cresquilla"],
    "Macrolepiota procera": ["Apagallums", "Cogomella"],
    "Hydnum repandum": ["Llengua de bou", "Pota de cavall"],
    "Craterellus cornucopioides": ["Trompeta de la mort"],
    "Calocybe gambosa": ["Moixernó"],
    "Pleurotus ostreatus": ["Gírgola"],
    "Amanita caesarea": ["Ou de reig", "Reig"],
}

COMMON_EU_NAMES: dict[str, list[str]] = {
    "Boletus edulis": ["Onddo zuri", "Porcini"],
    "Cantharellus cibarius": ["Ziza hori", "Chanterelle"],
    "Lactarius deliciosus": ["Esne-ziza gorria"],
    "Agaricus campestris": ["Zelai-ziza"],
    "Morchella esculenta": ["Kaskoa"],
    "Macrolepiota procera": ["Eguzki-ziza"],
    "Amanita caesarea": ["Enperadore-ziza"],
    "Pleurotus ostreatus": ["Ostra-ziza"],
}

EDIBILITY_TO_RISK = {
    "mortifero": "deadly",
    "toxico": "high",
    "no_recomendado": "medium",
    "comestible_con_cautela": "risky_lookalikes",
    "desconocido": "unknown",
    "buen_comestible": "low",
    "excelente": "low",
}


def scientific_to_slug(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _parse_ts_species_blocks(text: str) -> list[dict]:
    """Best-effort parse of MushroomSpecies object literals from TS files."""
    species: list[dict] = []
    # Split on scientificName entries that start a species object.
    pattern = re.compile(
        r"\{\s*scientificName:\s*'((?:\\'|[^'])*)'",
        re.MULTILINE,
    )
    matches = list(pattern.finditer(text))
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end]
        sci = m.group(1).replace("\\'", "'")
        record = {"scientificName": sci}

        def _str_field(key: str) -> str | None:
            mm = re.search(rf"{key}:\s*'((?:\\'|[^'])*)'", block)
            if not mm:
                # multiline template not used; try double quotes
                mm = re.search(rf'{key}:\s*"((?:\\"|[^"])*)"', block)
            return mm.group(1).replace("\\'", "'").replace('\\"', '"') if mm else None

        def _str_array(key: str) -> list[str]:
            mm = re.search(rf"{key}:\s*\[(.*?)\]", block, re.DOTALL)
            if not mm:
                return []
            return [
                s.replace("\\'", "'")
                for s in re.findall(r"'((?:\\'|[^'])*)'", mm.group(1))
            ]

        record["commonNames"] = _str_array("commonNames")
        record["tagline"] = _str_field("tagline") or ""
        record["description"] = _str_field("description") or ""
        record["family"] = _str_field("family") or ""
        record["habitat"] = _str_field("habitat") or ""
        record["season"] = _str_field("season") or ""
        record["cap"] = _str_field("cap") or ""
        record["stem"] = _str_field("stem") or ""
        record["hymenium"] = _str_field("hymenium") or ""
        record["edibility"] = _str_field("edibility") or "desconocido"
        record["toxicity"] = _str_field("toxicity")
        record["keyFeatures"] = _str_array("keyFeatures")
        record["lookAlikes"] = _str_array("lookAlikes")
        record["categories"] = _str_array("categories")
        record["icon"] = _str_field("icon") or "🍄"
        record["featured"] = bool(re.search(r"featured:\s*true", block))
        species.append(record)
    return species


def load_fe_species() -> list[dict]:
    texts = []
    for name in ("additionalSpecies.ts", "extendedSpecies.ts", "mushroomDatabase.ts"):
        path = FE_DATA / name
        if path.exists():
            texts.append(path.read_text(encoding="utf-8"))
    # Prefer concatenating; mushroomDatabase re-exports + owns some species
    combined = "\n".join(texts)
    all_sp = _parse_ts_species_blocks(combined)
    # Deduplicate by scientific name (last wins so mushroomDatabase overrides extras)
    by_name: dict[str, dict] = {}
    for sp in all_sp:
        by_name[sp["scientificName"]] = sp
    return list(by_name.values())


def parse_lookalikes(raw: list[str]) -> list[dict]:
    out = []
    for item in raw:
        # e.g. "Boletus satanas (tóxico)"
        m = re.match(r"^([A-Z][a-z]+(?:\s+[a-z-]+)+)\s*(?:\((.+)\))?$", item.strip())
        if m:
            out.append(
                {
                    "scientific_name": m.group(1).strip(),
                    "note_key": m.group(2).strip() if m.group(2) else None,
                }
            )
        else:
            # keep raw as scientific_name best-effort
            name = item.split("(")[0].strip()
            if name:
                out.append({"scientific_name": name, "note_key": None})
    return out


def map_poisonous_risk(latin: str, poisonous: dict[str, dict]) -> str | None:
    entry = poisonous.get(latin.lower())
    if not entry:
        return None
    rl = entry.get("risk_level", "")
    if rl == "critical":
        return "deadly"
    if rl == "high":
        return "high"
    return rl or None


def build_vernaculars(sp: dict) -> dict[str, list[str]]:
    sci = sp["scientificName"]
    es = [n for n in sp.get("commonNames") or [] if n and n.strip()]
    # Heuristic: English-looking names mixed into FE array
    en_extra = []
    es_clean = []
    for n in es:
        if n in ("Porcini", "Cep", "Bay Bolete") or (
            re.search(r"[A-Za-z]", n) and " " in n and n[0].isupper() and not any(
                c in n for c in "áéíóúñÁÉÍÓÚÑ"
            )
            and n.split()[0] in ("Bay", "King", "Death", "Fly", "Field", "Oyster", "False")
        ):
            en_extra.append(n)
        else:
            es_clean.append(n)
    if not es_clean:
        es_clean = es[:]

    curated = DEADLY_VERNACULARS.get(sci, {})
    vern = {
        "es": curated.get("es") or es_clean or es,
        "ca": curated.get("ca") or COMMON_CA_NAMES.get(sci, []),
        "eu": curated.get("eu") or COMMON_EU_NAMES.get(sci, []),
        "en": curated.get("en") or COMMON_EN_NAMES.get(sci, en_extra),
    }
    # Ensure no empty strings in arrays
    for loc in LOCALES:
        vern[loc] = [v for v in vern[loc] if v and str(v).strip()]

    # Deadly/high/toxic: guarantee all 4 locales (curated override or ES/scientific seed)
    edibility = sp.get("edibility") or "desconocido"
    high_risk = edibility in ("mortifero", "toxico") or sci in DEADLY_VERNACULARS
    if high_risk:
        seed = vern["es"] or [sci]
        for loc in LOCALES:
            if not vern[loc]:
                if loc == "en":
                    vern[loc] = vern.get("en") or ([sci] if not seed else seed[:1])
                else:
                    # Iberian locales: seed from ES common names (v1 pragmatic D11)
                    vern[loc] = list(seed)
    return vern


_CONSUMPTION_MARKETING = re.compile(
    r"\b(excelente comestible|buen comestible|excelente seta comestible|"
    r"excelente calidad gastron[oó]mica|safe to eat|perfectly edible)\b",
    re.IGNORECASE,
)


def scrub_educational_text(text: str) -> str:
    """D16: soften classic 'excellent edible' marketing in encyclopedia body copy."""
    if not text:
        return text
    replacements = [
        (r"Excelente comestible", "De alto interés culinario (referencia educativa)"),
        (r"excelente comestible", "de alto interés culinario (referencia educativa)"),
        (r"Buen comestible", "De interés culinario (referencia educativa)"),
        (r"buen comestible", "de interés culinario (referencia educativa)"),
        (r"excelente calidad gastronómica", "alto interés culinario (referencia educativa)"),
        (r"Excelente calidad gastronómica", "Alto interés culinario (referencia educativa)"),
        (r"safe to eat", "educational culinary interest only"),
        (r"perfectly edible", "educational culinary interest only"),
    ]
    out = text
    for pat, rep in replacements:
        out = re.sub(pat, rep, out, flags=re.IGNORECASE)
    return out


def to_v2_record(sp: dict, poisonous: dict[str, dict]) -> dict:
    sci = sp["scientificName"]
    slug = scientific_to_slug(sci)
    edibility = sp.get("edibility") or "desconocido"
    risk = map_poisonous_risk(sci, poisonous) or EDIBILITY_TO_RISK.get(edibility, "unknown")
    vern = build_vernaculars(sp)

    rec = {
        "id": slug,
        "scientific_name": sci,
        "slug": slug,
        "family": sp.get("family") or "",
        "genus": sci.split()[0] if sci else "",
        "risk_level": risk,
        "edibility_code": edibility,
        "categories": sp.get("categories") or [],
        "iberian_relevance": "high",
        "featured": bool(sp.get("featured")),
        "icon": sp.get("icon") or "🍄",
        "image_slug": slug,
        "ml_taxon_key": sci,
        "gbif_usage_key": None,
        "wikidata_id": None,
        "vernacular_names": vern,
        "tagline": {"es": scrub_educational_text(sp.get("tagline") or sci)},
        "description": {"es": scrub_educational_text(sp.get("description") or "")},
        "morphology": {
            "cap": {"es": sp.get("cap") or ""},
            "stem": {"es": sp.get("stem") or ""},
            "hymenium": {"es": sp.get("hymenium") or ""},
        },
        "habitat": {"es": sp.get("habitat") or ""},
        "season": {"es": sp.get("season") or ""},
        "key_features": {"es": sp.get("keyFeatures") or []},
        "toxicity_notes": {"es": sp.get("toxicity") or ""} if sp.get("toxicity") else {},
        "lookalikes": parse_lookalikes(sp.get("lookAlikes") or []),
    }
    # Promote taglines for curated deadly / featured
    if sci in DEADLY_VERNACULARS or sp.get("featured"):
        if vern.get("en"):
            rec["tagline"].setdefault("en", vern["en"][0])
        if vern.get("ca"):
            rec["tagline"].setdefault("ca", vern["ca"][0])
        if vern.get("eu"):
            rec["tagline"].setdefault("eu", vern["eu"][0])
    return rec


def load_poisonous() -> dict[str, dict]:
    if not BE_POISONOUS.exists():
        return {}
    data = json.loads(BE_POISONOUS.read_text(encoding="utf-8"))
    return {item["latin_name"].lower(): item for item in data}


def apply_overrides(records: list[dict]) -> list[dict]:
    if not OVERRIDES_DIR.exists():
        return records
    by_slug = {r["slug"]: r for r in records}
    for path in sorted(OVERRIDES_DIR.glob("*.json")):
        try:
            patch = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        items = patch if isinstance(patch, list) else [patch]
        for item in items:
            slug = item.get("slug") or scientific_to_slug(item.get("scientific_name", ""))
            if not slug or slug not in by_slug:
                continue
            base = by_slug[slug]
            for k, v in item.items():
                if k in ("slug", "scientific_name", "id"):
                    continue
                if isinstance(v, dict) and isinstance(base.get(k), dict):
                    base[k] = {**base[k], **v}
                else:
                    base[k] = v
    return list(by_slug.values())


def _merge_locale_map(base: dict, extra: dict) -> dict:
    out = dict(base or {})
    for loc, val in (extra or {}).items():
        if isinstance(val, list):
            cur = list(out.get(loc) or [])
            for item in val:
                if item and item not in cur:
                    cur.append(item)
            out[loc] = cur
        elif isinstance(val, dict):
            out[loc] = {**(out.get(loc) or {}), **val}
        elif val and not out.get(loc):
            out[loc] = val
    return out


def load_layer_records(path: Path, default_source: str) -> list[dict]:
    """Load a v2-shaped expansion layer JSON."""
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data.get("species") if isinstance(data, dict) else data
    out: list[dict] = []
    for raw in items or []:
        sci = raw.get("scientific_name") or raw.get("scientificName")
        if not sci:
            continue
        slug = raw.get("slug") or scientific_to_slug(sci)
        vern = raw.get("vernacular_names") or {}
        # normalize keys
        for loc in LOCALES:
            vern.setdefault(loc, [])
            vern[loc] = [v for v in (vern[loc] or []) if v]
        if not vern.get("es"):
            vern["es"] = [sci]
        rec = {
            "id": slug,
            "scientific_name": sci,
            "slug": slug,
            "family": raw.get("family") or "",
            "genus": raw.get("genus") or sci.split()[0],
            "risk_level": raw.get("risk_level") or "unknown",
            "edibility_code": raw.get("edibility_code") or "desconocido",
            "categories": raw.get("categories") or ["otras"],
            "iberian_relevance": raw.get("iberian_relevance") or "high",
            "featured": bool(raw.get("featured")),
            "icon": raw.get("icon") or "🍄",
            "image_slug": slug,
            "ml_taxon_key": raw.get("ml_taxon_key") or sci,
            "gbif_usage_key": raw.get("gbif_usage_key"),
            "wikidata_id": raw.get("wikidata_id"),
            "vernacular_names": vern,
            "tagline": raw.get("tagline") or {"es": sci},
            "description": raw.get("description") or {"es": ""},
            "morphology": raw.get("morphology")
            or {"cap": {"es": ""}, "stem": {"es": ""}, "hymenium": {"es": ""}},
            "habitat": raw.get("habitat") or {"es": ""},
            "season": raw.get("season") or {"es": ""},
            "key_features": raw.get("key_features") or {"es": []},
            "toxicity_notes": raw.get("toxicity_notes") or {},
            "lookalikes": raw.get("lookalikes") or [],
            "source": raw.get("source") or default_source,
        }
        # Scrub educational marketing phrases
        if isinstance(rec["tagline"], dict) and rec["tagline"].get("es"):
            rec["tagline"]["es"] = scrub_educational_text(rec["tagline"]["es"])
        if isinstance(rec["description"], dict) and rec["description"].get("es"):
            rec["description"]["es"] = scrub_educational_text(rec["description"]["es"])
        # Deadly/high vernacular fill
        if rec["risk_level"] in ("deadly", "high") or rec["edibility_code"] in (
            "mortifero",
            "toxico",
        ):
            seed = rec["vernacular_names"].get("es") or [sci]
            for loc in LOCALES:
                if not rec["vernacular_names"].get(loc):
                    rec["vernacular_names"][loc] = list(seed)
        out.append(rec)
    return out


def load_iberia_layer_records() -> list[dict]:
    return load_layer_records(IBERIA_LAYER, "iberia_layer")


def load_gbif_layer_records() -> list[dict]:
    return load_layer_records(GBIF_LAYER, "gbif_iberia")


def merge_records(base: list[dict], extra: list[dict]) -> list[dict]:
    """Merge by scientific_name; base (FE seed) wins on most fields; vernaculars union."""
    by_name: dict[str, dict] = {r["scientific_name"]: r for r in base}
    for rec in extra:
        name = rec["scientific_name"]
        if name not in by_name:
            by_name[name] = rec
            continue
        cur = by_name[name]
        # Prefer non-empty family/categories from either
        if not cur.get("family") and rec.get("family"):
            cur["family"] = rec["family"]
        if rec.get("featured"):
            cur["featured"] = True
        # Union categories
        cats = list(cur.get("categories") or [])
        for c in rec.get("categories") or []:
            if c not in cats:
                cats.append(c)
        cur["categories"] = cats
        # Risk: never downgrade deadly
        rank = {
            "deadly": 5,
            "high": 4,
            "risky_lookalikes": 3,
            "medium": 2,
            "low": 1,
            "unknown": 0,
        }
        if rank.get(rec.get("risk_level"), 0) > rank.get(cur.get("risk_level"), 0):
            cur["risk_level"] = rec["risk_level"]
        cur["vernacular_names"] = _merge_locale_map(
            cur.get("vernacular_names") or {}, rec.get("vernacular_names") or {}
        )
        for field in ("tagline", "description", "habitat", "season", "toxicity_notes"):
            cur[field] = _merge_locale_map(cur.get(field) or {}, rec.get(field) or {})
        if rec.get("lookalikes") and not cur.get("lookalikes"):
            cur["lookalikes"] = rec["lookalikes"]
    return list(by_name.values())


def build_catalog() -> dict:
    fe = load_fe_species()
    poisonous = load_poisonous()
    records = [to_v2_record(sp, poisonous) for sp in fe]
    iberia = load_iberia_layer_records()
    records = merge_records(records, iberia)
    gbif = load_gbif_layer_records()
    records = merge_records(records, gbif)
    records = apply_overrides(records)
    records.sort(key=lambda r: r["scientific_name"].lower())
    payload = {
        "catalog_version": CATALOG_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "locale_default": "es",
        "supported_locales": list(LOCALES),
        "count": len(records),
        "layers": ["fe_seed", "iberia_common", "gbif_iberia_top"],
        "species": records,
    }
    return payload


def write_outputs(payload: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    FE_SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)

    text = json.dumps(payload, ensure_ascii=False, indent=2)
    OUT_JSON.write_text(text + "\n", encoding="utf-8")
    FE_SNAPSHOT.write_text(text + "\n", encoding="utf-8")

    names = sorted(s["scientific_name"] for s in payload["species"])
    golden = {
        "catalog_version": payload["catalog_version"],
        "count": len(names),
        "scientific_names": names,
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }
    GOLDEN_NAMES.write_text(json.dumps(golden, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_JSON} ({payload['count']} species)")
    print(f"Wrote {FE_SNAPSHOT}")
    print(f"Wrote {GOLDEN_NAMES}")


def check_parity(payload: dict) -> int:
    """Validate catalog integrity. FE seed must be subset; expansion layers may add taxa."""
    fe = load_fe_species()
    fe_names = {s["scientificName"] for s in fe}
    cat_names = {s["scientific_name"] for s in payload["species"]}
    only_fe = sorted(fe_names - cat_names)
    errors = 0
    if only_fe:
        print("PARITY FAIL: FE seed names missing from catalog")
        print("  only in FE:", only_fe[:20], "..." if len(only_fe) > 20 else "")
        errors += 1
    expanded = len(cat_names - fe_names)
    print(f"Catalog size={len(cat_names)} (FE seed={len(fe_names)}, expanded=+{expanded})")
    if len(cat_names) < 500:
        print(f"WARN: catalog below target of 500 Iberian species (have {len(cat_names)})")
    slugs = [s["slug"] for s in payload["species"]]
    if len(slugs) != len(set(slugs)):
        print("PARITY FAIL: duplicate slugs")
        errors += 1
    for s in payload["species"]:
        if not s.get("tagline", {}).get("es"):
            print("missing tagline.es:", s["scientific_name"])
            errors += 1
        if not s.get("description", {}).get("es"):
            print("missing description.es:", s["scientific_name"])
            errors += 1
        if not (s.get("vernacular_names") or {}).get("es"):
            print("missing vernacular es:", s["scientific_name"])
            errors += 1
        for loc in LOCALES:
            if loc not in s.get("vernacular_names", {}):
                print("missing vernacular key", loc, s["scientific_name"])
                errors += 1
        if s["risk_level"] in ("deadly", "high") or s["edibility_code"] in ("mortifero", "toxico"):
            for loc in LOCALES:
                if not s["vernacular_names"].get(loc):
                    print(f"DEADLY/HIGH missing vernacular {loc}:", s["scientific_name"])
                    errors += 1
    if errors == 0:
        print(f"Parity OK: {len(cat_names)} species")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate only")
    args = parser.parse_args()
    payload = build_catalog()
    errs = check_parity(payload)
    if args.check:
        return 1 if errs else 0
    write_outputs(payload)
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())

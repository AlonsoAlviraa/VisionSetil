#!/usr/bin/env python3
"""Expand catalog for E20 ML-40 classes + multi-view diagnostic map.

- Ensure every label2idx taxon exists in species_catalog_v2 (add stubs if missing)
- Fill educational lookalikes for ML classes that have none (both ends in catalog)
- Write data/species_catalog/multiview_diagnostic_map.json (critical views per pair)
- Optionally run sync_catalog_ssot

Policy: orientation_only; never invent edible clearance; never consumption permission.
"""
from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V2_PATH = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
L2I = ROOT / "kaggle" / "kernel_output_v20" / "models" / "label2idx.json"
PAIRS = ROOT / "data" / "species_catalog" / "classic_lookalike_pairs.json"
DIAG = ROOT / "data" / "species_catalog" / "multiview_diagnostic_map.json"
FE_DIAG = ROOT / "frontend" / "src" / "data" / "multiview_diagnostic_map.json"
REPORT = ROOT / "eval" / "reports" / "ml_experiments" / "catalog_ml40_multiview.json"
DEADLY_SET = ROOT / "data" / "industrial_v1" / "deadly_set.json"

# Template donors for missing ML taxa (clone morphology skeleton, retarget names)
STUB_TEMPLATES: dict[str, str] = {
    "Armillaria lutea": "Armillaria mellea",
    "Chlorophyllum olivieri": "Chlorophyllum rhacodes",
    "Laccaria amethystina": "Laccaria laccata",
}

# Educational lookalike edges for ML-40 gaps (a, b, note). Both must exist after stubs.
ML40_EDGES: list[tuple[str, str, str]] = [
    ("Clitocybe nebularis", "Entoloma sinuatum", "Láminas y pie; entoloma tóxico"),
    ("Entoloma sinuatum", "Clitocybe nebularis", "No es clitocybe de bosque"),
    ("Craterellus tubaeformis", "Cantharellus cibarius", "Pliegues y color; no confiar solo en trompeta"),
    ("Cantharellus cibarius", "Craterellus tubaeformis", "Rebozuelo vs trompeta amarilla"),
    ("Fomitopsis pinicola", "Ganoderma lucidum", "Políporos / yesqueros educativos"),
    ("Ganoderma lucidum", "Fomitopsis pinicola", "No es ID de consumo"),
    ("Imleria badia", "Boletus edulis", "Poro y cutícula; boletus vs bayo"),
    ("Boletus edulis", "Imleria badia", "Bayo vs edulis"),
    ("Imleria badia", "Cortinarius rubellus", "MORTAL confusión educativa con boleto"),
    ("Laccaria laccata", "Laccaria amethystina", "Color; láminas cerosas en ambas"),
    ("Laccaria amethystina", "Laccaria laccata", "Lacaria violeta vs anaranjada"),
    ("Lactarius deterrimus", "Lactarius deliciosus", "Látex y pinar; confusión clásica"),
    ("Lactarius deliciosus", "Lactarius deterrimus", "Níscalo vs deterrimus"),
    ("Lactarius deterrimus", "Lactarius torminosus", "Látex y borde; no confiar"),
    ("Laetiporus sulphureus", "Hypholoma fasciculare", "Sobre madera: amargor vs políporo"),
    ("Leccinum scabrum", "Boletus edulis", "Pie escuamoso vs edulis; abedul"),
    ("Boletus edulis", "Leccinum scabrum", "No es leccinum de abedul"),
    ("Lepiota castanea", "Lepiota brunneoincarnata", "Lepiota pequeña: riesgo mortal"),
    ("Lepiota brunneoincarnata", "Lepiota castanea", "Ambas peligrosas si pequeñas"),
    ("Lepiota cristata", "Lepiota brunneoincarnata", "Olor y escamas; lepiotas pequeñas"),
    ("Lepiota brunneoincarnata", "Lepiota cristata", "No confiar en lepiota pequeña"),
    ("Lepista nuda", "Cortinarius rubellus", "Pie y esporada; cortinario mortal"),
    ("Cortinarius rubellus", "Lepista nuda", "Cortina y color; no es pie azul"),
    ("Paxillus involutus", "Imleria badia", "Paxillus vs boleto; toxicidad acumulativa"),
    ("Imleria badia", "Paxillus involutus", "No es paxillus enrollado"),
    ("Phallus impudicus", "Clathrus ruber", "Gasteromicetos; no consumo"),
    ("Pleurotus ostreatus", "Hypholoma fasciculare", "Sobre madera: ostra vs hypholoma"),
    ("Hypholoma fasciculare", "Pleurotus ostreatus", "Hypholoma amargo tóxico"),
    ("Pluteus cervinus", "Entoloma sinuatum", "Láminas rosadas vs entoloma"),
    ("Entoloma sinuatum", "Pluteus cervinus", "No es pluteus de madera"),
    ("Armillaria lutea", "Armillaria mellea", "Armillaria: anillo y racimos"),
    ("Armillaria mellea", "Armillaria lutea", "Complejo armillaria"),
    ("Armillaria lutea", "Galerina marginata", "MORTAL sobre madera vs armillaria"),
    ("Galerina marginata", "Armillaria lutea", "Galerina mortal; no es armillaria"),
    ("Chlorophyllum olivieri", "Chlorophyllum rhacodes", "Parasoles; esporada y corte"),
    ("Chlorophyllum rhacodes", "Chlorophyllum olivieri", "No confiar solo en escamas"),
    ("Chlorophyllum olivieri", "Macrolepiota procera", "Tamaño y anillo; lepiotoides"),
    ("Macrolepiota procera", "Chlorophyllum olivieri", "Parasol vs chlorophyllum"),
    # Remaining ML-40 gaps
    ("Russula ochroleuca", "Russula emetica", "Picor y cutícula; russulas educacionales"),
    ("Russula emetica", "Russula ochroleuca", "No es ochroleuca por color solo"),
    ("Scleroderma citrinum", "Lycoperdon perlatum", "Falsa vs verdadera pedo de lobo"),
    ("Lycoperdon perlatum", "Scleroderma citrinum", "Corte: gleba distinta"),
    ("Suillus grevillei", "Suillus luteus", "Anillo y pinar; suillus"),
    ("Suillus luteus", "Suillus grevillei", "Láminas/poros y anillo"),
    ("Suillus luteus", "Boletus edulis", "Anillo vs edulis sin anillo"),
    ("Trametes versicolor", "Fomitopsis pinicola", "Políporos en madera; no consumo"),
    ("Fomitopsis pinicola", "Trametes versicolor", "Yesquero vs cola de pavo"),
]

# Multi-view diagnostics for classic confusions (which photos resolve the pair)
DEFAULT_CRITICAL = ["gills", "front"]


def _names(lks: list) -> set[str]:
    out: set[str] = set()
    for lk in lks or []:
        if isinstance(lk, dict):
            n = str(lk.get("scientific_name") or "").strip()
        else:
            n = str(lk or "").strip()
        if n and not n.endswith("(educational)"):
            out.add(n)
    return out


def slugify(taxon: str) -> str:
    return taxon.lower().strip().replace(" ", "-").replace(".", "")


def make_stub(name: str, donor: dict) -> dict:
    rec = deepcopy(donor)
    rec["id"] = slugify(name)
    rec["scientific_name"] = name
    rec["slug"] = slugify(name)
    rec["genus"] = name.split()[0]
    rec["image_slug"] = slugify(name)
    rec["ml_taxon_key"] = name
    rec["featured"] = False
    # Keep risk conservative if unknown
    vern = rec.get("vernacular_names") or {}
    rec["vernacular_names"] = {
        "es": [name.split()[0], name],
        "en": [name],
        "ca": [],
        "eu": [],
    }
    rec["tagline"] = {
        "es": f"Ficha educativa (ML-40): {name}. Solo orientación.",
        "en": f"Educational fiche (ML-40): {name}. Orientation only.",
    }
    desc = rec.get("description") or {}
    if isinstance(desc, dict):
        base = desc.get("es") or ""
        rec["description"] = {
            "es": (
                f"{name}: entrada ampliada para cobertura del modelo E20 (40 clases). "
                f"Basada en ficha cercana {donor.get('scientific_name')}. "
                "No autoriza consumo. "
                + (base[:240] + "…" if len(base) > 240 else base)
            ),
            "en": f"{name}: expanded for E20 model coverage. Orientation only — never eat from an app.",
        }
    rec["lookalikes"] = []
    rec["categories"] = list(dict.fromkeys((rec.get("categories") or []) + ["ml40", "educativo"]))
    rec["catalog_source"] = "ml40_stub_expand"
    rec["expanded_at"] = datetime.now(timezone.utc).isoformat()
    # drop gbif keys that may point to donor
    rec["gbif_usage_key"] = None
    rec["wikidata_id"] = None
    return rec


def expand_stubs(v2: dict, ml_classes: list[str]) -> dict:
    by = {str(s.get("scientific_name", "")).strip(): s for s in v2.get("species") or []}
    added = []
    for name in ml_classes:
        if name in by:
            continue
        donor_name = STUB_TEMPLATES.get(name)
        if not donor_name or donor_name not in by:
            print("WARN: cannot stub", name, "donor", donor_name)
            continue
        stub = make_stub(name, by[donor_name])
        v2["species"].append(stub)
        by[name] = stub
        added.append(name)
    v2["count"] = len(v2["species"])
    v2["generated_at"] = datetime.now(timezone.utc).isoformat()
    return {"added_stubs": added, "catalog_count": v2["count"]}


def expand_lookalikes(v2: dict) -> dict:
    by = {str(s.get("scientific_name", "")).strip(): s for s in v2.get("species") or []}
    added = 0
    skipped = 0
    already = 0
    for a, b, note in ML40_EDGES:
        # skip synthetic educational-only mates not in catalog
        if b.endswith("(educational)") or a not in by:
            skipped += 1
            continue
        if b not in by:
            skipped += 1
            continue
        rec = by[a]
        lks = list(rec.get("lookalikes") or [])
        if b in _names(lks):
            already += 1
            continue
        lks.append({"scientific_name": b, "note_key": note})
        rec["lookalikes"] = lks
        added += 1
    with_lk = sum(1 for s in v2["species"] if s.get("lookalikes"))
    directed = sum(len(s.get("lookalikes") or []) for s in v2["species"])
    return {
        "edges_added": added,
        "already": already,
        "skipped": skipped,
        "taxa_with_lookalikes": with_lk,
        "directed_edges": directed,
    }


def build_diagnostic_map(v2: dict, ml_classes: list[str]) -> dict:
    """Map confusions → which of the 4 photos are most diagnostic."""
    pairs_doc = {"version": "1.0.0", "pairs": []}
    if PAIRS.is_file():
        pairs_doc = json.loads(PAIRS.read_text(encoding="utf-8"))

    entries = []
    for p in pairs_doc.get("pairs") or []:
        taxa = p.get("taxa") or []
        why = p.get("why") or ""
        # Heuristic: volva/anillo → detail+front; laminas → gills; habitat words → habitat
        critical = list(DEFAULT_CRITICAL)
        wlow = why.lower()
        if any(x in wlow for x in ("volva", "anillo", "base", "pie")):
            if "detail" not in critical:
                critical.append("detail")
        if any(x in wlow for x in ("lámin", "lamin", "poro", "pliegue", "esporada")):
            if "gills" not in critical:
                critical.insert(0, "gills")
        if any(x in wlow for x in ("hábitat", "habitat", "madera", "pinar", "prado")):
            if "habitat" not in critical:
                critical.append("habitat")
        entries.append(
            {
                "id": p.get("id"),
                "taxa": taxa,
                "why": why,
                "critical_views": critical[:4],
                "full_packet": list(("gills", "front", "habitat", "detail")),
                "ml40_overlap": [t for t in taxa if t in ml_classes],
            }
        )

    # Also attach per ML class recommended views
    by = {str(s.get("scientific_name", "")).strip(): s for s in v2.get("species") or []}
    per_class = {}
    for c in ml_classes:
        rec = by.get(c) or {}
        risk = (rec.get("risk_level") or "").lower()
        views = ["gills", "front"]
        if risk in ("deadly", "critical", "high") or "amanita" in c.lower() or "lepiota" in c.lower():
            views = ["gills", "front", "detail", "habitat"]
        elif "bolet" in c.lower() or "imleria" in c.lower() or "leccinum" in c.lower():
            views = ["gills", "front", "detail"]  # pores as gills slot
        per_class[c] = {
            "recommended_views": views,
            "in_catalog": c in by,
            "n_lookalikes": len(rec.get("lookalikes") or []),
            "risk_level": rec.get("risk_level"),
        }

    # Deadly-involved pairs → priority diagnostic views for Identify coaching
    deadly_names: set[str] = set()
    if DEADLY_SET.is_file():
        raw = json.loads(DEADLY_SET.read_text(encoding="utf-8"))
        names = raw if isinstance(raw, list) else raw.get("species") or raw.get("latin_names") or []
        if names and isinstance(names[0], dict):
            names = [x.get("latin_name") or x.get("name") for x in names]
        deadly_names = {str(n) for n in names if n}
    from collections import Counter

    view_votes: Counter[str] = Counter()
    deadly_pairs = []
    for p in entries:
        taxa = set(p.get("taxa") or [])
        if taxa & deadly_names:
            deadly_pairs.append(
                {
                    "id": p.get("id"),
                    "taxa": p.get("taxa"),
                    "why": p.get("why"),
                    "critical_views": p.get("critical_views"),
                }
            )
            for v in p.get("critical_views") or []:
                view_votes[str(v)] += 1
    order_pref = ["gills", "front", "detail", "habitat"]
    priority = sorted(
        view_votes.keys(),
        key=lambda v: (-view_votes[v], order_pref.index(v) if v in order_pref else 9),
    ) or order_pref

    doc = {
        "version": "1.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": "orientation_only_never_consume",
        "canonical_views": ["gills", "front", "habitat", "detail"],
        "view_weights": {"gills": 0.38, "front": 0.32, "habitat": 0.15, "detail": 0.15},
        "classic_pairs": entries,
        "ml40_class_views": per_class,
        "deadly_diagnostic": {
            "priority_views": priority,
            "view_votes": dict(view_votes),
            "n_pairs_involving_deadly": len(deadly_pairs),
            "pairs": deadly_pairs,
            "coach_es": (
                "Para confusiones con mortales: prioriza láminas (gills), perfil/pie (front) "
                "y base/volva/anillo (detail). Multi-foto sin esas vistas no basta."
            ),
            "coach_en": (
                "For deadly confusions: prioritize gills, full profile/stem (front), "
                "and base/volva/ring (detail). Extra photos without those views are not enough."
            ),
            "policy": "orientation_only_never_consume",
        },
        "note": "critical_views guide the 4-photo wizard; never harvest permission.",
    }
    DIAG.parent.mkdir(parents=True, exist_ok=True)
    DIAG.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    FE_DIAG.parent.mkdir(parents=True, exist_ok=True)
    FE_DIAG.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "path": str(DIAG.relative_to(ROOT)).replace("\\", "/"),
        "n_pairs": len(entries),
        "n_ml40": len(per_class),
        "ml40_in_catalog": sum(1 for v in per_class.values() if v["in_catalog"]),
        "ml40_with_lookalikes": sum(1 for v in per_class.values() if v["n_lookalikes"] > 0),
        "n_deadly_pairs": len(deadly_pairs),
        "deadly_priority_views": priority,
    }


def ml_coverage(v2: dict, ml_classes: list[str]) -> dict:
    by = {str(s.get("scientific_name", "")).strip(): s for s in v2.get("species") or []}
    missing = [c for c in ml_classes if c not in by]
    no_lk = [c for c in ml_classes if c in by and not (by[c].get("lookalikes") or [])]
    return {
        "n_ml40": len(ml_classes),
        "catalog_total": len(v2.get("species") or []),
        "ml40_in_catalog": len(ml_classes) - len(missing),
        "missing": missing,
        "ml40_without_lookalikes": no_lk,
        "ml40_lookalike_coverage": round(
            (len(ml_classes) - len(missing) - len(no_lk)) / max(1, len(ml_classes)), 4
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sync", action="store_true", help="Run sync_catalog_ssot after expand")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not L2I.is_file():
        print("FAIL: label2idx missing", L2I, file=sys.stderr)
        return 2
    ml_classes = list(json.loads(L2I.read_text(encoding="utf-8")).keys())
    v2 = json.loads(V2_PATH.read_text(encoding="utf-8"))

    before = ml_coverage(v2, ml_classes)
    stubs = expand_stubs(v2, ml_classes)
    edges = expand_lookalikes(v2)
    after_mid = ml_coverage(v2, ml_classes)

    if not args.dry_run:
        V2_PATH.write_text(json.dumps(v2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    diag = build_diagnostic_map(v2, ml_classes)
    after = ml_coverage(v2, ml_classes)

    sync_rc = None
    if args.sync and not args.dry_run:
        from subprocess import run

        r = run([sys.executable, str(ROOT / "scripts" / "sync_catalog_ssot.py")], cwd=str(ROOT))
        sync_rc = r.returncode

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "policy": "orientation_only_never_consume",
        "before": before,
        "stubs": stubs,
        "edges": edges,
        "after": after,
        "diagnostic_map": diag,
        "sync_rc": sync_rc,
        "dry_run": args.dry_run,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "catalog_total": after["catalog_total"],
        "ml40_in_catalog": after["ml40_in_catalog"],
        "missing": after["missing"],
        "lookalike_coverage": after["ml40_lookalike_coverage"],
        "stubs_added": stubs.get("added_stubs"),
        "edges_added": edges.get("edges_added"),
        "diag": diag.get("path"),
        "sync_rc": sync_rc,
        "report": str(REPORT),
    }, indent=2))
    return 0 if not after["missing"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

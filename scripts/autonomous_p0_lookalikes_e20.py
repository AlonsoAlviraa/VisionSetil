#!/usr/bin/env python3
"""Autonomous P0: fix E20 notebook freeze + expand curated SSOT lookalikes."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fix_e20_notebook() -> int:
    nb_path = ROOT / "kaggle/push_e20/visionsetil_exp_v20_source_holdout.ipynb"
    if not nb_path.exists():
        print("notebook missing")
        return 0
    nb = json.loads(nb_path.read_text(encoding="utf-8"))
    n_repl = 0
    bare = "for p in model.backbone.backbone.parameters():"
    safe = "for p in _unwrap(model).backbone.backbone.parameters():"
    for cell in nb.get("cells", []):
        src = cell.get("source", "")
        if isinstance(src, list):
            new = []
            for line in src:
                if bare in line:
                    new.append(line.replace(bare, safe))
                    n_repl += 1
                else:
                    new.append(line)
            cell["source"] = new
        elif isinstance(src, str) and bare in src:
            cell["source"] = src.replace(bare, safe)
            n_repl += src.count(bare)
    nb_path.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"notebook freeze replacements: {n_repl}")
    return n_repl


def expand_lookalikes() -> dict:
    v2_path = ROOT / "data/species_catalog/species_catalog_v2.json"
    v2 = json.loads(v2_path.read_text(encoding="utf-8"))
    by_name = {s["scientific_name"]: s for s in v2["species"]}

    classic = [
        ("Amanita caesarea", "Amanita phalloides", "MORTAL, volva y laminas blancas"),
        ("Amanita caesarea", "Amanita muscaria", "Anillo/volva y color"),
        ("Amanita muscaria", "Amanita pantherina", "Anillo, volva y base del pie"),
        ("Amanita pantherina", "Amanita muscaria", "Anillo, volva y base del pie"),
        ("Boletus edulis", "Cortinarius rubellus", "MORTAL, cortina y pie"),
        ("Cortinarius rubellus", "Boletus edulis", "No es boleto; cortinario mortal"),
        ("Macrolepiota procera", "Lepiota brunneoincarnata", "MORTAL si pequena; anillo movil"),
        ("Lepiota brunneoincarnata", "Macrolepiota procera", "Lepiota pequena mortal"),
        ("Armillaria mellea", "Galerina marginata", "MORTAL sobre madera"),
        ("Galerina marginata", "Armillaria mellea", "No confundir con seta de miel"),
        ("Cantharellus cibarius", "Omphalotus olearius", "TOXICO, laminas vs pliegues"),
        ("Omphalotus olearius", "Cantharellus cibarius", "Falso rebozuelo"),
        ("Coprinus comatus", "Coprinus atramentarius", "Alcohol + coprino reaccion peligrosa"),
        ("Coprinus atramentarius", "Coprinus comatus", "No es matacandil"),
        ("Agaricus campestris", "Amanita verna", "MORTAL, volva en base"),
        ("Amanita verna", "Agaricus campestris", "Agaricus no tiene volva"),
        ("Agaricus arvensis", "Amanita virosa", "MORTAL, volva en base"),
        ("Amanita virosa", "Agaricus arvensis", "No es agaricus"),
        ("Lactarius deliciosus", "Lactarius torminosus", "Latex y habitat"),
        ("Kuehneromyces mutabilis", "Galerina marginata", "MORTAL sobre madera"),
        ("Galerina marginata", "Kuehneromyces mutabilis", "Galerina mortal"),
        ("Gyromitra esculenta", "Morchella esculenta", "TOXICO/MORTAL; no es colmenilla"),
        ("Morchella esculenta", "Gyromitra esculenta", "Costillas vs camaras"),
        ("Calocybe gambosa", "Entoloma sinuatum", "TOXICO, laminas rosadas"),
        ("Entoloma sinuatum", "Calocybe gambosa", "No es seta de San Jorge"),
        ("Marasmius oreades", "Clitocybe rivulosa", "TOXICO, laminas decurrentes"),
        ("Clitocybe rivulosa", "Marasmius oreades", "Senderuela vs clitocybe"),
        ("Clitopilus prunulus", "Clitocybe dealbata", "TOXICO"),
        ("Russula virescens", "Amanita phalloides", "MORTAL, volva y anillo"),
    ]

    def ensure_pair(a: str, b: str, note: str) -> bool:
        if a not in by_name or b not in by_name:
            return False
        rec = by_name[a]
        lks = list(rec.get("lookalikes") or [])
        names = set()
        for lk in lks:
            if isinstance(lk, dict):
                names.add(lk.get("scientific_name"))
            elif isinstance(lk, str):
                names.add(lk)
        if b in names:
            return False
        lks.append({"scientific_name": b, "note_key": note})
        rec["lookalikes"] = lks
        return True

    fixed_typo = 0
    for s in v2["species"]:
        lks = s.get("lookalikes") or []
        new = []
        for lk in lks:
            if isinstance(lk, dict) and lk.get("scientific_name") in (
                "Coprinus atramentarus",
                "Coprinopsis atramentaria",
            ):
                # SSOT row is Coprinus atramentarius (catalog spelling)
                lk = dict(lk)
                lk["scientific_name"] = "Coprinus atramentarius"
                fixed_typo += 1
            new.append(lk)
        if lks:
            s["lookalikes"] = new

    added = sum(1 for a, b, note in classic if ensure_pair(a, b, note))
    with_lk = sum(1 for s in v2["species"] if s.get("lookalikes"))
    v2_path.write_text(json.dumps(v2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    stats = {"added": added, "typo_fixes": fixed_typo, "taxa_with_lookalikes": with_lk}
    print(stats)
    return stats


if __name__ == "__main__":
    fix_e20_notebook()
    expand_lookalikes()

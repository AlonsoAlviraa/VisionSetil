#!/usr/bin/env python3
"""Expand curated SSOT lookalike edges (v1.2.15 residual while E20 RUNNING).

Policy: orientation_only; educational confusions only; never invent taxa;
never consumption permission. Both endpoints must already exist in catalog_v2.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V2_PATH = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"

# Directed (a -> b, note). Bidirectional pairs listed both ways.
NEW_EDGES: list[tuple[str, str, str]] = [
    # Deadly amanitas vs white/yellow lookalikes
    ("Amanita phalloides", "Amanita citrina", "MORTAL; volva y laminas blancas vs citrina"),
    ("Amanita citrina", "Amanita phalloides", "No es mortal; volva y olor distintos"),
    ("Amanita phalloides", "Amanita vaginata", "MORTAL; anillo y volva vs vaginata"),
    ("Amanita vaginata", "Amanita phalloides", "Sin anillo; no es phalloides"),
    ("Amanita virosa", "Amanita vaginata", "MORTAL; anillo y base del pie"),
    ("Amanita vaginata", "Amanita virosa", "Sin anillo; no es virosa"),
    ("Amanita verna", "Amanita vaginata", "MORTAL; anillo y volva"),
    ("Amanita vaginata", "Amanita verna", "Sin anillo; no es verna"),
    ("Amanita pantherina", "Amanita rubescens", "TOXICO; volva y enrojecimiento"),
    ("Amanita rubescens", "Amanita pantherina", "Enrojece al corte; no es pantherina"),
    ("Amanita phalloides", "Volvopluteus gloiocephalus", "MORTAL; laminas blancas vs rosadas"),
    ("Volvopluteus gloiocephalus", "Amanita phalloides", "Laminas rosadas; no es amanita"),
    ("Amanita proxima", "Amanita ovoidea", "TOXICO/MORTAL regional; no confundir ovoidea"),
    ("Amanita ovoidea", "Amanita proxima", "Proxima peligrosa en SW iberico"),
    # Small lepiotas / chlorophyllum
    ("Lepiota subincarnata", "Macrolepiota procera", "MORTAL si pequena"),
    ("Macrolepiota procera", "Lepiota subincarnata", "Lepiota pequena mortal"),
    ("Chlorophyllum molybdites", "Chlorophyllum rhacodes", "TOXICO; esporada verdosa"),
    ("Chlorophyllum rhacodes", "Chlorophyllum molybdites", "Esporada distinta; no confiar"),
    ("Chlorophyllum molybdites", "Macrolepiota procera", "TOXICO; no es parasol"),
    ("Macrolepiota procera", "Chlorophyllum molybdites", "Parasol vs chlorophyllum toxico"),
    # Morels / false morels
    ("Gyromitra esculenta", "Morchella elata", "TOXICO/MORTAL; camaras vs costillas"),
    ("Morchella elata", "Gyromitra esculenta", "Colmenilla verdadera; no gyromitra"),
    # Wood-decay confusions
    ("Hypholoma fasciculare", "Armillaria mellea", "TOXICO; no es seta de miel"),
    ("Armillaria mellea", "Hypholoma fasciculare", "Banda anular y sabor amargo en hypholoma"),
    ("Hypholoma fasciculare", "Kuehneromyces mutabilis", "TOXICO; no es pholiota comestible"),
    ("Kuehneromyces mutabilis", "Hypholoma fasciculare", "Hypholoma amargo toxico"),
    # Meadow / spring confusions
    ("Inocybe erubescens", "Calocybe gambosa", "MORTAL/TOXICO; no es seta de San Jorge"),
    ("Calocybe gambosa", "Inocybe erubescens", "Inocybe peligrosa en prados"),
    ("Entoloma sinuatum", "Clitopilus prunulus", "TOXICO; laminas y olor"),
    ("Clitopilus prunulus", "Entoloma sinuatum", "No es entoloma toxico"),
    # Cortinarius deadly vs chanterelle-ish confusion (educational)
    ("Cortinarius orellanus", "Cantharellus cibarius", "MORTAL; cortina y esporada"),
    ("Cantharellus cibarius", "Cortinarius orellanus", "Pliegues vs laminas; cortinario mortal"),
    # Russula educational
    ("Russula emetica", "Russula cyanoxantha", "TOXICO; picor fuerte"),
    ("Russula cyanoxantha", "Russula emetica", "No es emetica; sabor y cuticula"),
    # Conocybe deadly small brown
    ("Conocybe filaris", "Galerina marginata", "MORTAL; pequenos pardos sobre madera"),
    ("Galerina marginata", "Conocybe filaris", "Ambos mortales; no confiar en color"),
]


def _names(lks: list) -> set[str]:
    out: set[str] = set()
    for lk in lks or []:
        if isinstance(lk, dict):
            n = str(lk.get("scientific_name") or "").strip()
        else:
            n = str(lk or "").strip()
        if n:
            out.add(n)
    return out


def main() -> dict:
    v2 = json.loads(V2_PATH.read_text(encoding="utf-8"))
    by_name = {str(s.get("scientific_name", "")).strip(): s for s in v2.get("species") or []}
    added = 0
    skipped_missing = 0
    already = 0
    for a, b, note in NEW_EDGES:
        if a not in by_name or b not in by_name:
            skipped_missing += 1
            print("SKIP missing taxon", a, b)
            continue
        rec = by_name[a]
        lks = list(rec.get("lookalikes") or [])
        if b in _names(lks):
            already += 1
            continue
        lks.append({"scientific_name": b, "note_key": note})
        rec["lookalikes"] = lks
        added += 1

    with_lk = sum(1 for s in v2["species"] if s.get("lookalikes"))
    directed = 0
    for s in v2["species"]:
        directed += len(s.get("lookalikes") or [])
    V2_PATH.write_text(json.dumps(v2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    stats = {
        "added": added,
        "already": already,
        "skipped_missing": skipped_missing,
        "taxa_with_lookalikes": with_lk,
        "directed_edges": directed,
    }
    print(json.dumps(stats, indent=2))
    return stats


if __name__ == "__main__":
    main()

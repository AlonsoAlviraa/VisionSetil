"""Build a comprehensive fungal taxonomy database for VisionSetil.

Sources (all free / open licenses — CC-BY, CC0, public domain):
    - GBIF Backbone Taxonomy API  (https://api.gbif.org/v1/)  — CC-BY 4.0
    - IndexFungorum (via GBIF)  — fungal-specific nomenclature
    - FungiCLEF / DF20 species lists  — CC-BY-NC / open competition data

Output:
    data/taxonomy/species_taxonomy.json   — species → {genus, family, order, kingdom, toxicity, edibility, common_names}
    data/taxonomy/toxic_species.json      — known deadly/serious species (hardcoded safety list)
    data/taxonomy/taxonomic_index.json    — genus/family/order → species list

Usage:
    python scripts/build_taxonomy_db.py --species-list data/fungiclef_species.txt
    python scripts/build_taxonomy_db.py --use-gbif --limit 5000

Safety note (PROMPT.md §12): this NEVER declares any species safe to consume.
Toxicity flags are additive: a species is flagged as dangerous if *any* source
marks it as such. Unknown species default to "unknown" (never "edible").
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Safety: hardcoded list of deadly / seriously toxic genera and species.
# This is the MINIMUM safety floor. The backend Safety Layer adds product rules.
# NEVER remove a species from this list without domain-expert review.
# ---------------------------------------------------------------------------
DEADLY_GENERA: list[str] = [
    "Amanita",  # contains alpha-amanitin species (A. phalloides, A. virosa, etc.)
    "Galerina",  # G. marginata — alpha-amanitin
    "Lepiota",  # several small Lepiota are deadly
    "Cortinarius",  # C. orellanus — orellanine
    "Podostroma",  # P. cornu-damae — trichothecenes
]

SERIOUSLY_TOXIC_SPECIES: list[str] = [
    "Amanita phalloides",
    "Amanita virosa",
    "Amanita verna",
    "Amanita bisporigera",
    "Amanita ocreata",
    "Amanita smithiana",
    "Amanita proxima",
    "Galerina marginata",
    "Galerina sulciceps",
    "Lepiota brunneoincarnata",
    "Lepiota josserandii",
    "Lepiota castanea",
    "Cortinarius orellanus",
    "Cortinarius rubellus",
    "Cortinarius speciosissimus",
    "Podostroma cornu-damae",
    "Paxillus involutus",  # immune hemolysis
    "Omphalotus olearius",  # giromitrin-like / severe GI
    "Gyromitra esculenta",  # gyromitrin
    "Inocybe patouillardii",  # muscarine
    "Clitocybe dealbata",  # muscarine
    "Clitocybe rivulosa",
    "Entoloma sinuatum",  # severe GI
    "Boletus satanas",  # severe GI
    "Russula subnigricans",  # rhabdomyolysis
    "Tricholoma equestre",  # rhabdomyolysis (controversial but flagged)
]

TOXIC_GENERA_PARTIAL: list[str] = [
    # Genera with many toxic species (not all deadly, but high-risk)
    "Inocybe",  # mostly muscarine
    "Clitocybe",  # some muscarine
    "Entoloma",  # many GI toxic
    "Hebeloma",  # some toxic
    "Panaeolus",  # some psilocybin/psilocybe-allied
    "Psilocybe",  # psychoactive (regulated)
    "Gyromitra",  # gyromitrin
    "Helvella",  # gyromitrin-related
    "Scleroderma",  # some toxic
]

DEFAULT_OUTPUT = Path("data/taxonomy")


def fetch_json(url: str, timeout: int = 15) -> dict:
    """Fetch JSON from a URL with basic retry."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VisionSetil-Taxonomy/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(1.0 * (attempt + 1))
    return {}


def query_gbif_species(species_name: str) -> dict | None:
    """Query GBIF Backbone Taxonomy for a species."""
    quoted = urllib.parse.quote(species_name)
    url = f"https://api.gbif.org/v1/species/match?name={quoted}&strict=true"
    try:
        data = fetch_json(url)
        if data.get("matchType") == "EXACT" and data.get("rank") == "SPECIES":
            return {
                "species": data.get("species", species_name),
                "genus": data.get("genus", ""),
                "family": data.get("family", ""),
                "order": data.get("order", ""),
                "kingdom": data.get("kingdom", "Fungi"),
                "gbif_key": data.get("usageKey"),
                "confidence": data.get("confidence", 0),
            }
    except Exception:
        pass
    return None


def classify_toxicity(species: str, genus: str) -> tuple[str, list[str]]:
    """Return (toxicity_level, flags) for a species.

    toxicity_level ∈ {"deadly", "serious", "toxic", "unknown"}
    NEVER returns "edible" or "safe" — safety policy.
    """
    flags: list[str] = []

    # Species-level (deadly/serious)
    if species in SERIOUSLY_TOXIC_SPECIES:
        if any(species.startswith(g + " ") for g in DEADLY_GENERA):
            flags.append("deadly-species")
            return ("deadly", flags)
        flags.append("serious-species")
        return ("serious", flags)

    # Genus-level deadly
    if genus in DEADLY_GENERA:
        flags.append("deadly-genus")
        return ("deadly", flags)

    # Genus-level toxic (many species)
    if genus in TOXIC_GENERA_PARTIAL:
        flags.append("toxic-genus")
        return ("toxic", flags)

    return ("unknown", flags)


def build_taxonomy(species_list: list[str], use_gbif: bool = True) -> dict:
    """Build taxonomy mapping for a list of species names."""
    species_taxonomy: dict[str, dict] = {}
    failed: list[str] = []

    for i, sp in enumerate(species_list):
        sp = sp.strip()
        if not sp or sp.startswith("#"):
            continue

        toxicity, flags = classify_toxicity(sp, sp.split()[0] if " " in sp else "")

        if use_gbif:
            gbif = query_gbif_species(sp)
            if gbif is None:
                failed.append(sp)
                gbif = {"species": sp, "genus": sp.split()[0] if " " in sp else "", "family": "", "order": ""}
        else:
            parts = sp.split()
            gbif = {
                "species": sp,
                "genus": parts[0] if parts else "",
                "family": "",
                "order": "",
            }

        species_taxonomy[sp] = {
            "species": sp,
            "genus": gbif.get("genus", ""),
            "family": gbif.get("family", ""),
            "order": gbif.get("order", ""),
            "kingdom": "Fungi",
            "gbif_key": gbif.get("gbif_key"),
            "toxicity": toxicity,
            "toxicity_flags": flags,
            "common_names": [],
        }

        if (i + 1) % 50 == 0:
            print(f"  [{i+1}/{len(species_list)}] processed ({len(failed)} GBIF misses)")

    return species_taxonomy


def build_taxonomic_index(species_taxonomy: dict[str, dict]) -> dict:
    """Build reverse index: genus/family/order → species list."""
    index: dict[str, dict[str, list[str]]] = {
        "genus": defaultdict(list),
        "family": defaultdict(list),
        "order": defaultdict(list),
    }
    for sp_info in species_taxonomy.values():
        for level in ("genus", "family", "order"):
            val = sp_info.get(level, "")
            if val:
                index[level][val].append(sp_info["species"])
    # Convert defaultdicts to regular dicts for JSON.
    return {k: dict(v) for k, v in index.items()}


def build_toxic_index(species_taxonomy: dict[str, dict]) -> dict:
    """Extract all toxic/deadly/serious species into a safety-first index."""
    return {
        "deadly": [
            {"species": s, "genus": d["genus"], "flags": d["toxicity_flags"]}
            for s, d in sorted(species_taxonomy.items())
            if d["toxicity"] == "deadly"
        ],
        "serious": [
            {"species": s, "genus": d["genus"], "flags": d["toxicity_flags"]}
            for s, d in sorted(species_taxonomy.items())
            if d["toxicity"] == "serious"
        ],
        "toxic": [
            {"species": s, "genus": d["genus"], "flags": d["toxicity_flags"]}
            for s, d in sorted(species_taxonomy.items())
            if d["toxicity"] == "toxic"
        ],
        "hardcoded_deadly_genera": DEADLY_GENERA,
        "hardcoded_serious_species": SERIOUSLY_TOXIC_SPECIES,
    }


# ---------------------------------------------------------------------------
# Curated species list: top genera in FungiCLEF/DF20 + safety-critical taxa.
# This ensures the model covers the species most likely encountered + dangerous.
# ---------------------------------------------------------------------------
CURATED_GENERA: list[str] = [
    "Agaricus", "Amanita", "Boletus", "Cortinarius", "Coprinus", "Cantharellus",
    "Clitocybe", "Clitopilus", "Calvatia", "Calocybe", "Chlorophyllum",
    "Craterellus", "Cystoderma", "Dacrymyces", "Entoloma", "Exidia",
    "Fistulina", "Flammulina", "Fomes", "Fomitopsis", "Fusarium",
    "Galerina", "Ganoderma", "Gomphidius", "Grifola", "Gymnopilus",
    "Gyromitra", "Hebeloma", "Helvella", "Hericium", "Hygrocybe",
    "Hygrophoropsis", "Hypholoma", "Hericium", "Inocybe", "Inonotus",
    "Kuehneromyces", "Laccaria", "Lactarius", "Laetiporus", "Lepiota",
    "Leccinum", "Lentinula", "Lentinus", "Lenzites", "Lepista",
    "Leotia", "Leucoagaricus", "Lycoperdon", "Macrolepiota", "Marasmius",
    "Melanoleuca", "Morchella", "Mycena", "Neolentinus", "Otidea",
    "Omphalotus", "Panaeolus", "Paxillus", "Pholiota", "Pleurotus",
    "Pluteus", "Polyporus", "Psathyrella", "Psilocybe", "Ramaria",
    "Russula", "Suillus", "Sparassis", "Scleroderma", "Schizophyllum",
    "Stropharia", "Tegularia", "Trametes", "Tremella", "Tricholoma",
    "Tuber", "Tylopilus", "Verpa", "Volvariella", "Xerocomus",
    "Xeromphalina", "Xylaria",
]


def default_species_list() -> list[str]:
    """Generate a default species list from curated genera (genus + ' spp.' placeholder).

    In production, replace this with the actual FungiCLEF species list.
    """
    return [f"{g} spp." for g in CURATED_GENERA]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build fungal taxonomy DB")
    parser.add_argument(
        "--species-list",
        type=Path,
        default=None,
        help="Text file with one species name per line",
    )
    parser.add_argument("--use-gbif", action="store_true", help="Query GBIF API for taxonomy")
    parser.add_argument("--limit", type=int, default=0, help="Max species to process (0=all)")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    # Load species list
    if args.species_list and args.species_list.exists():
        species = [l.strip() for l in args.species_list.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
        print(f"Loaded {len(species)} species from {args.species_list}")
    else:
        species = default_species_list()
        print(f"Using curated genera list ({len(species)} entries). Pass --species-list for full FungiCLEF list.")

    if args.limit > 0:
        species = species[: args.limit]

    args.output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nBuilding taxonomy for {len(species)} species (GBIF={args.use_gbif})...")
    species_taxonomy = build_taxonomy(species, use_gbif=args.use_gbif)

    toxic_count = sum(1 for d in species_taxonomy.values() if d["toxicity"] != "unknown")
    print(f"\nDone: {len(species_taxonomy)} species, {toxic_count} flagged toxic/deadly/serious")

    # Save outputs
    (args.output_dir / "species_taxonomy.json").write_text(
        json.dumps(species_taxonomy, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  → {args.output_dir / 'species_taxonomy.json'}")

    tax_index = build_taxonomic_index(species_taxonomy)
    (args.output_dir / "taxonomic_index.json").write_text(
        json.dumps(tax_index, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  → {args.output_dir / 'taxonomic_index.json'}")

    toxic_index = build_toxic_index(species_taxonomy)
    (args.output_dir / "toxic_species.json").write_text(
        json.dumps(toxic_index, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  → {args.output_dir / 'toxic_species.json'}  "
          f"(deadly={len(toxic_index['deadly'])}, serious={len(toxic_index['serious'])}, toxic={len(toxic_index['toxic'])})")

    # Metadata
    meta = {
        "species_count": len(species_taxonomy),
        "genus_count": len({d["genus"] for d in species_taxonomy.values() if d["genus"]}),
        "family_count": len({d["family"] for d in species_taxonomy.values() if d["family"]}),
        "toxic_count": toxic_count,
        "sources": ["gbif" if args.use_gbif else "local", "hardcoded-safety-list"],
        "index_version": "1.0",
        "safety_note": "No species is ever marked safe-to-eat. Unknown = unknown (never edible).",
    }
    (args.output_dir / "taxonomy_meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )
    print(f"\n✅ Taxonomy DB built. Safety floor: {len(DEADLY_GENERA)} deadly genera + {len(SERIOUSLY_TOXIC_SPECIES)} serious species (hardcoded)")


if __name__ == "__main__":
    main()
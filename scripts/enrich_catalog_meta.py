#!/usr/bin/env python3
"""
Enrich speciesCatalog.json with family, season, iberian_relevance, educ hints.
Educational only — never invents "comestible" without prior food_class / override.

Usage (from repo root):
  python scripts/enrich_catalog_meta.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "frontend" / "src" / "data" / "speciesCatalog.json"
SNAPSHOT = ROOT / "frontend" / "src" / "data" / "generated" / "species_catalog_snapshot.json"

GENUS_FAMILY = {
    "agaricus": "Agaricaceae",
    "lepiota": "Agaricaceae",
    "macrolepiota": "Agaricaceae",
    "chlorophyllum": "Agaricaceae",
    "cystoderma": "Agaricaceae",
    "leucoagaricus": "Agaricaceae",
    "cystolepiota": "Agaricaceae",
    "amanita": "Amanitaceae",
    "limacella": "Amanitaceae",
    "boletus": "Boletaceae",
    "neoboletus": "Boletaceae",
    "rubroboletus": "Boletaceae",
    "suillellus": "Boletaceae",
    "caloboletus": "Boletaceae",
    "butyriboletus": "Boletaceae",
    "hemileccinum": "Boletaceae",
    "hortiboletus": "Boletaceae",
    "xerocomellus": "Boletaceae",
    "xerocomus": "Boletaceae",
    "imleria": "Boletaceae",
    "leccinum": "Boletaceae",
    "tylopilus": "Boletaceae",
    "chalciporus": "Boletaceae",
    "gyroporus": "Boletaceae",
    "aureoboletus": "Boletaceae",
    "cyanoboletus": "Boletaceae",
    "rheubarbariboletus": "Boletaceae",
    "porphyrellus": "Boletaceae",
    "buchwaldoboletus": "Boletaceae",
    "pseudoboletus": "Boletaceae",
    "strobilomyces": "Boletaceae",
    "suillus": "Suillaceae",
    "cantharellus": "Cantharellaceae",
    "craterellus": "Cantharellaceae",
    "hydnum": "Hydnaceae",
    "sarcodon": "Bankeraceae",
    "bankera": "Bankeraceae",
    "phellodon": "Bankeraceae",
    "hydnellum": "Bankeraceae",
    "russula": "Russulaceae",
    "lactarius": "Russulaceae",
    "lactifluus": "Russulaceae",
    "tricholoma": "Tricholomataceae",
    "tricholomopsis": "Tricholomataceae",
    "lepista": "Tricholomataceae",
    "clitocybe": "Tricholomataceae",
    "infundibulicybe": "Tricholomataceae",
    "melanoleuca": "Tricholomataceae",
    "collybia": "Tricholomataceae",
    "armillaria": "Physalacriaceae",
    "flammulina": "Physalacriaceae",
    "oudemansiella": "Physalacriaceae",
    "hymenopellis": "Physalacriaceae",
    "xerula": "Physalacriaceae",
    "pleurotus": "Pleurotaceae",
    "lentinula": "Omphalotaceae",
    "gymnopus": "Omphalotaceae",
    "rhodocollybia": "Omphalotaceae",
    "omphalotus": "Omphalotaceae",
    "marasmius": "Marasmiaceae",
    "megacollybia": "Marasmiaceae",
    "mycena": "Mycenaceae",
    "panellus": "Mycenaceae",
    "hypholoma": "Strophariaceae",
    "stropharia": "Strophariaceae",
    "pholiota": "Strophariaceae",
    "agrocybe": "Strophariaceae",
    "cyclocybe": "Strophariaceae",
    "kuehneromyces": "Strophariaceae",
    "psilocybe": "Hymenogastraceae",
    "galerina": "Hymenogastraceae",
    "hebeloma": "Hymenogastraceae",
    "gymnopilus": "Hymenogastraceae",
    "inocybe": "Inocybaceae",
    "cortinarius": "Cortinariaceae",
    "coprinus": "Agaricaceae",
    "coprinopsis": "Psathyrellaceae",
    "coprinellus": "Psathyrellaceae",
    "psathyrella": "Psathyrellaceae",
    "lacrymaria": "Psathyrellaceae",
    "panaeolus": "Bolbitiaceae",
    "pluteus": "Pluteaceae",
    "volvariella": "Pluteaceae",
    "entoloma": "Entolomataceae",
    "paxillus": "Paxillaceae",
    "tapinella": "Tapinellaceae",
    "gomphidius": "Gomphidiaceae",
    "chroogomphus": "Gomphidiaceae",
    "scleroderma": "Sclerodermataceae",
    "pisolithus": "Sclerodermataceae",
    "lycoperdon": "Agaricaceae",
    "calvatia": "Agaricaceae",
    "bovista": "Agaricaceae",
    "langermannia": "Agaricaceae",
    "geastrum": "Geastraceae",
    "astraeus": "Diplocystaceae",
    "morchella": "Morchellaceae",
    "verpa": "Morchellaceae",
    "gyromitra": "Discinaceae",
    "helvella": "Helvellaceae",
    "peziza": "Pezizaceae",
    "terfezia": "Pezizaceae",
    "aleuria": "Pyronemataceae",
    "sarcoscypha": "Sarcoscyphaceae",
    "tuber": "Tuberaceae",
    "clathrus": "Phallaceae",
    "phallus": "Phallaceae",
    "mutinus": "Phallaceae",
    "sparassis": "Sparassidaceae",
    "hericium": "Hericiaceae",
    "trametes": "Polyporaceae",
    "fomes": "Polyporaceae",
    "polyporus": "Polyporaceae",
    "panus": "Polyporaceae",
    "lentinus": "Polyporaceae",
    "ganoderma": "Ganodermataceae",
    "fistulina": "Fistulinaceae",
    "laetiporus": "Fomitopsidaceae",
    "piptoporus": "Fomitopsidaceae",
    "daedalea": "Fomitopsidaceae",
    "stereum": "Stereaceae",
    "auricularia": "Auriculariaceae",
    "tremella": "Tremellaceae",
    "calocera": "Dacrymycetaceae",
    "dacrymyces": "Dacrymycetaceae",
    "schizophyllum": "Schizophyllaceae",
    "neolentinus": "Gloeophyllaceae",
    "crepidotus": "Crepidotaceae",
    "thelephora": "Thelephoraceae",
    "clavulina": "Clavulinaceae",
    "ramaria": "Gomphaceae",
    "clavariadelphus": "Clavariadelphaceae",
    "clavaria": "Clavariaceae",
    "rhizopogon": "Rhizopogonaceae",
    "hygrophorus": "Hygrophoraceae",
    "hygrocybe": "Hygrophoraceae",
    "cuphophyllus": "Hygrophoraceae",
    "lyophyllum": "Lyophyllaceae",
    "calocybe": "Lyophyllaceae",
}

GENUS_SEASON = {
    "Lactarius": "Otoño",
    "Lactifluus": "Verano–otoño",
    "Russula": "Verano–otoño",
    "Amanita": "Verano–otoño",
    "Boletus": "Verano–otoño",
    "Cortinarius": "Otoño",
    "Tricholoma": "Otoño–invierno",
    "Hygrophorus": "Otoño–invierno",
    "Hygrocybe": "Otoño",
    "Agaricus": "Primavera–otoño",
    "Macrolepiota": "Verano–otoño",
    "Lepiota": "Verano–otoño",
    "Cantharellus": "Verano–otoño",
    "Craterellus": "Otoño",
    "Hydnum": "Verano–otoño",
    "Inocybe": "Verano–otoño",
    "Hebeloma": "Otoño",
    "Entoloma": "Verano–otoño",
    "Clitocybe": "Otoño",
    "Lepista": "Otoño–invierno",
    "Melanoleuca": "Primavera–otoño",
    "Calocybe": "Primavera",
    "Lyophyllum": "Otoño",
    "Morchella": "Primavera",
    "Gyromitra": "Primavera",
    "Helvella": "Verano–otoño",
    "Tuber": "Invierno",
    "Terfezia": "Primavera",
    "Pleurotus": "Otoño–primavera",
    "Armillaria": "Otoño",
    "Flammulina": "Invierno",
    "Suillus": "Verano–otoño",
    "Leccinum": "Verano–otoño",
    "Imleria": "Verano–otoño",
    "Xerocomellus": "Verano–otoño",
    "Rubroboletus": "Verano–otoño",
    "Neoboletus": "Verano–otoño",
    "Galerina": "Todo el año",
    "Gymnopilus": "Otoño",
    "Hypholoma": "Otoño",
    "Coprinopsis": "Primavera–otoño",
    "Coprinellus": "Primavera–otoño",
    "Psathyrella": "Primavera–otoño",
    "Lacrymaria": "Verano–otoño",
    "Agrocybe": "Primavera–otoño",
    "Marasmius": "Verano–otoño",
    "Mycena": "Otoño",
    "Pluteus": "Verano–otoño",
    "Omphalotus": "Otoño",
    "Paxillus": "Verano–otoño",
    "Scleroderma": "Verano–otoño",
    "Lycoperdon": "Verano–otoño",
    "Geastrum": "Otoño",
    "Sparassis": "Verano–otoño",
    "Hericium": "Otoño",
    "Ganoderma": "Todo el año",
    "Trametes": "Todo el año",
    "Fistulina": "Verano–otoño",
    "Ramaria": "Verano–otoño",
    "Auricularia": "Invierno–primavera",
    "Sarcoscypha": "Invierno–primavera",
    "Chlorophyllum": "Verano–otoño",
    "Leucoagaricus": "Verano–otoño",
    "Hydnellum": "Otoño",
    "Sarcodon": "Otoño",
    "Cuphophyllus": "Otoño",
    "Infundibulicybe": "Otoño",
}

# Curated educ for Lactarius (Iberia) — no invented comestible for acrid/unknown groups
LACTARIUS_EDUC = {
    "lactarius deliciosus": "comestible",
    "lactarius sanguifluus": "comestible",
    "lactarius semisanguifluus": "comestible",
    "lactarius quieticolor": "comestible",
    "lactarius salmonicolor": "comestible",
    "lactarius deterrimus": "comestible",
    "lactarius volemus": "comestible",
    "lactarius torminosus": "toxica",
    "lactarius chrysorrheus": "no_comestible",
    "lactarius piperatus": "no_comestible",
    "lactarius vellereus": "no_comestible",
    "lactarius controversus": "no_comestible",
    "lactarius acerrimus": "no_comestible",
    "lactarius atlanticus": "no_comestible",
    "lactarius decipiens": "no_comestible",
    "lactarius quietus": "no_comestible",
    "lactarius rufus": "no_comestible",
    "lactarius blennius": "no_comestible",
    "lactarius zonarius": "no_comestible",
    "lactarius uvidus": "no_comestible",
    "lactarius hepaticus": "no_comestible",
    "lactarius lacunarum": "no_comestible",
    "lactarius mairei": "no_comestible",
    "lactarius fluens": "no_comestible",
    "lactarius ilicis": "no_comestible",
    "lactarius ligyotus": "no_comestible",
    "lactarius pergamenus": "no_comestible",
    "lactarius pterosporus": "no_comestible",
    "lactarius rubrocinctus": "no_comestible",
    "lactarius subdulcis": "no_comestible",
    "lactarius tabidus": "no_comestible",
}

LACTARIUS_IBERIA = {
    "lactarius deliciosus": "Icono",
    "lactarius sanguifluus": "Icono",
    "lactarius semisanguifluus": "Frecuente",
    "lactarius quieticolor": "Presente",
    "lactarius salmonicolor": "Montaña",
    "lactarius deterrimus": "Montaña",
    "lactarius atlanticus": "Atlántica",
    "lactarius acerrimus": "Mediterránea",
    "lactarius mairei": "Mediterránea",
    "lactarius zonarius": "Mediterránea",
    "lactarius ilicis": "Mediterránea",
    "lactarius ligyotus": "Montaña",
    "lactarius torminosus": "Presente",
    "lactarius chrysorrheus": "Frecuente",
    "lactarius subdulcis": "Frecuente",
    "lactarius volemus": "Presente",
}


def genus_of(taxon: str) -> str:
    return (taxon or "").strip().split()[0] if taxon else ""


def iberian_heuristic(taxon: str, common_names: list) -> str:
    vern = [n for n in (common_names or []) if n and n.strip().lower() != taxon.strip().lower()]
    if len(vern) >= 4:
        return "Icono"
    if len(vern) >= 1:
        return "Frecuente"
    return "Presente"


def parse_season_from_desc(desc: str | None) -> str | None:
    if not desc:
        return None
    import re

    m = re.search(r"Temporada:\s*([^.·;]+)", desc, re.I)
    if not m:
        return None
    raw = m.group(1).strip()
    if not raw or len(raw) > 48:
        return None
    return " ".join(raw.split())


def enrich_species(sp: dict) -> dict:
    taxon = (sp.get("taxon") or "").strip()
    genus = genus_of(taxon)
    gkey = genus.lower()
    tkey = taxon.lower()

    # Family
    fam = (sp.get("family") or "").strip()
    if not fam:
        fam = GENUS_FAMILY.get(gkey, "")
        if fam:
            sp["family"] = fam

    # Season
    season = (sp.get("season") or "").strip()
    if not season or season == "—":
        season = parse_season_from_desc(sp.get("description")) or GENUS_SEASON.get(genus) or "Otoño"
        sp["season"] = season

    # Iberia
    iber = (sp.get("iberian_relevance") or "").strip()
    if not iber or iber == "—":
        if tkey in LACTARIUS_IBERIA:
            iber = LACTARIUS_IBERIA[tkey]
        else:
            iber = iberian_heuristic(taxon, sp.get("common_names") or [])
        sp["iberian_relevance"] = iber

    # Food class for Lactarius curated (only if empty)
    if not sp.get("food_class") and tkey in LACTARIUS_EDUC:
        educ = LACTARIUS_EDUC[tkey]
        sp["food_class"] = educ
        sp["food_label"] = educ
        sp["documented_edibility"] = educ

    # Description: replace thin GBIF stub with educational genus note (keep species name)
    desc = sp.get("description") or ""
    if "edibilidad desconocida por defecto" in desc or "GBIF/capa Iberia" in desc:
        fam_show = sp.get("family") or GENUS_FAMILY.get(gkey) or "—"
        season_show = sp.get("season") or "Otoño"
        iber_show = sp.get("iberian_relevance") or "Presente"
        food = sp.get("food_class")
        food_note = (
            f"Clase documentada: {food}."
            if food
            else "Clase alimenticia no documentada en nuestras fuentes curadas (precaución)."
        )
        sp["description"] = (
            f"{taxon} ({fam_show}). Género {genus}. "
            f"Presencia en Iberia: {iber_show}. Temporada típica: {season_show}. "
            f"{food_note} "
            "Información educativa; nunca consumir basándose solo en una app."
        )

    return sp


def main() -> None:
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    species = data.get("species") or []
    for sp in species:
        enrich_species(sp)

    # stats
    n = len(species)
    with_fam = sum(1 for s in species if (s.get("family") or "").strip())
    with_season = sum(1 for s in species if (s.get("season") or "").strip())
    with_iber = sum(1 for s in species if (s.get("iberian_relevance") or "").strip())
    with_food = sum(1 for s in species if s.get("food_class"))
    thin = sum(1 for s in species if "edibilidad desconocida" in (s.get("description") or ""))

    data["count"] = n
    CATALOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Keep snapshot roughly in sync if present
    if SNAPSHOT.exists():
        try:
            snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
            if isinstance(snap, dict) and "species" in snap:
                for sp in snap["species"]:
                    enrich_species(sp)
                SNAPSHOT.write_text(
                    json.dumps(snap, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
                )
        except Exception as e:
            print("snapshot skip:", e)

    print(f"enriched {n} species")
    print(f"  family: {with_fam}/{n}")
    print(f"  season: {with_season}/{n}")
    print(f"  iberian: {with_iber}/{n}")
    print(f"  food_class: {with_food}/{n}")
    print(f"  thin stubs left: {thin}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build GBIF Iberia species layer for catalog expansion to 500+.

Primary: GBIF occurrence facets for ES (+ PT) under Fungi (kingdomKey=5).
Fallback: curated European/Iberian scientific names if network fails.

Usage:
  python scripts/expand_gbif_iberia.py
  python scripts/expand_gbif_iberia.py --target 520 --countries ES,PT
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
OUT = ROOT / "data" / "species_catalog" / "layers" / "gbif_iberia_top.json"

USER_AGENT = (
    "VisionSetilBot/1.0 (+https://github.com/AlonsoAlviraa/VisionSetil; "
    "catalog-expand@visionsetil.local)"
)
FUNGI_KINGDOM_KEY = 5  # GBIF kingdom Fungi

# Curated extra names (Iberia/Europe) used to guarantee ≥500 when facets are thin.
FALLBACK_NAMES: list[str] = [
    "Amanita ceciliae", "Amanita excelsa", "Amanita lividopallescens", "Amanita porphyria",
    "Amanita submembranacea", "Amanita umbrinolutea", "Amanita vitadini", "Amanita xerocybe",
    "Agaricus cupreobrunneus", "Agaricus dulcidulus", "Agaricus essettei", "Agaricus excellens",
    "Agaricus freirei", "Agaricus fuscofibrillosus", "Agaricus impudicus", "Agaricus lanipes",
    "Agaricus maleolens", "Agaricus pampeanus", "Agaricus porphyrizon", "Agaricus subperonatus",
    "Macrolepiota excoriata", "Macrolepiota fuliginosa", "Leucoagaricus americanus",
    "Leucoagaricus nympharum", "Lepiota aspera", "Lepiota castanea", "Lepiota felina",
    "Lepiota erminea", "Lepiota lilacea", "Lepiota subincarnata", "Cystolepiota seminuda",
    "Boletus subtomentosus", "Boletus queletii", "Boletus rhodoxanthus", "Boletus legaliae",
    "Boletus lupinus", "Boletus permagnificus", "Boletus pulverulentus", "Boletus radicans",
    "Boletus torosus", "Suillus variegatus", "Suillus tridentinus", "Suillus plorans",
    "Suillus sibiricus", "Suillus viscidus", "Xerocomellus pruinatus", "Xerocomellus cisalpinus",
    "Xerocomellus porosporus", "Hemileccinum impolitum", "Leccinum aurantiacum",
    "Leccinum pseudoscabrum", "Leccinum duriusculum", "Leccinum albostipitatum",
    "Porphyrellus porphyrosporus", "Tylopilus felleus", "Gyroporus castaneus",
    "Chalciporus piperatus", "Buchwaldoboletus lignicola", "Pseudoboletus parasiticus",
    "Lactarius acerrimus", "Lactarius atlanticus", "Lactarius controversus", "Lactarius decipiens",
    "Lactarius fluens", "Lactarius hepaticus", "Lactarius ilicis", "Lactarius lacunarum",
    "Lactarius ligyotus", "Lactarius mairei", "Lactarius pterosporus", "Lactarius quietus",
    "Lactarius rubrocinctus", "Lactarius subdulcis", "Lactarius tabidus", "Lactarius uvidus",
    "Lactarius zonarius", "Lactifluus piperatus", "Lactifluus vellereus", "Lactifluus volemus",
    "Russula acrifolia", "Russula adusta", "Russula aeruginea", "Russula albonigra",
    "Russula atropurpurea", "Russula aurora", "Russula badia", "Russula brevipes",
    "Russula claroflava", "Russula decolorans", "Russula densifolia", "Russula fellea",
    "Russula fragilis", "Russula grisea", "Russula ionochlora", "Russula maculata",
    "Russula nobilis", "Russula ochroleuca", "Russula paludosa", "Russula parazurea",
    "Russula puellaris", "Russula queletii", "Russula risigallina", "Russula rosea",
    "Russula sanguinea", "Russula silvestris", "Russula turci", "Russula velenovskyi",
    "Russula vesca", "Russula vinosa", "Russula violeipes", "Russula viscida",
    "Tricholoma album", "Tricholoma argyraceum", "Tricholoma atrosquamosum", "Tricholoma auratum",
    "Tricholoma batschii", "Tricholoma cingulatum", "Tricholoma filamentosum", "Tricholoma fracticum",
    "Tricholoma imbricatum", "Tricholoma inamoenum", "Tricholoma lascivum", "Tricholoma orirubens",
    "Tricholoma pessundatum", "Tricholoma scalpturatum", "Tricholoma sciodes", "Tricholoma stans",
    "Tricholoma ustaloides", "Tricholoma virgatum", "Tricholoma monspessulanum",
    "Clitocybe fragrans", "Clitocybe metachroa", "Clitocybe phyllophila", "Clitocybe rivulosa",
    "Clitocybe candicans", "Clitocybe ditopa", "Clitocybe gibba", "Clitocybe odora",
    "Infundibulicybe geotropa", "Infundibulicybe gibba", "Lepista irina", "Lepista panaeolus",
    "Lepista sordida", "Lyophyllum fumosum", "Lyophyllum transforme", "Calocybe carnea",
    "Melanoleuca cognata", "Melanoleuca grammopodia", "Melanoleuca strictipes",
    "Hygrophorus eburneus", "Hygrophorus hypothejus", "Hygrophorus gliocyclus",
    "Hygrophorus poetarum", "Hygrophorus unicolor", "Hygrophorus discoxanthus",
    "Hygrocybe chlorophana", "Hygrocybe coccinea", "Hygrocybe conica", "Hygrocybe miniata",
    "Hygrocybe quieta", "Hygrocybe reidii", "Hygrocybe virginea", "Cuphophyllus virgineus",
    "Cantharellus ferruginascens", "Cantharellus pallens", "Cantharellus romagnesianus",
    "Craterellus cinereus", "Craterellus cornucopioides", "Craterellus lutescens",
    "Craterellus tubaeformis", "Pseudocraterellus undulatus", "Hydnum ellipsosporum",
    "Hydnum rufescens", "Sarcodon joeides", "Sarcodon leucopus", "Phellodon tomentosus",
    "Bankera violascens", "Hydnellum concrescens", "Hydnellum scrobiculatum",
    "Cortinarius alboviolaceus", "Cortinarius anomalus", "Cortinarius bollardii",
    "Cortinarius caerulescens", "Cortinarius calochrous", "Cortinarius camphoratus",
    "Cortinarius cinnamomeus", "Cortinarius claricolor", "Cortinarius collinitus",
    "Cortinarius dibaphus", "Cortinarius elegantior", "Cortinarius glaucopus",
    "Cortinarius infractus", "Cortinarius largus", "Cortinarius mucosus",
    "Cortinarius odorifer", "Cortinarius purpurascens", "Cortinarius saginus",
    "Cortinarius splendens", "Cortinarius torvus", "Cortinarius triumphans",
    "Cortinarius traganus", "Cortinarius varius", "Cortinarius violaceus",
    "Inocybe asterospora", "Inocybe bongardii", "Inocybe cookei", "Inocybe dulcamara",
    "Inocybe flocculosa", "Inocybe geophylla", "Inocybe lacera", "Inocybe maculata",
    "Inocybe napipes", "Inocybe pudica", "Inocybe rimosa", "Inocybe sindonia",
    "Hebeloma laterinum", "Hebeloma radicosum", "Hebeloma sacchariolens", "Hebeloma theobrominum",
    "Entoloma conferendum", "Entoloma hirtipes", "Entoloma incanum", "Entoloma lividum",
    "Entoloma sericeum", "Entoloma serrulatum", "Entoloma undatum", "Clitopilus hobsonii",
    "Pluteus atromarginatus", "Pluteus nanus", "Pluteus petasatus", "Pluteus romellii",
    "Pluteus salicinus", "Volvopluteus gloiocephalus", "Volvariella murinella",
    "Amanita battarrae", "Amanita crocea", "Amanita gemmata", "Amanita mairei",
    "Mycena acicula", "Mycena adonis", "Mycena arcangeliana", "Mycena crocata",
    "Mycena epipterygia", "Mycena galericulata", "Mycena haematopus", "Mycena inclinata",
    "Mycena leaiana", "Mycena pelianthina", "Mycena polygramma", "Mycena pura",
    "Mycena renati", "Mycena rosea", "Mycena seynesii", "Mycena vitilis",
    "Marasmius alliaceus", "Marasmius cohaerens", "Marasmius curreyi", "Marasmius epiphyllus",
    "Marasmius rotula", "Marasmius wynneae", "Gymnopus aquosus", "Gymnopus confluens",
    "Gymnopus dryophilus", "Gymnopus erythropus", "Gymnopus fusipes", "Gymnopus peronatus",
    "Rhodocollybia butyracea", "Rhodocollybia maculata", "Connopus acervatus",
    "Omphalotus olearius", "Lampteromyces japonicus", "Panellus stipticus", "Panellus serotinus",
    "Pleurotus citrinopileatus", "Pleurotus djamor", "Pleurotus pulmonarius", "Pleurotus dryinus",
    "Lentinellus cochleatus", "Lentinellus ursinus", "Neolentinus lepideus", "Lentinus tigrinus",
    "Armillaria cepistipes", "Armillaria gallica", "Armillaria ostoyae", "Armillaria tabescens",
    "Flammulina elastica", "Flammulina fennae", "Flammulina velutipes", "Hymenopellis radicata",
    "Xerula pudens", "Mucidula mucida", "Strobilurus esculentus", "Strobilurus stephanocystis",
    "Strobilurus tenacellus", "Baeospora myosura", "Clitocybula platyphylla",
    "Hypholoma capnoides", "Hypholoma lateritium", "Hypholoma marginatum", "Hypholoma radicosum",
    "Pholiota adiposa", "Pholiota alnicola", "Pholiota aurivella", "Pholiota highlandensis",
    "Pholiota jahnii", "Pholiota lenta", "Pholiota squarrosa", "Pholiota tuberculosa",
    "Kuehneromyces mutabilis", "Galerina marginata", "Galerina vittiformis", "Conocybe apala",
    "Conocybe filaris", "Conocybe tenera", "Bolbitius titubans", "Agrocybe dura",
    "Agrocybe pediades", "Agrocybe praecox", "Agrocybe vervacti", "Cyclocybe aegerita",
    "Stropharia aeruginosa", "Stropharia coronilla", "Stropharia cyanea", "Stropharia rugosoannulata",
    "Psilocybe semilanceata", "Deconica coprophila", "Panaeolus cinctulus", "Panaeolus foenisecii",
    "Panaeolus papilionaceus", "Panaeolus semiovatus", "Psathyrella candolleana",
    "Psathyrella corrugis", "Psathyrella multipedata", "Psathyrella piluliformis",
    "Lacrymaria lacrymabunda", "Coprinellus disseminatus", "Coprinellus domesticus",
    "Coprinellus micaceus", "Coprinopsis atramentaria", "Coprinopsis lagopus",
    "Coprinopsis nivea", "Coprinopsis picacea", "Coprinus comatus", "Parasola auricoma",
    "Parasola conopilus", "Parasola plicatilis", "Agaricus moelleri", "Agaricus urinascens",
    "Morchella deliciosa", "Morchella dunalii", "Morchella elata", "Morchella esculenta",
    "Morchella galilaea", "Morchella rufobrunnea", "Morchella tridentina", "Morchella vulgaris",
    "Verpa bohemica", "Verpa conica", "Gyromitra esculenta", "Gyromitra infula",
    "Helvella acetabulum", "Helvella atra", "Helvella compressa", "Helvella crispa",
    "Helvella elastica", "Helvella lacunosa", "Helvella leucomelaena", "Helvella queletii",
    "Peziza badia", "Peziza domiciliana", "Peziza repanda", "Peziza succosa", "Peziza vesiculosa",
    "Otidea alutacea", "Otidea bufonia", "Otidea onotica", "Aleuria aurantia",
    "Sarcoscypha austriaca", "Sarcoscypha coccinea", "Sarcosphaera coronaria",
    "Disciotis venosa", "Geopora arenicola", "Geopora sumneriana", "Humaria hemisphaerica",
    "Scutellinia scutellata", "Trichophaea woolhopeia", "Tarzetta catinus",
    "Tuber aestivum", "Tuber borchii", "Tuber brumale", "Tuber excavatum", "Tuber magnatum",
    "Tuber melanosporum", "Tuber mesentericum", "Tuber rufum", "Choiromyces meandriformis",
    "Terfezia arenaria", "Terfezia boudieri", "Terfezia claveryi", "Picoa juniperi",
    "Picoa lefebvrei", "Balsamia vulgaris", "Elaphomyces granulatus", "Elaphomyces muricatus",
    "Rhizopogon luteolus", "Rhizopogon roseolus", "Rhizopogon vulgaris", "Pisolithus arhizus",
    "Scleroderma areolatum", "Scleroderma bovista", "Scleroderma cepa", "Scleroderma citrinum",
    "Scleroderma meridionale", "Scleroderma polyrhizum", "Scleroderma verrucosum",
    "Astraeus hygrometricus", "Geastrum elegans", "Geastrum fimbriatum", "Geastrum fornicatum",
    "Geastrum lageniforme", "Geastrum minimum", "Geastrum pectinatum", "Geastrum rufescens",
    "Geastrum saccatum", "Geastrum schmidelii", "Geastrum triplex", "Myriostoma coliforme",
    "Lycoperdon echinatum", "Lycoperdon excipuliforme", "Lycoperdon molle", "Lycoperdon nigrescens",
    "Lycoperdon perlatum", "Lycoperdon pratense", "Lycoperdon pyriforme", "Lycoperdon umbrinum",
    "Bovista aestivalis", "Bovista nigrescens", "Bovista plumbea", "Calvatia candida",
    "Calvatia cyathiformis", "Calvatia excipuliformis", "Calvatia gigantea", "Handkea utriformis",
    "Vascellum pratense", "Phallus hadriani", "Phallus impudicus", "Mutinus caninus",
    "Mutinus elegans", "Clathrus ruber", "Clathrus archeri", "Ileodictyon cibarium",
    "Anthurus archeri", "Lysurus cruciatus", "Battarrea phalloides", "Battarrea stevenii",
    "Montagnea arenaria", "Tulostoma brumale", "Tulostoma fimbriatum", "Tulostoma niveum",
    "Cyathus olla", "Cyathus stercoreus", "Cyathus striatus", "Crucibulum laeve",
    "Nidula candida", "Sphaerobolus stellatus", "Fomes fomentarius", "Fomitopsis pinicola",
    "Fomitopsis betulina", "Ganoderma applanatum", "Ganoderma lucidum", "Ganoderma resinaceum",
    "Trametes gibbosa", "Trametes hirsuta", "Trametes ochracea", "Trametes pubescens",
    "Trametes versicolor", "Cerrena unicolor", "Daedalea quercina", "Daedaleopsis confragosa",
    "Lenzites betulinus", "Bjerkandera adusta", "Bjerkandera fumosa", "Abortiporus biennis",
    "Meripilus giganteus", "Grifola frondosa", "Polyporus umbellatus", "Polyporus tuberaster",
    "Cerioporus squamosus", "Laetiporus sulphureus", "Pycnoporus cinnabarinus",
    "Phellinus igniarius", "Phellinus pomaceus", "Fuscoporia torulosa", "Inonotus hispidus",
    "Inonotus obliquus", "Fistulina hepatica", "Schizophyllum commune", "Stereum hirsutum",
    "Stereum rugosum", "Stereum subtomentosum", "Chondrostereum purpureum", "Auricularia auricula-judae",
    "Auricularia mesenterica", "Exidia glandulosa", "Exidia nigricans", "Exidia recisa",
    "Tremella foliacea", "Tremella mesenterica", "Tremella aurantia", "Calocera cornea",
    "Calocera viscosa", "Dacrymyces stillatus", "Dacrymyces chrysospermus",
    "Sparassis crispa", "Sparassis brevipes", "Ramaria abietina", "Ramaria aurea",
    "Ramaria botrytis", "Ramaria flava", "Ramaria formosa", "Ramaria stricta",
    "Clavaria fragilis", "Clavaria zollingeri", "Clavulinopsis corniculata", "Clavulinopsis helvola",
    "Clavulinopsis laeticolor", "Clavulina cinerea", "Clavulina coralloides", "Clavulina rugosa",
    "Clavariadelphus pistillaris", "Clavariadelphus truncatus", "Hericium coralloides",
    "Hericium erinaceus", "Hericium cirrhatum", "Creolophus cirrhatus", "Auriscalpium vulgare",
    "Albatrellus ovinus", "Albatrellus cristatus", "Albatrellus confluens", "Hydnum repandum",
    "Cantharellus cibarius", "Cantharellus amethysteus", "Cantharellus friesii",
    "Gomphus clavatus", "Turbinellus floccosus", "Chroogomphus rutilus", "Gomphidius glutinosus",
    "Gomphidius roseus", "Suillus grevillei", "Suillus luteus", "Suillus granulatus",
    "Suillus bovinus", "Suillus collinitus", "Suillus bellinii", "Suillus mediterraneensis",
    "Imleria badia", "Xerocomellus chrysenteron", "Hortiboletus rubellus", "Cyanoboletus pulverulentus",
    "Butyriboletus regius", "Butyriboletus appendiculatus", "Caloboletus calopus",
    "Rubroboletus satanas", "Rubroboletus legaliae", "Rubroboletus rhodoxanthus",
    "Neoboletus erythropus", "Suillellus luridus", "Hemileccinum impolitum",
    "Leccinellum lepidum", "Leccinellum crocipodium", "Leccinum scabrum", "Leccinum versipelle",
    "Boletus edulis", "Boletus aereus", "Boletus pinophilus", "Boletus reticulatus",
    "Amanita caesarea", "Amanita muscaria", "Amanita pantherina", "Amanita phalloides",
    "Amanita rubescens", "Amanita vaginata", "Amanita fulva", "Amanita citrina",
    "Amanita ponderosa", "Amanita ovoidea", "Amanita proxima", "Macrolepiota procera",
    "Chlorophyllum rhacodes", "Agaricus campestris", "Agaricus xanthoderma", "Agaricus arvensis",
    "Lactarius deliciosus", "Lactarius sanguifluus", "Lactarius semisanguifluus",
    "Lactarius salmonicolor", "Lactarius torminosus", "Russula cyanoxantha", "Russula virescens",
    "Russula emetica", "Tricholoma portentosum", "Tricholoma terreum", "Tricholoma equestre",
    "Lepista nuda", "Clitocybe nebularis", "Hygrophorus marzuolus", "Hygrophorus latitabundus",
    "Marasmius oreades", "Coprinus comatus", "Pleurotus ostreatus", "Pleurotus eryngii",
    "Armillaria mellea", "Hypholoma fasciculare", "Paxillus involutus", "Gyromitra esculenta",
]


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def http_get_json(url: str, timeout: float = 30.0) -> dict | list | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
        print(f"  HTTP fail: {e} :: {url[:120]}")
        return None


def fetch_gbif_species_keys(countries: list[str], facet_limit: int) -> list[tuple[int, int]]:
    """Return list of (speciesKey, count) from occurrence facets."""
    counts: dict[int, int] = {}
    for country in countries:
        params = urllib.parse.urlencode(
            {
                "country": country,
                "kingdomKey": FUNGI_KINGDOM_KEY,
                "facet": "speciesKey",
                "facetLimit": str(facet_limit),
                "limit": "0",
            }
        )
        url = f"https://api.gbif.org/v1/occurrence/search?{params}"
        print(f"GBIF facets {country}…")
        data = http_get_json(url)
        time.sleep(0.4)
        if not data or not isinstance(data, dict):
            continue
        facets = data.get("facets") or []
        for fac in facets:
            if fac.get("field") != "SPECIES_KEY" and fac.get("field") != "speciesKey":
                # GBIF returns field name as SPECIES_KEY
                if str(fac.get("field", "")).upper() not in ("SPECIES_KEY", "SPECIESKEY"):
                    continue
            for c in fac.get("counts") or []:
                try:
                    key = int(c["name"])
                    n = int(c["count"])
                except (KeyError, TypeError, ValueError):
                    continue
                counts[key] = counts.get(key, 0) + n
    ranked = sorted(counts.items(), key=lambda x: -x[1])
    print(f"  unique speciesKeys={len(ranked)}")
    return ranked


def resolve_species_key(key: int) -> dict | None:
    data = http_get_json(f"https://api.gbif.org/v1/species/{key}")
    time.sleep(0.15)
    if not data or not isinstance(data, dict):
        return None
    rank = (data.get("rank") or "").upper()
    if rank not in ("SPECIES", "SUBSPECIES", "VARIETY"):
        # try accepted species
        if data.get("speciesKey") and data.get("speciesKey") != key:
            return resolve_species_key(int(data["speciesKey"]))
        if rank != "SPECIES":
            return None
    sci = data.get("scientificName") or data.get("canonicalName")
    if not sci:
        return None
    # strip authorship for catalog key: use canonicalName when present
    canonical = data.get("canonicalName") or sci.split(" ")[0:2]
    if isinstance(canonical, list):
        canonical = " ".join(canonical)
    # Prefer binomial only
    parts = str(canonical).split()
    if len(parts) >= 2:
        binomial = f"{parts[0]} {parts[1]}"
    else:
        binomial = str(canonical)
    if not re.match(r"^[A-Z][a-z]+ [a-z-]+$", binomial):
        return None
    return {
        "scientific_name": binomial,
        "family": data.get("family") or "",
        "genus": data.get("genus") or binomial.split()[0],
        "gbif_usage_key": data.get("key") or key,
        "occurrence_hint": 0,
    }


def fetch_vernaculars(usage_key: int) -> dict[str, list[str]]:
    data = http_get_json(f"https://api.gbif.org/v1/species/{usage_key}/vernacularNames?limit=100")
    time.sleep(0.1)
    out: dict[str, list[str]] = {"es": [], "ca": [], "eu": [], "en": []}
    if not data or not isinstance(data, dict):
        return out
    lang_map = {
        "spa": "es",
        "es": "es",
        "cat": "ca",
        "ca": "ca",
        "eus": "eu",
        "eu": "eu",
        "eng": "en",
        "en": "en",
    }
    for item in data.get("results") or []:
        lang = str(item.get("language") or "").lower()
        loc = lang_map.get(lang)
        name = (item.get("vernacularName") or "").strip()
        if loc and name and name not in out[loc]:
            out[loc].append(name)
    return out


def to_record(sci: str, family: str, genus: str, gbif_key: int | None, vern: dict[str, list[str]], source: str) -> dict:
    slug = slugify(sci)
    if not vern.get("es"):
        vern = {**vern, "es": [sci]}
    return {
        "scientific_name": sci,
        "slug": slug,
        "family": family or "",
        "genus": genus or sci.split()[0],
        "risk_level": "unknown",
        "edibility_code": "desconocido",
        "categories": ["otras", "gbif_iberia"],
        "iberian_relevance": "medium",
        "featured": False,
        "icon": "🍄",
        "gbif_usage_key": gbif_key,
        "vernacular_names": {
            "es": vern.get("es") or [sci],
            "ca": vern.get("ca") or [],
            "eu": vern.get("eu") or [],
            "en": vern.get("en") or [],
        },
        "tagline": {"es": f"{sci} (registro Iberia / Europa)"},
        "description": {
            "es": (
                f"{sci}. Entrada ampliada desde fuentes de biodiversidad (GBIF/capa Iberia). "
                f"Datos educativos; edibilidad desconocida por defecto. "
                f"Nunca consumir basándose solo en una app."
            )
        },
        "morphology": {"cap": {"es": ""}, "stem": {"es": ""}, "hymenium": {"es": ""}},
        "habitat": {"es": "Península Ibérica / Europa (según observaciones)"},
        "season": {"es": "Variable"},
        "key_features": {"es": []},
        "toxicity_notes": {},
        "lookalikes": [],
        "source": source,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=int, default=520, help="Desired total catalog size after merge")
    parser.add_argument("--countries", default="ES,PT")
    parser.add_argument("--facet-limit", type=int, default=400)
    parser.add_argument("--max-resolve", type=int, default=350, help="Max GBIF keys to resolve")
    parser.add_argument("--no-network", action="store_true")
    parser.add_argument("--vernaculars", action="store_true", help="Fetch GBIF vernaculars (slower)")
    args = parser.parse_args()

    existing: set[str] = set()
    if CATALOG.exists():
        cat = json.loads(CATALOG.read_text(encoding="utf-8"))
        existing = {s["scientific_name"] for s in cat.get("species", [])}
    current = len(existing)
    need = max(0, args.target - current)
    print(f"Current catalog={current}, target={args.target}, need_new≈{need}")

    records: list[dict] = []
    seen: set[str] = set(existing)

    if not args.no_network:
        countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
        ranked = fetch_gbif_species_keys(countries, args.facet_limit)
        for i, (key, cnt) in enumerate(ranked[: args.max_resolve]):
            info = resolve_species_key(key)
            if not info:
                continue
            sci = info["scientific_name"]
            if sci in seen:
                continue
            vern: dict[str, list[str]] = {"es": [sci], "ca": [], "eu": [], "en": []}
            if args.vernaculars and info.get("gbif_usage_key"):
                vern = fetch_vernaculars(int(info["gbif_usage_key"]))
                if not vern.get("es"):
                    vern["es"] = [sci]
            rec = to_record(
                sci,
                info.get("family") or "",
                info.get("genus") or "",
                info.get("gbif_usage_key"),
                vern,
                "gbif_iberia_facet",
            )
            records.append(rec)
            seen.add(sci)
            if len(records) >= need + 50:
                break
            if (i + 1) % 25 == 0:
                print(f"  resolved {i+1}, new={len(records)}")

    # Fallback names to guarantee size
    for name in FALLBACK_NAMES:
        if name in seen:
            continue
        rec = to_record(name, "", name.split()[0], None, {"es": [name], "ca": [], "eu": [], "en": []}, "iberia_fallback_list")
        records.append(rec)
        seen.add(name)
        if current + len(records) >= args.target:
            break

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "layer": "gbif_iberia_top",
        "version": "1.0.0",
        "count": len(records),
        "countries": args.countries,
        "species": records,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} with {len(records)} new-ish records (merged size ≈ {current + len(records)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

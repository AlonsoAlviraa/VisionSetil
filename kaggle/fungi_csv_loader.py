"""
Robust multi-source fungi metadata loader for VisionSetil Kaggle training.

Handles:
  - FungiTastic Darwin-Core CSVs (species + filename + observationID)
  - FungiCLEF / DF20 layouts (ImageUniqueID, class_id, scientificName, …)
  - Folder-structured datasets (latin species name as directory)
  - GBIF JSONL manifests (species + image_paths + observation_id + license_class)
  - Dead mounts (checkpoint-only / TFRecord-only without usable labels)

No edibility / consumption claims. Orientation-only training data prep.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Iterable, Optional

import pandas as pd

LogFn = Callable[[str], None]

# Known JSONL manifests (GBIF industrial pack + generic)
KNOWN_JSONL_REL_PATHS = (
    "obs_gbif_es.jsonl",
    "obs_gbif.jsonl",
    "manifest.jsonl",
    "observations.jsonl",
    "metadata/obs_gbif_es.jsonl",
)

# ── Column alias tables (case-insensitive match) ──────────────────────────────
# Prefer binomial labels over Darwin-Core taxonomic ranks.
SPECIES_ALIASES = (
    "species",
    "scientificname",
    "scientific_name",
    "taxon_name",
    "taxon",
    "expected_taxon",
    "class_name",
    "label",
    "category",
    "speciesname",
    "species_name",
)
# Never treat these Darwin-Core ranks as the species label when a better col exists.
TAXONOMIC_RANK_COLS = frozenset(
    {"kingdom", "phylum", "class", "order", "family", "genus", "specificepithet"}
)
# class_id is an integer label id (FungiCLEF/DF20), not taxonomic class.
IMAGE_ALIASES = (
    "image_path",
    "imagepath",
    "filename",
    "file_name",
    "filepath",
    "file_path",
    "image",
    "img_path",
    "img",
    "image_path_jpg",
    "filename_jpg",
    "imageuniqueid",
    "image_unique_id",
    "imageid",
    "image_id",
    "photo_id",
    "photoid",
)
OBS_ALIASES = (
    "observation_id",
    "observationid",
    "observation_uuid",
    "observationuuid",
    "obs_id",
    "obsid",
    "eventid",
    "event_id",
)

SKIP_CSV_KEYWORDS = frozenset(
    {
        "climatic",
        "timeseries",
        "climate",
        "weather",
        "bioclim",
        "submission",
        "sample_submission",
    }
)

# Known relative metadata paths (FungiTastic + DF20/FungiCLEF competition dumps)
KNOWN_CSV_REL_PATHS = (
    # FungiTastic — load ALL splits when present
    "metadata/FungiTastic/FungiTastic-ClosedSet-Train.csv",
    "metadata/FungiTastic/FungiTastic-ClosedSet-Val.csv",
    "metadata/FungiTastic/FungiTastic-ClosedSet-Test.csv",
    "metadata/FungiTastic/FungiTastic-OpenSet-Train.csv",
    "metadata/FungiTastic/FungiTastic-OpenSet-Val.csv",
    "metadata/FungiTastic/FungiTastic-OpenSet-Test.csv",
    "metadata/FungiTastic/FungiTastic-FewShot(train).csv",
    "metadata/FungiTastic/FungiTastic-FewShot-Train.csv",
    "metadata/FungiTastic/FungiTastic-FewShot/Train.csv",
    "FungiTastic-FewShot/train.csv",
    "FungiTastic-FewShot/Train.csv",
    # FungiCLEF / DF20 competition-style
    "DF20-train_metadata.csv",
    "DF20-val_metadata.csv",
    "DF20-train_metadata_PROD.csv",
    "FungiCLEF2022_train_metadata.csv",
    "FungiCLEF2022_test_metadata.csv",
    "FungiCLEF2023_train.csv",
    "metadata/FungiCLEF2023_train.csv",
    "metadata/DF20-train_metadata.csv",
    "train.csv",
    "Train/train.csv",
    "data/train.csv",
)

KNOWN_IMAGE_SUBDIRS = (
    "",
    "images",
    "Images",
    "merged_dataset",
    "train",
    "Train",
    "val",
    "Val",
    "test",
    "Test",
    "DF20-300px/DF20_300",
    "DF20_300",
    "DF20-300px",
    "images/FungiTastic-FewShot/train/300p",
    "images/FungiTastic-FewShot/train/500p",
    "images/FungiTastic-FewShot/val/300p",
    "images/FungiTastic-FewShot/val/500p",
    "images/FungiTastic-FewShot/test/300p",
    "images/FungiTastic-FewShot/test/500p",
    "images/FungiTastic-ClosedSet/train/300p",
    "images/FungiTastic-ClosedSet/train/500p",
    "images/FungiTastic-ClosedSet/val/300p",
    "images/FungiTastic-ClosedSet/val/500p",
    "images/FungiTastic-ClosedSet/test/300p",
    "images/FungiTastic-ClosedSet/test/500p",
    "images/FungiTastic-OpenSet/train/300p",
    "images/FungiTastic-OpenSet/train/500p",
    "images/FungiTastic-OpenSet/val/300p",
    "images/FungiTastic-OpenSet/val/500p",
    "FungiTastic-FewShot/Train",
    "FungiTastic-FewShot/Val",
    "Processed_300px/JPG",
    "Train/Processed_300px/JPG",
)

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".JPG", ".JPEG", ".PNG"}


def _log(msg: str, log: Optional[LogFn] = None) -> None:
    if log:
        log(msg)
    else:
        print(msg)


def _norm_col(name: str) -> str:
    return str(name).strip().lower().replace(" ", "_")


def pick_column(columns: Iterable[str], aliases: Iterable[str]) -> Optional[str]:
    """Return original column name matching first alias (case-insensitive)."""
    cols = list(columns)
    lower_map = {_norm_col(c): c for c in cols}
    for alias in aliases:
        key = _norm_col(alias)
        if key in lower_map:
            return lower_map[key]
    return None


def is_valid_image_csv(csv_path: Path, nrows: int = 5) -> bool:
    """Reject climatic / submission CSVs and ultra-wide non-image tables."""
    name_lower = csv_path.name.lower()
    for kw in SKIP_CSV_KEYWORDS:
        if kw in name_lower:
            return False
    try:
        probe = pd.read_csv(csv_path, nrows=nrows)
    except Exception:
        return False
    if len(probe.columns) > 80:
        return False
    cols_l = {_norm_col(c) for c in probe.columns}
    # Must look like image metadata: species-ish OR image-ish column present
    has_species = bool(cols_l & set(SPECIES_ALIASES)) or "species" in cols_l
    has_image = bool(cols_l & set(IMAGE_ALIASES)) or "filename" in cols_l
    # DF20 often has ImageUniqueID + scientificName without "species"
    if "imageuniqueid" in cols_l and ("scientificname" in cols_l or "class_id" in cols_l):
        return True
    if has_species and has_image:
        return True
    # Accept species + observation without explicit image if filename-like col exists later
    if has_species and ("observationid" in cols_l or "observation_id" in cols_l):
        return True
    return False


def find_metadata_csvs(root: Path, log: Optional[LogFn] = None) -> list[Path]:
    """Find all usable metadata CSVs under root (direct paths first, then shallow glob)."""
    root = Path(root)
    found: list[Path] = []
    seen: set[str] = set()

    def _add(p: Path) -> None:
        key = str(p.resolve()) if p.exists() else str(p)
        if key in seen:
            return
        if p.exists() and p.is_file() and is_valid_image_csv(p):
            seen.add(key)
            found.append(p)

    for rel in KNOWN_CSV_REL_PATHS:
        _add(root / rel)

    # Shallow globs (avoid deep rglob on multi-million image trees)
    for pattern in (
        "*.csv",
        "metadata/*.csv",
        "metadata/*/*.csv",
        "metadata/FungiTastic/*.csv",
        "Train/*.csv",
        "data/*.csv",
    ):
        try:
            for m in list(root.glob(pattern))[:30]:
                _add(m)
        except Exception:
            continue

    _log(f"  n_csv found: {len(found)}", log)
    for p in found:
        _log(f"    - {p.relative_to(root) if p.is_relative_to(root) else p}", log)
    return found


def _looks_binomial(value: str) -> bool:
    """True if value looks like 'Genus epithet' (space-separated, not a single rank word)."""
    if not value or not isinstance(value, str):
        return False
    s = value.strip()
    parts = s.split()
    if len(parts) < 2:
        return False
    # Reject pure taxonomic ranks used as sole tokens
    if parts[0].lower() in TAXONOMIC_RANK_COLS:
        return False
    return parts[0][:1].isupper() and parts[1][:1].islower()


def normalize_species_name(value) -> str:
    """Binomial-ish cleanup: underscore/hyphen folders, strip authorities."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return "unknown"
    s = str(value).strip()
    if not s or s.lower() in {"nan", "none", "null"}:
        return "unknown"
    # Folder-style: Amanita_phalloides / Amanita-phalloides → spaces
    s = s.replace("_", " ").replace("-", " ")
    # Collapse whitespace
    s = " ".join(s.split())
    # "Strobilurus esculentus (Wulfen) Singer" → genus + epithet
    if "(" in s:
        head = s.split("(")[0].strip()
        parts = head.split()
        if len(parts) >= 2:
            return f"{parts[0]} {parts[1]}"
        if head:
            return head
    parts = s.split()
    if len(parts) >= 2 and parts[0][0].isupper():
        return f"{parts[0]} {parts[1]}"
    return s


def normalize_columns(df: pd.DataFrame, log: Optional[LogFn] = None) -> pd.DataFrame:
    """
    Map alias columns to image_path / species / observation_id.

    Critical: do NOT map Darwin-Core taxonomic `class` to species when
    species or scientificName is present (E17-style bug). TAXONOMIC_RANK_COLS
    are never chosen as the species column unless values look binomial.
    """
    df = df.copy()
    cols = list(df.columns)

    # Species: prefer explicit binomial aliases; never bare taxonomic ranks
    sp_col = pick_column(cols, SPECIES_ALIASES)
    if sp_col is not None and _norm_col(sp_col) in TAXONOMIC_RANK_COLS:
        # Guard if someone adds 'class' to SPECIES_ALIASES later
        sample = df[sp_col].dropna().astype(str).head(20).tolist()
        if not any(_looks_binomial(normalize_species_name(v)) for v in sample):
            _log(f"  skip rank-like species col '{sp_col}' (not binomial)", log)
            sp_col = None
            # retry without rank names: already excluded from SPECIES_ALIASES
            sp_col = pick_column(
                [c for c in cols if _norm_col(c) not in TAXONOMIC_RANK_COLS],
                SPECIES_ALIASES,
            )

    if sp_col is None:
        # last resort: class_id only as integer labels (keep as string id)
        sp_col = pick_column(cols, ("class_id", "category_id"))
        if sp_col is not None:
            _log(f"  WARNING: using {sp_col} as species (numeric id — may need mapping)", log)

    # Explicitly never rename bare taxonomic ranks to species
    if sp_col is not None and _norm_col(sp_col) in TAXONOMIC_RANK_COLS - {"class_id"}:
        sample = df[sp_col].dropna().astype(str).head(20).tolist()
        if not any(_looks_binomial(str(v)) for v in sample):
            _log(f"  refusing taxonomic rank col '{sp_col}' as species label", log)
            sp_col = None

    img_col = pick_column(cols, IMAGE_ALIASES)
    obs_col = pick_column(cols, OBS_ALIASES)

    rename: dict[str, str] = {}
    if sp_col and sp_col != "species" and "species" not in df.columns:
        rename[sp_col] = "species"
    if img_col and img_col != "image_path" and "image_path" not in df.columns:
        rename[img_col] = "image_path"
    if obs_col and obs_col != "observation_id" and "observation_id" not in df.columns:
        rename[obs_col] = "observation_id"

    if rename:
        _log(f"  column map: {rename}", log)
        df = df.rename(columns=rename)

    # If both scientificName and species existed, keep species; optionally fill gaps
    sci = pick_column(df.columns, ("scientificname", "scientific_name"))
    if "species" not in df.columns and sci:
        df["species"] = df[sci].map(normalize_species_name)
    elif "species" in df.columns:
        df["species"] = df["species"].map(normalize_species_name)
        if sci and sci != "species":
            mask = df["species"].isin(["unknown", ""])
            if mask.any():
                df.loc[mask, "species"] = df.loc[mask, sci].map(normalize_species_name)

    if "observation_id" not in df.columns:
        if "image_path" in df.columns:
            df["observation_id"] = df["image_path"].astype(str).map(
                lambda p: Path(p).stem.split("_")[0].split("-")[-1] if p else "unk"
            )
        else:
            df["observation_id"] = range(len(df))

    if "species" not in df.columns:
        if "image_path" in df.columns:
            df["species"] = df["image_path"].astype(str).map(
                lambda p: normalize_species_name(Path(p).parent.name)
            )
            # If parent dir is not binomial (e.g. 500p), leave unknown
            bad = ~df["species"].map(_looks_binomial)
            if bad.any():
                df.loc[bad, "species"] = "unknown"
        else:
            df["species"] = "unknown"

    if "genus" not in df.columns:
        df["genus"] = df["species"].astype(str).str.split().str[0]

    for col in ("family", "habitat", "substrate", "smell", "country"):
        if col not in df.columns:
            alt = pick_column(df.columns, (col, col.capitalize(), col.upper()))
            if alt and alt != col:
                df[col] = df[alt]
            else:
                df[col] = "unknown"

    return df


def build_filename_index(
    root: Path,
    max_files: int = 150_000,
    log: Optional[LogFn] = None,
) -> dict[str, str]:
    """Map lowercase filename → absolute path using known image subdirs (no deep rglob of whole tree)."""
    root = Path(root)
    index: dict[str, str] = {}
    n = 0
    for sub in KNOWN_IMAGE_SUBDIRS:
        d = root / sub if sub else root
        if not d.exists() or not d.is_dir():
            continue
        try:
            # Prefer non-recursive for flat dirs; one-level + recursive only for images/
            if sub in ("",) or sub.count("/") == 0:
                iterator = d.rglob("*") if sub.lower() in {"images", "merged_dataset", "train", "val", "test"} else d.iterdir()
            else:
                iterator = d.iterdir()
            for p in iterator:
                if not p.is_file():
                    continue
                if p.suffix not in IMAGE_EXTS and p.suffix.lower() not in {e.lower() for e in IMAGE_EXTS}:
                    continue
                key = p.name.lower()
                if key not in index:
                    index[key] = str(p.resolve())
                    n += 1
                    if n >= max_files:
                        _log(f"  filename index capped at {max_files}", log)
                        return index
        except Exception as e:
            _log(f"  index skip {d}: {e}", log)
            continue
    # Extra: shallow walk images/**/**/*
    images_root = root / "images"
    if images_root.exists():
        try:
            for p in images_root.rglob("*"):
                if not p.is_file():
                    continue
                if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
                    continue
                key = p.name.lower()
                if key not in index:
                    index[key] = str(p.resolve())
                    n += 1
                    if n >= max_files:
                        break
        except Exception as e:
            _log(f"  images rglob limited: {e}", log)
    _log(f"  filename index size: {len(index)}", log)
    return index


def resolve_one_image_path(raw, root: Path, index: Optional[dict[str, str]] = None) -> str:
    """Resolve a relative path or bare filename against dataset root + index."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    # Use chr(92) so notebook embedding / ast.unparse never breaks on backslash escapes
    s = str(raw).strip().replace(chr(92), "/")
    if not s:
        return ""
    p = Path(s)
    if p.is_absolute() and p.exists():
        return str(p)
    # Direct relative
    cand = root / s
    if cand.exists():
        return str(cand.resolve())
    # Bare filename via index
    name = p.name
    if index:
        hit = index.get(name.lower())
        if hit:
            return hit
    # Try known subdirs + filename
    for sub in KNOWN_IMAGE_SUBDIRS:
        c = (root / sub / name) if sub else (root / name)
        if c.exists():
            return str(c.resolve())
    # Construct FungiTastic-style paths from observation-ish names
    for split in ("train", "val", "test"):
        for res in ("300p", "500p", "full", "700p"):
            for pack in (
                "FungiTastic-FewShot",
                "FungiTastic-ClosedSet",
                "FungiTastic-OpenSet",
            ):
                c = root / "images" / pack / split / res / name
                if c.exists():
                    return str(c.resolve())
    # DF20
    for sub in ("DF20-300px/DF20_300", "DF20_300", "DF20-300px"):
        c = root / sub / name
        if c.exists():
            return str(c.resolve())
    # Unresolved: keep root-joined path for downstream try
    return str(root / s)


def resolve_image_paths(
    df: pd.DataFrame,
    root: Path,
    index: Optional[dict[str, str]] = None,
    log: Optional[LogFn] = None,
    drop_missing: bool = False,
) -> pd.DataFrame:
    if "image_path" not in df.columns:
        return df
    root = Path(root)
    if index is None:
        index = build_filename_index(root, log=log)
    df = df.copy()
    df["image_path"] = df["image_path"].map(lambda r: resolve_one_image_path(r, root, index))
    if drop_missing:
        before = len(df)
        df = df[df["image_path"].map(lambda p: Path(str(p)).exists())].reset_index(drop=True)
        _log(f"  drop_missing images: {before} → {len(df)}", log)
    return df


def _looks_species_dirname(name: str) -> bool:
    """True for 'Amanita muscaria' or 'Amanita_muscaria' / 'Amanita-muscaria' dirs."""
    s = name.strip()
    if not s or s.lower() in {
        "metadata", "images", "train", "val", "test", "merged_dataset",
        "data", "captions", "climaticdata", "__pycache__",
    }:
        return False
    if " " in s:
        return _looks_binomial(normalize_species_name(s))
    if "_" in s or "-" in s:
        return _looks_binomial(normalize_species_name(s))
    return False


def find_jsonl_manifests(root: Path, log: Optional[LogFn] = None) -> list[Path]:
    """Locate observation JSONL manifests under a dataset root."""
    root = Path(root)
    found: list[Path] = []
    seen: set[str] = set()

    def _add(p: Path) -> None:
        key = str(p.resolve()) if p.exists() else str(p)
        if key in seen or not p.is_file():
            return
        # Quick probe: must look like observation rows
        try:
            with p.open(encoding="utf-8") as f:
                for _ in range(5):
                    line = f.readline()
                    if not line.strip():
                        continue
                    obj = json.loads(line)
                    if not isinstance(obj, dict):
                        return
                    keys = {str(k).lower() for k in obj.keys()}
                    has_sp = bool(keys & {"species", "scientificname", "scientific_name"})
                    has_img = bool(
                        keys
                        & {
                            "image_paths",
                            "image_path",
                            "filename",
                            "filepath",
                            "file_path",
                        }
                    )
                    if has_sp and has_img:
                        seen.add(key)
                        found.append(p)
                    return
        except Exception:
            return

    for rel in KNOWN_JSONL_REL_PATHS:
        _add(root / rel)
    for pattern in ("*.jsonl", "metadata/*.jsonl"):
        try:
            for m in list(root.glob(pattern))[:20]:
                _add(m)
        except Exception:
            continue
    _log(f"  n_jsonl found: {len(found)}", log)
    for p in found:
        try:
            _log(f"    - {p.relative_to(root)}", log)
        except Exception:
            _log(f"    - {p}", log)
    return found


def dataset_kind(root: Path) -> str:
    """
    Classify mount content:
      jsonl_manifest | csv_images | folder_species | tfrecord_only | checkpoint_only | empty | unknown
    """
    root = Path(root)
    if not root.exists():
        return "empty"
    has_csv = False
    has_jsonl = False
    has_tfrec = False
    has_pth = False
    has_img = False
    has_species_dirs = False
    try:
        top = list(root.iterdir())
    except Exception:
        return "unknown"
    for p in top[:200]:
        name = p.name.lower()
        if p.is_file():
            if name.endswith(".csv"):
                has_csv = True
            elif name.endswith(".jsonl"):
                has_jsonl = True
            elif name.endswith(".tfrec") or name.endswith(".tfrecord"):
                has_tfrec = True
            elif name.endswith(".pth") or name.endswith(".pt") or name.endswith(".ckpt"):
                has_pth = True
            elif Path(name).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                has_img = True
        elif p.is_dir():
            if name in {"metadata", "images", "train", "merged_dataset", "df20-300px"}:
                has_csv = has_csv or name == "metadata"
                has_img = has_img or name in {"images", "train", "merged_dataset", "df20-300px"}
            if _looks_species_dirname(p.name):
                try:
                    if any(p.iterdir()):
                        has_species_dirs = True
                except Exception:
                    pass
    # Nested metadata / images
    if (root / "metadata").exists():
        has_csv = True
    if (root / "images").exists() or (root / "merged_dataset").exists():
        has_img = True
        # Underscore species folders live under images/
        img_root = root / "images"
        if img_root.is_dir() and not has_species_dirs:
            try:
                for sp in list(img_root.iterdir())[:40]:
                    if sp.is_dir() and _looks_species_dirname(sp.name):
                        has_species_dirs = True
                        break
            except Exception:
                pass
    if not has_jsonl:
        for rel in KNOWN_JSONL_REL_PATHS:
            if (root / rel).is_file():
                has_jsonl = True
                break
    if has_jsonl:
        return "jsonl_manifest"
    if has_csv or (has_img and has_species_dirs):
        if has_csv:
            return "csv_images"
        return "folder_species"
    if has_species_dirs:
        return "folder_species"
    if has_tfrec and not has_csv and not has_img:
        return "tfrecord_only"
    if has_pth and not has_csv and not has_img:
        return "checkpoint_only"
    return "unknown"


def _folder_observation_id(species_norm: str, stem: str) -> str:
    """
    Group multi-view folder images into one observation when stems only differ
    by a trailing view index (_1, -2, etc.). Caps are per observation_id.
    """
    import re

    base = re.sub(r"[_\-]\d+$", "", stem).strip()
    if not base:
        base = stem
    # Drop redundant species prefix in stem: "Amanita muscaria_1" after space norm
    sp_flat = species_norm.replace(" ", "_").lower()
    base_l = base.lower().replace(" ", "_")
    if base_l.startswith(sp_flat):
        rest = base_l[len(sp_flat) :].lstrip("_-")
        if rest:
            base = rest
        else:
            base = "view"
    return f"{species_norm}::{base}"


def _resolve_manifest_path(raw: str, root: Path) -> str:
    """Resolve a JSONL image path against dataset root; empty string if missing."""
    # chr(92) = backslash; avoid '\\' so notebook embedding / ast.unparse stays valid
    s = str(raw).strip().replace(chr(92), "/")
    if not s:
        return ""
    cand = Path(s)
    if cand.is_absolute() and cand.exists():
        return str(cand)
    for prefix in (
        "data/industrial_v1/gbif/",
        "industrial_v1/gbif/",
        "data/industrial_v1/",
    ):
        if s.startswith(prefix):
            s = s[len(prefix) :]
            break
    candidates = [root / s]
    parts = Path(s).parts
    if parts and parts[0] != "images" and len(parts) >= 2:
        candidates.append(root / "images" / Path(*parts[-2:]))
    if len(parts) >= 1:
        candidates.append(root / "images" / parts[-1])
        candidates.append(root / parts[-1])
    # Species-safe folder: Genus_species/file.jpg already under images/
    if len(parts) >= 2 and parts[0] == "images":
        candidates.append(root / Path(*parts))
    for c in candidates:
        try:
            if c.exists() and c.is_file():
                return str(c.resolve())
        except Exception:
            continue
    return ""


def load_from_jsonl_manifest(
    root: Path,
    db_name: str,
    log: Optional[LogFn] = None,
    max_images: int = 120_000,
    prefer_cc_ok: bool = True,
) -> pd.DataFrame:
    """
    Load GBIF-style JSONL: one row per image or multi-path observation.

    Expected fields (flexible):
      observation_id, species, image_paths[] | image_path, license_class
    Paths may be relative to dataset root (images/Species/file.jpg).
    """
    root = Path(root)
    manifests = find_jsonl_manifests(root, log=log)
    if not manifests:
        return pd.DataFrame()

    records: list[dict] = []
    for man in manifests:
        try:
            with man.open(encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(row, dict):
                        continue
                    sp_raw = (
                        row.get("species")
                        or row.get("scientificName")
                        or row.get("scientific_name")
                        or "unknown"
                    )
                    sp = normalize_species_name(sp_raw)
                    oid = row.get("observation_id") or row.get("observationID") or row.get("obs_id")
                    lic = row.get("license_class") or row.get("licenseClass") or "unknown"
                    paths = row.get("image_paths") or row.get("image_path") or row.get("filename")
                    if paths is None:
                        continue
                    if isinstance(paths, str):
                        paths = [paths]
                    if not isinstance(paths, (list, tuple)):
                        continue
                    for raw_p in paths:
                        if raw_p is None:
                            continue
                        # chr(92) = backslash; avoid '\\' so notebook embedding stays valid
                        s = str(raw_p).strip().replace(chr(92), "/")
                        if not s:
                            continue
                        resolved = _resolve_manifest_path(s, root)
                        if not resolved:
                            continue
                        if oid is None:
                            stem = Path(resolved).stem
                            oid_use = f"{sp}::{stem.split('_')[0]}"
                        else:
                            oid_use = str(oid)
                        records.append(
                            {
                                "image_path": resolved,
                                "species": sp,
                                "observation_id": oid_use,
                                "genus": sp.split()[0] if sp else "unknown",
                                "family": "unknown",
                                "habitat": "unknown",
                                "substrate": "unknown",
                                "smell": "unknown",
                                "country": row.get("country") or "ES",
                                "license_class": str(lic).lower() if lic else "unknown",
                                "license": row.get("license") or "",
                            }
                        )
                        if len(records) >= max_images:
                            break
                    if len(records) >= max_images:
                        break
        except Exception as e:
            _log(f"  ERROR reading jsonl {man}: {e}", log)
        if len(records) >= max_images:
            break

    df = pd.DataFrame.from_records(records)
    if len(df) == 0:
        _log(f"  jsonl manifest: 0 existing images from {root}", log)
        return df

    # Prefer cc_ok rows first when capping later (sort stable for fair_cap)
    if prefer_cc_ok and "license_class" in df.columns:
        rank = df["license_class"].map(lambda x: 0 if str(x).lower() == "cc_ok" else 1)
        df = df.assign(_lic_rank=rank).sort_values("_lic_rank").drop(columns=["_lic_rank"])

    # Anti-collision prefix only if observation_id not already namespaced
    def _prefix_oid(v: str) -> str:
        s = str(v)
        if s.startswith(f"{db_name}_") or s.startswith("gbif_"):
            return s if s.startswith(f"{db_name}_") or db_name.startswith("gbif") else f"{db_name}_{s}"
        return f"{db_name}_{s}"

    # Keep gbif_* ids intact for anti-leak; only prefix foreign ids
    if db_name.startswith("gbif") or db_name in {"gbif_es", "gbif"}:
        df["observation_id"] = df["observation_id"].astype(str).map(
            lambda s: s if str(s).startswith("gbif_") else f"gbif_{s}"
        )
    else:
        df["observation_id"] = df["observation_id"].astype(str).map(_prefix_oid)
    df["source_db"] = db_name
    n_cc = int((df["license_class"].astype(str).str.lower() == "cc_ok").sum()) if "license_class" in df.columns else 0
    _log(
        f"  jsonl: {len(df)} images, {df['species'].nunique()} spp, "
        f"{df['observation_id'].nunique()} obs, cc_ok={n_cc}",
        log,
    )
    return df.reset_index(drop=True)


def load_from_folder_structure(
    root: Path,
    db_name: str,
    log: Optional[LogFn] = None,
    max_images: int = 80_000,
) -> pd.DataFrame:
    """
    Load datasets laid out as root/<Species Latin>/img.jpg or root/images/<Species>/img.webp.
    Observation ids strip trailing view indices so caps apply per capture group.
    """
    root = Path(root)
    records = []
    search_roots = [root]
    for sub in ("images", "merged_dataset", "train", "Train", "data"):
        if (root / sub).exists():
            search_roots.append(root / sub)

    for base in search_roots:
        try:
            entries = sorted([p for p in base.iterdir() if p.is_dir()])
        except Exception:
            continue
        for sp_dir in entries:
            sp_name = sp_dir.name.strip()
            if sp_name.lower() in {
                "metadata",
                "climaticdata",
                "captions",
                "train",
                "val",
                "test",
                "images",
                "__pycache__",
            }:
                continue
            sp_norm = normalize_species_name(sp_name)
            if sp_norm == "unknown" or not _looks_binomial(sp_norm):
                # Still accept single-token genus folders only if capitalized (rare)
                if " " not in sp_norm:
                    continue
            try:
                files = list(sp_dir.iterdir())
            except Exception:
                continue
            for img in files:
                if not img.is_file():
                    continue
                if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
                    continue
                stem = img.stem
                obs = _folder_observation_id(sp_norm, stem)
                records.append(
                    {
                        "image_path": str(img.resolve()),
                        "species": sp_norm,
                        "observation_id": obs,
                        "genus": sp_norm.split()[0] if sp_norm else "unknown",
                        "family": "unknown",
                        "habitat": "unknown",
                        "substrate": "unknown",
                        "smell": "unknown",
                        "country": "unknown",
                    }
                )
                if len(records) >= max_images:
                    break
            if len(records) >= max_images:
                break
        if len(records) >= max_images:
            break

    df = pd.DataFrame.from_records(records)
    if len(df):
        df["source_db"] = db_name
        df["observation_id"] = db_name + "_" + df["observation_id"].astype(str)
    _log(
        f"  folder structure: {len(df)} images, "
        f"{df['species'].nunique() if len(df) else 0} spp, "
        f"{df['observation_id'].nunique() if len(df) else 0} obs",
        log,
    )
    return df


def load_csvs_from_root(
    root: Path,
    db_name: str,
    log: Optional[LogFn] = None,
    build_index: bool = True,
) -> pd.DataFrame:
    """Load + normalize + path-resolve all valid CSVs under root."""
    root = Path(root)
    csvs = find_metadata_csvs(root, log=log)
    if not csvs:
        _log(f"  WARNING: No valid image CSV found in {root}", log)
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            part = pd.read_csv(csv_path, low_memory=False)
            _log(f"  read {csv_path.name}: shape={part.shape}", log)
            part = normalize_columns(part, log=log)
            part["_meta_csv"] = csv_path.name
            frames.append(part)
        except Exception as e:
            _log(f"  ERROR reading {csv_path}: {e}", log)

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    n_rows = len(df)
    _log(f"  n_rows after parse (pre-path): {n_rows}", log)

    index = build_filename_index(root, log=log) if build_index else {}
    df = resolve_image_paths(df, root, index=index, log=log, drop_missing=False)

    # Anti-collision prefix
    df["observation_id"] = db_name + "_" + df["observation_id"].astype(str)
    df["source_db"] = db_name

    # Keep only rows with existing image files (avoid silent noise tensors downstream)
    if "image_path" in df.columns:
        exists_mask = df["image_path"].map(lambda p: Path(str(p)).exists())
        n_ok = int(exists_mask.sum())
        n_all = len(df)
        _log(f"  paths existing on disk: {n_ok}/{n_all}", log)
        ratio = n_ok / max(n_all, 1)
        if n_ok == 0:
            _log(
                f"  WARNING: 0 existing images for '{db_name}' — source counts as empty for gate",
                log,
            )
            return pd.DataFrame()
        if ratio < 0.05:
            _log(
                f"  WARNING: <5% images resolved ({ratio:.2%}) for '{db_name}' — "
                "keeping existing only; check layout vs filename",
                log,
            )
        df = df.loc[exists_mask].reset_index(drop=True)

    _log(
        f"  Loaded CSV source '{db_name}': {len(df)} existing images, "
        f"{df['species'].nunique()} spp, {df['observation_id'].nunique()} obs",
        log,
    )
    return df


def load_single_dataset(
    root: Path,
    db_name: str,
    log: Optional[LogFn] = None,
) -> pd.DataFrame:
    """
    Full load for one mounted dataset root.

    Returns normalized DataFrame with columns:
      image_path, species, observation_id, source_db, genus, family, habitat, …
      (optional license_class for GBIF research packs)
    """
    root = Path(root)
    _log(f"Loading dataset '{db_name}' from {root}...", log)
    kind = dataset_kind(root)
    _log(f"  dataset_kind={kind}", log)

    if kind == "checkpoint_only":
        _log(
            f"  FATAL-soft: '{db_name}' looks like model checkpoints only (.pth) — not image data",
            log,
        )
        return pd.DataFrame()

    if kind == "tfrecord_only":
        _log(
            f"  FATAL-soft: '{db_name}' is TFRecord-only without CSV labels — "
            "cannot map to allowlist species safely",
            log,
        )
        return pd.DataFrame()

    df = pd.DataFrame()
    # GBIF / industrial JSONL first (preserves observation_id + license_class)
    if kind == "jsonl_manifest" or find_jsonl_manifests(root):
        _log("  Trying JSONL manifest loader...", log)
        df = load_from_jsonl_manifest(root, db_name, log=log)
    if (df is None or len(df) == 0) and kind in {"csv_images", "unknown", "empty", "jsonl_manifest"}:
        df = load_csvs_from_root(root, db_name, log=log)
    if (df is None or len(df) == 0) and kind in {
        "folder_species",
        "csv_images",
        "unknown",
        "jsonl_manifest",
    }:
        _log("  Trying folder-structure loader...", log)
        df = load_from_folder_structure(root, db_name, log=log)

    if df is None or len(df) == 0:
        _log(f"  Loaded: 0 images from '{db_name}'", log)
        return pd.DataFrame()

    if "license_class" not in df.columns:
        df["license_class"] = "unknown"

    _log(
        f"  Loaded: {len(df)} images, {df['species'].nunique()} species, "
        f"{df['observation_id'].nunique()} observations",
        log,
    )
    return df


def count_existing_images(df: Optional[pd.DataFrame]) -> int:
    """Count rows whose image_path exists on disk (usable samples)."""
    if df is None or len(df) == 0 or "image_path" not in df.columns:
        return 0
    return int(df["image_path"].map(lambda p: Path(str(p)).exists()).sum())


def fair_cap_observations(
    df: pd.DataFrame,
    max_obs: int = 200,
    max_obs_deadly: int = 400,
    deadly_force: Optional[set] = None,
    species_col: str = "species",
    obs_col: str = "observation_id",
    source_col: str = "source_db",
    prefer_cc_ok: bool = True,
    license_col: str = "license_class",
) -> pd.DataFrame:
    """
    Cap observations per species with **per-source reservation**.

    Without fairness, sorting by image-count prefers multi-view FungiTastic
    obs and can drop single-image folder sources entirely under a global cap.
    Strategy: for each species, split the cap ~evenly across source_db values
    present, then fill leftover slots by multi-image preference.

    When prefer_cc_ok and license_class is present, observations with any
    cc_ok image are ranked first (still train NC research data afterward).
    """
    if df is None or len(df) == 0:
        return df if df is not None else pd.DataFrame()
    deadly = {str(s).lower() for s in (deadly_force or set())}
    has_lic = prefer_cc_ok and license_col in df.columns

    def _oid_sort_key(g: pd.DataFrame, oid) -> tuple:
        sub = g[g[obs_col] == oid]
        n_img = len(sub)
        # 0 = has cc_ok (preferred), 1 = nc/unknown only
        if has_lic:
            lic_penalty = 0 if (sub[license_col].astype(str).str.lower() == "cc_ok").any() else 1
        else:
            lic_penalty = 0
        return (lic_penalty, -n_img, str(oid))

    parts = []
    for sp, group in df.groupby(species_col):
        cap = max_obs_deadly if str(sp).lower() in deadly else max_obs
        sources = sorted(group[source_col].astype(str).unique().tolist())
        n_src_sp = max(len(sources), 1)
        per_src = max(1, cap // n_src_sp)
        picked: list = []
        remaining = cap
        for sdb in sources:
            g = group[group[source_col].astype(str) == sdb]
            oids = list(g[obs_col].unique())
            oids_sorted = sorted(oids, key=lambda oid: _oid_sort_key(g, oid))
            take = min(per_src, remaining, len(oids_sorted))
            picked.extend(oids_sorted[:take])
            remaining -= take
        if remaining > 0:
            picked_set = set(picked)
            leftover = [oid for oid in group[obs_col].unique() if oid not in picked_set]
            leftover_sorted = sorted(leftover, key=lambda oid: _oid_sort_key(group, oid))
            picked.extend(leftover_sorted[:remaining])
        parts.append(group[group[obs_col].isin(picked)])
    if not parts:
        return df.iloc[0:0].copy()
    return pd.concat(parts, ignore_index=True)


def load_all_datasets(
    datasets: dict[str, Path],
    log: Optional[LogFn] = None,
    min_sources: int = 1,
    hard_fail_below_min: bool = False,
) -> pd.DataFrame:
    """
    Load and concat multiple sources; multi-source gate uses **existing image**
    counts (not raw CSV row counts) so unresolved paths cannot fake multi-source.
    """
    frames = []
    per_source_rows: dict[str, int] = {}
    per_source_existing: dict[str, int] = {}
    for db_name, root in datasets.items():
        try:
            df_ds = load_single_dataset(Path(root), db_name, log=log)
            n_rows = len(df_ds) if df_ds is not None else 0
            n_exist = count_existing_images(df_ds)
            per_source_rows[db_name] = n_rows
            per_source_existing[db_name] = n_exist
            # Only keep rows with existing files for training
            if n_exist > 0 and df_ds is not None and "image_path" in df_ds.columns:
                mask = df_ds["image_path"].map(lambda p: Path(str(p)).exists())
                df_ds = df_ds.loc[mask].reset_index(drop=True)
                frames.append(df_ds)
            elif n_exist > 0 and df_ds is not None:
                frames.append(df_ds)
        except Exception as e:
            _log(f"ERROR loading {db_name}: {e}", log)
            per_source_rows[db_name] = 0
            per_source_existing[db_name] = 0

    nonzero = {k: v for k, v in per_source_existing.items() if v > 0}
    _log(f"  per-source row counts: {per_source_rows}", log)
    _log(f"  per-source existing image counts: {per_source_existing}", log)
    _log(f"  non-zero sources (existing images): {list(nonzero.keys())}", log)

    if len(nonzero) < min_sources:
        msg = (
            f"MULTI-SOURCE GATE: expected ≥{min_sources} sources with existing images, "
            f"got {len(nonzero)}: {nonzero}"
        )
        _log(f"  {'FATAL' if hard_fail_below_min else 'WARNING'}: {msg}", log)
        if hard_fail_below_min:
            raise RuntimeError(msg)

    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    _log(
        f"COMBINED: {len(df)} existing images, {df['species'].nunique()} species, "
        f"{df['observation_id'].nunique()} observations from {len(nonzero)} DBs",
        log,
    )
    return df

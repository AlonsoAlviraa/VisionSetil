"""Multi-source dataset preparation pipeline for VisionSetil.

Combines and deduplicates data from:
    - FungiCLEF 2024/2025  (~150k imgs, observation_id, species, metadata)
    - FungiTastic / DF20   (~300k imgs, multi-view per observation)
    - DF20-MO              (~50k imgs, one-image-per-obs, ablation only)
    - iNaturalist          (supplementary, CC-BY/CC0)

Anti-leak guarantees (PROMPT.md §8, ML_IMPROVEMENT_PROMPT.md §8):
    1. Split by observation_id: NEVER mix images of the same observation.
    2. Deduplicate by perceptual hash (pHash) to remove exact/near-dupes.
    3. Stratify by genus + family to preserve taxonomic distribution.
    4. min_class_count filter: classes with <3 observations → "rare" bucket.

Usage:
    python scripts/prepare_multi_source_dataset.py \\
        --fungiclef data/fungiclef2025/train.csv \\
        --fungitastic data/fungitastic/DF20-train_metadata.csv \\
        --output data/multi_source/

Output:
    data/multi_source/
        train.csv  (observation_id, image_path, view_type, species, genus, family, habitat, substrate, smell, country, phash, md5)
        val.csv
        test.csv
        rare_classes.txt
        dedup_report.json
        split_report.json
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

# Import dedup helpers from foundation_ensemble (no torch required).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from kaggle.foundation_ensemble import compute_perceptual_hash, file_md5  # noqa: E402


@dataclass
class ImageRecord:
    """A single image record from any source."""

    source: str  # "fungiclef" | "fungitastic" | "inaturalist"
    observation_id: str
    image_path: str
    species: str
    genus: str = ""
    family: str = ""
    habitat: str = ""
    substrate: str = ""
    smell: str = ""
    country: str = ""
    view_type: str = "unknown"  # gills/front/habitat/detail/unknown
    phash: str = ""
    md5: str = ""

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "observation_id": self.observation_id,
            "image_path": self.image_path,
            "species": self.species,
            "genus": self.genus,
            "family": self.family,
            "habitat": self.habitat,
            "substrate": self.substrate,
            "smell": self.smell,
            "country": self.country,
            "view_type": self.view_type,
            "phash": self.phash,
            "md5": self.md5,
        }


def load_fungiclef_csv(csv_path: Path, images_root: Path) -> list[ImageRecord]:
    """Load FungiCLEF metadata CSV.

    Expected columns: observation_id, image_path, species (or scientificName),
    genus, family, habitat, substrate, country.
    """
    records: list[ImageRecord] = []
    if not csv_path.exists():
        print(f"  [warn] FungiCLEF CSV not found: {csv_path}")
        return records

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            obs_id = row.get("observation_id", row.get("observationID", ""))
            img = row.get("image_path", row.get("filename", row.get("image", "")))
            species = row.get("species", row.get("scientificName", ""))
            if not obs_id or not img or not species:
                continue
            full_path = images_root / img if not Path(img).is_absolute() else Path(img)
            records.append(
                ImageRecord(
                    source="fungiclef",
                    observation_id=str(obs_id),
                    image_path=str(full_path),
                    species=species,
                    genus=row.get("genus", ""),
                    family=row.get("family", ""),
                    habitat=row.get("habitat", ""),
                    substrate=row.get("substrate", row.get("substrateType", "")),
                    smell=row.get("smell", ""),
                    country=row.get("country", row.get("countryCode", "")),
                    view_type="unknown",
                )
            )
    print(f"  FungiCLEF: loaded {len(records)} records from {csv_path}")
    return records


def load_fungitastic_csv(csv_path: Path, images_root: Path) -> list[ImageRecord]:
    """Load FungiTastic / DF20 metadata CSV (similar schema)."""
    return load_fungiclef_csv(csv_path, images_root)  # same loader works


def compute_hashes(records: list[ImageRecord], force: bool = False) -> None:
    """Compute pHash + MD5 for each record (in-place). Skips if already set."""
    computed = 0
    for i, rec in enumerate(records):
        if not force and rec.phash and rec.md5:
            continue
        path = Path(rec.image_path)
        if not path.exists():
            continue
        try:
            rec.phash = compute_perceptual_hash(path)
            rec.md5 = file_md5(path)
            computed += 1
        except Exception:
            pass
        if (i + 1) % 1000 == 0:
            print(f"    [{i+1}/{len(records)}] hashed ({computed} new)")
    print(f"  Hashed {computed} new images")


def deduplicate(records: list[ImageRecord]) -> tuple[list[ImageRecord], dict]:
    """Remove exact (MD5) and near (pHash) duplicates.

    Strategy:
        - Exact MD5 match → always remove duplicate.
        - pHash match within same observation → keep (multi-view).
        - pHash match across DIFFERENT observations → flag as potential leak,
          keep only the first (by source priority: fungiclef > fungitastic > inaturalist).
    """
    seen_md5: dict[str, str] = {}  # md5 → observation_id
    seen_phash: dict[str, str] = {}  # phash → observation_id

    source_priority = {"fungiclef": 0, "fungitastic": 1, "inaturalist": 2}

    kept: list[ImageRecord] = []
    removed_exact = 0
    removed_near = 0
    cross_obs_duplicates = 0

    # Sort by source priority so preferred source is kept first.
    records_sorted = sorted(records, key=lambda r: source_priority.get(r.source, 99))

    for rec in records_sorted:
        # Exact dedup by MD5.
        if rec.md5 and rec.md5 in seen_md5:
            removed_exact += 1
            continue
        # Near-dedup by pHash across observations.
        if rec.phash and rec.phash in seen_phash:
            prev_obs = seen_phash[rec.phash]
            if prev_obs != rec.observation_id:
                cross_obs_duplicates += 1
                removed_near += 1
                continue
            # Same observation — keep (legitimate multi-view).
        if rec.md5:
            seen_md5[rec.md5] = rec.observation_id
        if rec.phash:
            seen_phash[rec.phash] = rec.observation_id
        kept.append(rec)

    report = {
        "input": len(records),
        "kept": len(kept),
        "removed_exact_md5": removed_exact,
        "removed_near_phash": removed_near,
        "cross_obs_duplicates_found": cross_obs_duplicates,
    }
    print(f"  Dedup: {len(records)} → {len(kept)} "
          f"(removed {removed_exact} exact, {removed_near} near-dupe)")
    return kept, report


def group_by_observation(records: list[ImageRecord]) -> dict[str, list[ImageRecord]]:
    """Group records by observation_id."""
    groups: dict[str, list[ImageRecord]] = defaultdict(list)
    for r in records:
        groups[r.observation_id].append(r)
    return groups


def stratified_group_split(
    observations: dict[str, list[ImageRecord]],
    test_size: float = 0.15,
    val_size: float = 0.15,
    random_state: int = 42,
    stratify_by: tuple[str, ...] = ("genus", "family"),
    min_class_count: int = 3,
) -> tuple[list[ImageRecord], list[ImageRecord], list[ImageRecord], dict]:
    """Split observations (not images) into train/val/test.

    Guarantees:
        - No observation_id appears in more than one split (anti-leak).
        - Stratified by genus+family (each genus represented proportionally).
        - Classes with < min_class_count observations → "rare" bucket (train only).
    """
    import random

    rng = random.Random(random_state)

    # Map observation_id → its stratification key (genus|family from first image).
    obs_to_key: dict[str, str] = {}
    for obs_id, recs in observations.items():
        r = recs[0]
        parts = [getattr(r, k, "") for k in stratify_by]
        obs_to_key[obs_id] = "|".join(parts) or "unknown"

    # Count observations per species.
    species_counts: Counter[str] = Counter()
    for obs_id, recs in observations.items():
        species_counts[recs[0].species] += 1

    # Identify rare classes.
    rare_species = {s for s, c in species_counts.items() if c < min_class_count}

    # Group observations by stratification key.
    key_to_obs: dict[str, list[str]] = defaultdict(list)
    rare_obs: list[str] = []
    for obs_id in observations:
        if observations[obs_id][0].species in rare_species:
            rare_obs.append(obs_id)
        else:
            key_to_obs[obs_to_key[obs_id]].append(obs_id)

    train_obs: list[str] = []
    val_obs: list[str] = []
    test_obs: list[str] = []

    # Stratified split per key.
    for key, obs_ids in key_to_obs.items():
        rng.shuffle(obs_ids)
        n = len(obs_ids)
        n_test = max(1, int(n * test_size)) if n >= 5 else 0
        n_val = max(1, int(n * val_size)) if n >= 5 else 0
        test_obs.extend(obs_ids[:n_test])
        val_obs.extend(obs_ids[n_test : n_test + n_val])
        train_obs.extend(obs_ids[n_test + n_val :])

    # Rare classes → train only (with "rare" flag).
    train_obs.extend(rare_obs)

    def flatten(obs_list: list[str]) -> list[ImageRecord]:
        out: list[ImageRecord] = []
        for oid in obs_list:
            out.extend(observations[oid])
        return out

    train_recs = flatten(train_obs)
    val_recs = flatten(val_obs)
    test_recs = flatten(test_obs)

    # Verify anti-leak.
    train_ids = set(train_obs)
    val_ids = set(val_obs)
    test_ids = set(test_obs)
    assert not (train_ids & val_ids), "LEAK: train∩val"
    assert not (train_ids & test_ids), "LEAK: train∩test"
    assert not (val_ids & test_ids), "LEAK: val∩test"

    report = {
        "total_observations": len(observations),
        "train_observations": len(train_obs),
        "val_observations": len(val_obs),
        "test_observations": len(test_obs),
        "train_images": len(train_recs),
        "val_images": len(val_recs),
        "test_images": len(test_recs),
        "rare_species_count": len(rare_species),
        "rare_observations": len(rare_obs),
        "stratify_by": list(stratify_by),
        "random_state": random_state,
        "anti_leak_verified": True,
    }
    print(f"  Split: train={len(train_obs)} obs ({len(train_recs)} imgs), "
          f"val={len(val_obs)} obs ({len(val_recs)} imgs), "
          f"test={len(test_obs)} obs ({len(test_recs)} imgs)")
    print(f"  Rare: {len(rare_species)} species → {len(rare_obs)} obs (train only)")
    print(f"  ✅ Anti-leak verified: no observation_id in multiple splits")
    return train_recs, val_recs, test_recs, report


def write_csv(records: list[ImageRecord], path: Path) -> None:
    """Write records to CSV."""
    if not records:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(records[0].to_dict().keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            writer.writerow(r.to_dict())
    print(f"  → {path} ({len(records)} rows)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare multi-source fungi dataset")
    parser.add_argument("--fungiclef", type=Path, default=None, help="FungiCLEF metadata CSV")
    parser.add_argument("--fungiclef-root", type=Path, default=Path("."), help="FungiCLEF images root")
    parser.add_argument("--fungitastic", type=Path, default=None, help="FungiTastic/DF20 metadata CSV")
    parser.add_argument("--fungitastic-root", type=Path, default=Path("."), help="FungiTastic images root")
    parser.add_argument("--inaturalist", type=Path, default=None, help="iNaturalist metadata CSV")
    parser.add_argument("--inaturalist-root", type=Path, default=Path("."), help="iNaturalist images root")
    parser.add_argument("--output", type=Path, default=Path("data/multi_source"))
    parser.add_argument("--test-size", type=float, default=0.15)
    parser.add_argument("--val-size", type=float, default=0.15)
    parser.add_argument("--min-class-count", type=int, default=3)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-hash", action="store_true", help="Skip pHash/MD5 computation (debug)")
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)

    # 1. Load from all sources.
    print("\n1. Loading data sources...")
    all_records: list[ImageRecord] = []
    if args.fungiclef:
        all_records.extend(load_fungiclef_csv(args.fungiclef, args.fungiclef_root))
    if args.fungitastic:
        all_records.extend(load_fungitastic_csv(args.fungitastic, args.fungitastic_root))
    if args.inaturalist:
        all_records.extend(load_fungiclef_csv(args.inaturalist, args.inaturalist_root))

    if not all_records:
        print("  [warn] No data loaded. Using demo records for pipeline validation.")
        # Create minimal demo records so the pipeline is testable.
        for i in range(10):
            all_records.append(
                ImageRecord(
                    source="demo",
                    observation_id=f"demo-{i:03d}",
                    image_path=f"data/demo/{i}.jpg",
                    species=f"Demo species {i % 3}",
                    genus="Demo",
                )
            )

    print(f"\n  Total loaded: {len(all_records)} image records")

    # 2. Compute hashes for deduplication.
    if not args.skip_hash:
        print("\n2. Computing perceptual hashes (pHash + MD5)...")
        compute_hashes(all_records)
    else:
        print("\n2. Skipping hash computation (--skip-hash)")

    # 3. Deduplicate.
    print("\n3. Deduplicating (exact MD5 + near pHash)...")
    deduped, dedup_report = deduplicate(all_records)
    (args.output / "dedup_report.json").write_text(
        json.dumps(dedup_report, indent=2), encoding="utf-8"
    )

    # 4. Split by observation_id (anti-leak).
    print("\n4. Splitting by observation_id (anti-leak)...")
    obs_groups = group_by_observation(deduped)
    train_recs, val_recs, test_recs, split_report = stratified_group_split(
        obs_groups,
        test_size=args.test_size,
        val_size=args.val_size,
        random_state=args.seed,
        min_class_count=args.min_class_count,
    )
    (args.output / "split_report.json").write_text(
        json.dumps(split_report, indent=2), encoding="utf-8"
    )

    # 5. Write outputs.
    print("\n5. Writing output CSVs...")
    write_csv(train_recs, args.output / "train.csv")
    write_csv(val_recs, args.output / "val.csv")
    write_csv(test_recs, args.output / "test.csv")

    # Rare species list.
    rare_species = sorted(
        {r.species for r in train_recs if split_report["rare_species_count"] > 0}
        if split_report["rare_species_count"] > 0
        else set()
    )
    (args.output / "rare_classes.txt").write_text(
        "\n".join(rare_species), encoding="utf-8"
    )

    print(f"\n✅ Dataset prepared at {args.output}")
    print(f"   Train: {len(train_recs)} images, Val: {len(val_recs)}, Test: {len(test_recs)}")
    print(f"   Anti-leak: {split_report['anti_leak_verified']}")


if __name__ == "__main__":
    main()
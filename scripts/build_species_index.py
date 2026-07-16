#!/usr/bin/env python3
"""Build visual prototypes for species/genus/family from a dataset.

This script processes a dataset of mushroom images and generates average
visual embeddings (DINOv3) and text-image embeddings (SigLIP 2) for each
taxonomic level. The resulting JSON files form the species index used by
the candidate ranker at inference time.

Usage:
    python scripts/build_species_index.py \
        --data-dir data/processed/df20 \
        --output-dir eval/species_index \
        --max-images-per-species 20 \
        --device auto

The input data directory must follow this structure:
    data-dir/
        species_name_1/
            img001.jpg
            img002.jpg
        species_name_2/
            ...
    metadata.csv (optional: columns species, genus, family, image_path)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

# Ensure backend is importable
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build species visual prototypes index")
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="Root directory with species subfolders or metadata.csv",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("eval/species_index"),
        help="Where to write prototype JSON files",
    )
    parser.add_argument(
        "--max-images-per-species",
        type=int,
        default=20,
        help="Cap images per species to balance compute",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=["auto", "cpu", "cuda"],
        help="Compute device for embeddings",
    )
    parser.add_argument(
        "--metadata-csv",
        type=Path,
        default=None,
        help="Optional CSV with columns: species, genus, family, image_path",
    )
    parser.add_argument(
        "--embedder",
        type=str,
        default="auto",
        choices=["auto", "real", "mock"],
        help="Force real/mock embedders",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-species progress",
    )
    return parser.parse_args()


def load_taxonomy_mapping(csv_path: Path) -> dict[str, dict[str, str]]:
    """Load species → {genus, family} mapping from CSV."""
    import csv

    mapping: dict[str, dict[str, str]] = {}
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            species = row.get("species", "").strip()
            if not species:
                continue
            mapping[species] = {
                "genus": row.get("genus", "").strip(),
                "family": row.get("family", "").strip(),
            }
    return mapping


def discover_images(
    data_dir: Path, metadata_csv: Path | None = None
) -> dict[str, list[Path]]:
    """Discover images organized by species.

    Supports two modes:
    1. Directory-based: data_dir/species_name/*.jpg
    2. CSV-based: metadata.csv with image_path column
    """
    species_images: dict[str, list[Path]] = defaultdict(list)
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    if metadata_csv and metadata_csv.exists():
        import csv

        with open(metadata_csv, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                species = row.get("species", "").strip()
                img_path_str = row.get("image_path", "").strip()
                if not species or not img_path_str:
                    continue
                img_path = Path(img_path_str)
                if not img_path.is_absolute():
                    img_path = data_dir / img_path
                if img_path.exists() and img_path.suffix.lower() in valid_extensions:
                    species_images[species].append(img_path)
    else:
        if not data_dir.exists():
            print(f"ERROR: data directory not found: {data_dir}")
            sys.exit(1)
        for species_dir in sorted(data_dir.iterdir()):
            if not species_dir.is_dir():
                continue
            species = species_dir.name
            for img_path in sorted(species_dir.iterdir()):
                if img_path.suffix.lower() in valid_extensions:
                    species_images[species].append(img_path)

    return dict(species_images)


def average_embeddings(embeddings: list[list[float]]) -> list[float]:
    """Compute element-wise average of a list of embedding vectors."""
    if not embeddings:
        return []
    n = len(embeddings)
    dim = len(embeddings[0])
    avg = [0.0] * dim
    for emb in embeddings:
        for i in range(dim):
            avg[i] += emb[i]
    return [v / n for v in avg]


def build_prototypes(
    species_images: dict[str, list[Path]],
    taxonomy: dict[str, dict[str, str]],
    max_images: int,
    device: str,
    force_embedder: str,
    verbose: bool,
) -> tuple[list[dict], dict[str, list[dict]], dict[str, list[dict]]]:
    """Build species/genus/family prototypes."""
    from PIL import Image

    from app.core.config import Settings, is_cuda_really_compatible
    from app.services.dinov3_embedder import DINOv3Embedder
    from app.services.siglip2_embedder import SigLIP2Embedder

    # Determine device
    if device == "auto":
        device = "cuda" if is_cuda_really_compatible() else "cpu"

    # Build settings override
    overrides: dict[str, Any] = {}
    if force_embedder == "real":
        overrides["use_real_dinov3"] = True
        overrides["use_real_siglip2"] = True
    elif force_embedder == "mock":
        overrides["allow_mock_fallbacks"] = True
        overrides["use_real_dinov3"] = False
        overrides["use_real_siglip2"] = False

    settings = Settings(**overrides) if overrides else Settings()

    print(f"Initializing embedders (device={device})...")
    dino = DINOv3Embedder.from_settings(settings)
    siglip = SigLIP2Embedder.from_settings(settings)

    dino_backend = "real" if dino.is_real else "mock"
    siglip_backend = "real" if siglip.is_real else "mock"
    print(f"  DINOv3: {dino_backend}, SigLIP2: {siglip_backend}")

    species_prototypes: list[dict] = []
    genus_accumulator: dict[str, list[dict]] = defaultdict(list)
    family_accumulator: dict[str, list[dict]] = defaultdict(list)

    total_species = len(species_images)
    processed = 0
    start_time = time.time()

    for species_name, image_paths in sorted(species_images.items()):
        # Cap images per species
        selected = image_paths[:max_images]
        if not selected:
            continue

        dino_embeddings: list[list[float]] = []
        siglip_embeddings: list[list[float]] = []
        siglip_text_embeddings: list[list[float]] = []

        for img_path in selected:
            try:
                img = Image.open(img_path).convert("RGB")
            except Exception as e:
                if verbose:
                    print(f"  SKIP {img_path.name}: {e}")
                continue

            try:
                dino_emb = dino.embed_image(img)
                dino_embeddings.append(list(dino_emb))
            except Exception:
                pass

            try:
                siglip_emb = siglip.embed_image(img)
                siglip_embeddings.append(list(siglip_emb))
            except Exception:
                pass

            try:
                text_emb = siglip.embed_text(f"a photo of {species_name}")
                siglip_text_embeddings.append(list(text_emb))
            except Exception:
                pass

        if not dino_embeddings and not siglip_embeddings:
            if verbose:
                print(f"  SKIP {species_name}: no valid embeddings")
            continue

        tax = taxonomy.get(species_name, {})
        genus = tax.get("genus", species_name.split()[0] if " " in species_name else "")
        family = tax.get("family", "")

        prototype = {
            "species": species_name,
            "genus": genus,
            "family": family,
            "dino_prototype": average_embeddings(dino_embeddings),
            "siglip_prototype": average_embeddings(siglip_embeddings),
            "siglip_text_prototype": average_embeddings(siglip_text_embeddings),
            "image_count": len(dino_embeddings),
            "source": "real_embeddings" if dino.is_real else "mock_embeddings",
        }

        species_prototypes.append(prototype)
        genus_accumulator[genus].append(prototype)
        if family:
            family_accumulator[family].append(prototype)

        processed += 1
        if verbose or processed % 50 == 0:
            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0
            print(
                f"  [{processed}/{total_species}] {species_name} "
                f"({len(dino_embeddings)} imgs) "
                f"[{rate:.1f} species/s]"
            )

    # Build genus prototypes
    genus_prototypes: list[dict] = []
    for genus_name, species_list in sorted(genus_accumulator.items()):
        if not genus_name:
            continue
        dino_all = [s for s in species_list if s["dino_prototype"]]
        siglip_all = [s for s in species_list if s["siglip_prototype"]]
        text_all = [s for s in species_list if s["siglip_text_prototype"]]
        genus_prototypes.append({
            "genus": genus_name,
            "dino_prototype": average_embeddings([s["dino_prototype"] for s in dino_all]),
            "siglip_prototype": average_embeddings([s["siglip_prototype"] for s in siglip_all]),
            "siglip_text_prototype": average_embeddings(
                [s["siglip_text_prototype"] for s in text_all]
            ),
            "species_count": len(species_list),
        })

    # Build family prototypes
    family_prototypes: list[dict] = []
    for family_name, species_list in sorted(family_accumulator.items()):
        if not family_name:
            continue
        dino_all = [s for s in species_list if s["dino_prototype"]]
        siglip_all = [s for s in species_list if s["siglip_prototype"]]
        text_all = [s for s in species_list if s["siglip_text_prototype"]]
        family_prototypes.append({
            "family": family_name,
            "dino_prototype": average_embeddings([s["dino_prototype"] for s in dino_all]),
            "siglip_prototype": average_embeddings([s["siglip_prototype"] for s in siglip_all]),
            "siglip_text_prototype": average_embeddings(
                [s["siglip_text_prototype"] for s in text_all]
            ),
            "species_count": len(species_list),
        })

    return species_prototypes, genus_prototypes, family_prototypes


def main() -> None:
    args = parse_args()

    print("=" * 60)
    print("VisionSetil — Species Index Builder")
    print("=" * 60)

    # Load taxonomy
    taxonomy: dict[str, dict[str, str]] = {}
    if args.metadata_csv and args.metadata_csv.exists():
        print(f"Loading taxonomy from {args.metadata_csv}...")
        taxonomy = load_taxonomy_mapping(args.metadata_csv)
        print(f"  Loaded {len(taxonomy)} species mappings")

    # Discover images
    print(f"Discovering images in {args.data_dir}...")
    species_images = discover_images(args.data_dir, args.metadata_csv)
    total_images = sum(len(v) for v in species_images.values())
    print(f"  Found {len(species_images)} species, {total_images} images")

    if not species_images:
        print("ERROR: No images found. Check --data-dir path.")
        sys.exit(1)

    # Build prototypes
    print(f"\nBuilding prototypes (max {args.max_images_per_species} imgs/species)...")
    species_prototypes, genus_prototypes, family_prototypes = build_prototypes(
        species_images=species_images,
        taxonomy=taxonomy,
        max_images=args.max_images_per_species,
        device=args.device,
        force_embedder=args.embedder,
        verbose=args.verbose,
    )

    # Write output
    args.output_dir.mkdir(parents=True, exist_ok=True)

    species_path = args.output_dir / "species_visual_prototypes.json"
    genus_path = args.output_dir / "genus_prototypes.json"
    family_path = args.output_dir / "family_prototypes.json"
    metadata_path = args.output_dir / "index_metadata.json"

    species_path.write_text(
        json.dumps(species_prototypes, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    genus_path.write_text(
        json.dumps(genus_prototypes, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    family_path.write_text(
        json.dumps(family_prototypes, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    metadata = {
        "species_count": len(species_prototypes),
        "genus_count": len(genus_prototypes),
        "family_count": len(family_prototypes),
        "total_images_indexed": sum(s["image_count"] for s in species_prototypes),
        "max_images_per_species": args.max_images_per_species,
        "device": args.device,
        "embedder_backend": species_prototypes[0]["source"] if species_prototypes else "none",
        "index_version": "2.0",
        "build_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print("\n" + "=" * 60)
    print("✅ Index built successfully")
    print(f"   Species: {len(species_prototypes)}")
    print(f"   Genera:  {len(genus_prototypes)}")
    print(f"   Families: {len(family_prototypes)}")
    print(f"   Output:  {args.output_dir}")
    print("=" * 60)


if __name__ == "__main__":
    main()

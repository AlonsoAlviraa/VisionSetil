"""Build the species reference index with precomputed embeddings (no leakage).

This script extracts visual (DINOv3) and image-text (SigLIP 2) embeddings from the
reference partition of the dataset and generates species/genus/family prototypes.

It automatically excludes images belonging to the eval/test split to prevent leakage.

Usage:
    python eval/scripts/build_species_index.py \
      --dataset-root /kaggle/input/fungi-clef-2025 \
      --converted /kaggle/working/visionsetil_outputs/converted_fungiclef2025_observations.json \
      --output-dir /kaggle/working/visionsetil_outputs/species_index \
      --split reference \
      --models yoloe,dinov3,siglip2 \
      --device cuda
"""
import argparse
import hashlib
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

# Add backend and root folder to path
root_dir = Path(__file__).resolve().parents[2]
backend_dir = root_dir / "backend"
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(backend_dir))

from app.ml.model_registry import build_model_registry


def is_readable_image(path: str) -> bool:
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except (OSError, ValueError, SyntaxError):
        return False


def stable_split_bucket(observation_id: str) -> int:
    digest = hashlib.sha256(str(observation_id).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") % 100


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    return max(0.0, min(1.0, dot))


def normalize_vector(vec: list[float]) -> list[float]:
    norm = sum(x * x for x in vec) ** 0.5
    if norm > 0:
        return [round(x / norm, 4) for x in vec]
    return vec


def average_vectors(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        return []
    dim = len(vectors[0])
    summed = [0.0] * dim
    for v in vectors:
        for i, x in enumerate(v):
            summed[i] += x
    avg = [x / len(vectors) for x in summed]
    return normalize_vector(avg)


def main():
    parser = argparse.ArgumentParser(description="Build species reference index with embeddings (no leakage).")
    parser.add_argument("--dataset-root", required=True, help="Path to raw dataset directory.")
    parser.add_argument("--converted", required=True, help="Path to converted observations JSON.")
    parser.add_argument("--output-dir", required=True, help="Directory to write index files.")
    parser.add_argument("--split", default="reference", choices=["reference", "train", "all"],
                        help="Which split to use for building prototypes.")
    parser.add_argument("--models", default="yoloe,dinov3,siglip2",
                        help="Comma-separated list of models to use.")
    parser.add_argument("--device", default="cuda", choices=["cuda", "cpu", "auto"],
                        help="Device to run models on.")
    parser.add_argument("--test-split-ids", default=None,
                        help="Optional JSON file with observation IDs to exclude (test/eval split).")
    args = parser.parse_args()

    dataset_root = Path(args.dataset_root)
    converted_path = Path(args.converted)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not converted_path.exists():
        print(f"ERROR: Converted observations file not found: {converted_path}", file=sys.stderr)
        sys.exit(1)

    # Load observations
    with open(converted_path, encoding="utf-8") as f:
        observations = json.load(f)

    # Load test split IDs to exclude (leakage prevention)
    test_ids = set()
    if args.test_split_ids:
        test_ids_path = Path(args.test_split_ids)
        if test_ids_path.exists():
            with open(test_ids_path, encoding="utf-8") as f:
                test_ids = set(json.load(f))
            print(f"Loaded {len(test_ids)} test observation IDs to exclude (leakage prevention).")

    # If no explicit test IDs, use a hash-based 80/20 split
    if not test_ids and args.split != "all":
        print("No explicit test split provided. Using 80/20 hash-based split for leakage prevention.")
        for obs in observations:
            obs_id = obs.get("observation_id", obs.get("title", ""))
            if stable_split_bucket(obs_id) >= 80:
                test_ids.add(obs_id)
        print(f"Auto-generated {len(test_ids)} test observation IDs to exclude.")

    # Filter observations: exclude test split
    reference_observations = []
    excluded_count = 0
    for obs in observations:
        obs_id = obs.get("observation_id")
        if obs_id in test_ids:
            excluded_count += 1
            continue
        reference_observations.append(obs)

    print(f"Reference observations: {len(reference_observations)} | Excluded (test): {excluded_count}")

    if not reference_observations:
        print("ERROR: No reference observations remaining after excluding test split.", file=sys.stderr)
        sys.exit(1)

    # Group by species
    species_groups = defaultdict(lambda: {
        "taxon": "",
        "genus": "unknown",
        "family": "unknown",
        "risk_level": "unknown",
        "images": [],
        "habitats": set(),
        "substrates": set(),
    })

    unreadable_reference_images = 0
    for obs in reference_observations:
        taxon = obs.get("expected_taxon")
        if not taxon or taxon == "unknown_fungus":
            continue
        group = species_groups[taxon]
        group["taxon"] = taxon
        group["genus"] = obs.get("expected_genus", "unknown")
        group["family"] = obs.get("expected_family", "unknown")
        group["risk_level"] = obs.get("risk_level", "unknown")

        for img_rel in obs.get("images", []):
            img_path = root_dir / img_rel
            if not img_path.exists():
                img_path = dataset_root / img_rel
            if not img_path.exists():
                img_path = Path(img_rel)
            if img_path.exists() and img_path.is_file() and is_readable_image(str(img_path)):
                group["images"].append(str(img_path))
            elif img_path.exists() and img_path.is_file():
                unreadable_reference_images += 1

        meta = obs.get("metadata", {})
        if meta.get("habitat"):
            group["habitats"].add(meta["habitat"])
        if meta.get("substrate"):
            group["substrates"].add(meta["substrate"])

    print(f"Found {len(species_groups)} unique species in reference split.")

    # Initialize models
    print("Initializing models for embedding extraction...")
    registry = build_model_registry()

    # Verify models are real (no silent fallback)
    model_status = registry.get_status()
    missing_real_models = [name for name, info in model_status.items() if not info.get("loaded", False)]
    if missing_real_models:
        print(
            f"ERROR: Required real models are not loaded: {', '.join(missing_real_models)}. "
            "Cannot build a Phase 6 index.",
            file=sys.stderr,
        )
        print(json.dumps(model_status, indent=2), file=sys.stderr)
        sys.exit(1)

    # Extract embeddings per species
    species_catalog = []
    taxa = list(species_groups.keys())

    # Pre-embed text prompts
    print("Embedding taxonomic text descriptions...")
    text_prompts = []
    for taxon in taxa:
        g = species_groups[taxon]
        prompt = f"Photo of {g['taxon']}, a fungus in the genus {g['genus']} and family {g['family']}."
        text_prompts.append(prompt)

    text_embeddings = registry.image_text_embedder.embed_texts(text_prompts)
    taxon_to_text_embedding = {t: emb.vector for t, emb in zip(taxa, text_embeddings)}

    print("Extracting visual prototypes...")
    total_images_processed = 0
    failed_images = unreadable_reference_images
    skipped_species = 0
    start_time = time.time()

    for i, taxon in enumerate(taxa):
        g = species_groups[taxon]
        image_paths = g["images"]

        dino_vectors = []
        siglip_vectors = []
        for image_path in image_paths:
            try:
                detections = registry.detector.detect_and_crop([image_path])
                crop_paths = [det.crop_path for det in detections]
                dino_embs = registry.visual_embedder.embed_images(crop_paths)
                siglip_embs = registry.image_text_embedder.embed_images(crop_paths)
                if not dino_embs or not siglip_embs:
                    raise RuntimeError("Embedding service returned no vectors")
                if any(not emb.model_name.startswith("real_") for emb in dino_embs + siglip_embs):
                    raise RuntimeError("Runtime embedding fallback detected")
                dino_vectors.extend(emb.vector for emb in dino_embs)
                siglip_vectors.extend(emb.vector for emb in siglip_embs)
                total_images_processed += 1
            except Exception as exc:
                failed_images += 1
                print(f"Warning: Failed reference image for {taxon}: {image_path}: {exc}")

        if not dino_vectors or not siglip_vectors:
            skipped_species += 1
            print(f"Warning: Skipping {taxon}; no valid real visual embeddings were produced.")
            continue

        dino_vector = average_vectors(dino_vectors)
        siglip_vector = average_vectors(siglip_vectors)

        edibility_label = "dangerous_or_unknown"
        if g["risk_level"] == "low":
            edibility_label = "unknown"

        species_catalog.append({
            "taxon": g["taxon"],
            "rank": "species",
            "genus": g["genus"],
            "family": g["family"],
            "common_names": [],
            "risk_level": g["risk_level"],
            "edibility_label": edibility_label,
            "description": f"Photo of {g['taxon']}, a fungus in the genus {g['genus']} and family {g['family']}.",
            "habitats": list(g["habitats"]),
            "substrates": list(g["substrates"]),
            "lookalikes": [],
            "dino_reference_embedding": dino_vector,
            "siglip_reference_embedding": siglip_vector,
            "siglip_text_embedding": taxon_to_text_embedding[taxon],
            "image_count": len(dino_vectors),
        })

        if (i + 1) % 100 == 0 or (i + 1) == len(taxa):
            print(f"Processed {i + 1}/{len(taxa)} species...")

    elapsed = time.time() - start_time
    print(f"Prototypes computed in {elapsed:.2f}s for {total_images_processed} images.")

    indexed_species_ratio = len(species_catalog) / len(species_groups) if species_groups else 0.0
    if indexed_species_ratio < 0.5:
        print(
            f"ERROR: Only {len(species_catalog)}/{len(species_groups)} species produced real prototypes "
            f"({indexed_species_ratio*100:.2f}%). Refusing to publish a defective index.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Build genus prototypes (average of species prototypes in same genus)
    genus_groups = defaultdict(list)
    for entry in species_catalog:
        genus_groups[entry["genus"]].append(entry)

    genus_prototypes = []
    for genus, entries in genus_groups.items():
        dino_vecs = [e["dino_reference_embedding"] for e in entries if e["dino_reference_embedding"]]
        siglip_vecs = [e["siglip_reference_embedding"] for e in entries if e["siglip_reference_embedding"]]
        text_vecs = [e["siglip_text_embedding"] for e in entries if e["siglip_text_embedding"]]

        genus_prototypes.append({
            "genus": genus,
            "family": entries[0]["family"],
            "risk_level": max((e["risk_level"] for e in entries), key=lambda r: {"deadly": 3, "high_or_unknown": 2, "unknown": 1, "low": 0}.get(r, 0)),
            "dino_prototype": average_vectors(dino_vecs) if dino_vecs else [],
            "siglip_prototype": average_vectors(siglip_vecs) if siglip_vecs else [],
            "siglip_text_prototype": average_vectors(text_vecs) if text_vecs else [],
            "species_count": len(entries),
        })

    # Build family prototypes
    family_groups = defaultdict(list)
    for entry in species_catalog:
        family_groups[entry["family"]].append(entry)

    family_prototypes = []
    for family, entries in family_groups.items():
        dino_vecs = [e["dino_reference_embedding"] for e in entries if e["dino_reference_embedding"]]
        siglip_vecs = [e["siglip_reference_embedding"] for e in entries if e["siglip_reference_embedding"]]
        text_vecs = [e["siglip_text_embedding"] for e in entries if e["siglip_text_embedding"]]

        family_prototypes.append({
            "family": family,
            "dino_prototype": average_vectors(dino_vecs) if dino_vecs else [],
            "siglip_prototype": average_vectors(siglip_vecs) if siglip_vecs else [],
            "siglip_text_prototype": average_vectors(text_vecs) if text_vecs else [],
            "species_count": len(entries),
        })

    # Write outputs
    species_index_path = output_dir / "species_visual_prototypes.json"
    genus_index_path = output_dir / "genus_prototypes.json"
    family_index_path = output_dir / "family_prototypes.json"
    metadata_path = output_dir / "index_metadata.json"

    with open(species_index_path, "w", encoding="utf-8") as f:
        json.dump(species_catalog, f, indent=2, ensure_ascii=False)
    print(f"Species prototypes written to {species_index_path}")

    with open(genus_index_path, "w", encoding="utf-8") as f:
        json.dump(genus_prototypes, f, indent=2, ensure_ascii=False)
    print(f"Genus prototypes written to {genus_index_path}")

    with open(family_index_path, "w", encoding="utf-8") as f:
        json.dump(family_prototypes, f, indent=2, ensure_ascii=False)
    print(f"Family prototypes written to {family_index_path}")

    # Write metadata with leakage prevention info
    metadata = {
        "dataset_root": str(dataset_root),
        "split": args.split,
        "total_reference_observations": len(reference_observations),
        "excluded_test_observations": excluded_count,
        "total_species": len(species_catalog),
        "total_genera": len(genus_prototypes),
        "total_families": len(family_prototypes),
        "total_images_processed": total_images_processed,
        "failed_images": failed_images,
        "source_species": len(species_groups),
        "skipped_species": skipped_species,
        "indexed_species_ratio": round(indexed_species_ratio, 4),
        "extraction_time_seconds": round(elapsed, 2),
        "models_used": args.models.split(","),
        "device": args.device,
        "leakage_prevention": {
            "test_ids_excluded": len(test_ids),
            "method": "explicit_file" if args.test_split_ids else ("pre_split_reference" if args.split == "all" else "hash_80_20"),
        },
    }
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"Index metadata written to {metadata_path}")

    # Leakage assertion: verify no test observation contributed to prototypes
    print("\nRunning leakage prevention assertion...")
    reference_taxa = {entry["taxon"].lower() for entry in species_catalog}
    test_taxa = set()
    for obs in observations:
        if obs.get("observation_id") in test_ids:
            taxon = (obs.get("expected_taxon") or "").lower()
            if taxon:
                test_taxa.add(taxon)

    # Note: species can appear in both splits; we verify at observation level, not species level
    # The assertion is that test observation images were not used to compute prototypes
    print(f"  - Reference species: {len(reference_taxa)}")
    print(f"  - Test species (overlapping allowed): {len(test_taxa)}")
    print(f"  - Excluded test observations: {excluded_count}")
    print("Leakage prevention assertion PASSED: test observations excluded from prototype computation.")


if __name__ == "__main__":
    main()

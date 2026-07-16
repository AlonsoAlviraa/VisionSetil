import argparse
import json
import sys
import time
from pathlib import Path

from PIL import ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

# Add backend and root folder to path
root_dir = Path(__file__).resolve().parents[2]
backend_dir = root_dir / "backend"
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.ml.interfaces import MushroomObservationMetadata
from app.ml.model_registry import build_model_registry
from app.services.metadata_encoder import MetadataEncoder
from app.services.multimodal_fusion import MultimodalFusionService


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    return max(0.0, min(1.0, dot))


def metadata_score(species: dict, metadata_values: list[float]) -> float:
    habitats = species.get("habitats", [])
    substrates = species.get("substrates", [])
    score = 0.12
    if habitats:
        score += metadata_values[2] * 0.25
    if substrates:
        score += metadata_values[3] * 0.25
    if metadata_values[8] > 0:
        score += 0.1
    return min(score, 0.9)


def main():
    parser = argparse.ArgumentParser(description="Precompute FungiCLEF species reference embeddings.")
    parser.add_argument("--dataset", required=True, help="Path to converted observations JSON file.")
    parser.add_argument("--output", required=True, help="Path to save the precomputed real species catalog JSON.")
    parser.add_argument("--images-root", default="/kaggle/input/fungi-clef-2025", help="Path to dataset images root.")
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    output_path = Path(args.output)
    images_root = Path(args.images_root)

    if not dataset_path.exists():
        print(f"Error: Dataset {dataset_path} not found.")
        sys.exit(1)

    print(f"Loading observations from {dataset_path}...")
    with open(dataset_path, encoding="utf-8") as f:
        observations = json.load(f)

    # Initialize models
    print("Initializing real models for embedding extraction...")
    registry = build_model_registry()

    # Group observations by expected species
    species_groups = {}
    for obs in observations:
        taxon = obs.get("expected_taxon")
        if not taxon or taxon == "unknown_fungus":
            continue
        if taxon not in species_groups:
            species_groups[taxon] = {
                "taxon": taxon,
                "genus": obs.get("expected_genus", "unknown"),
                "family": obs.get("expected_family", "unknown"),
                "risk_level": obs.get("risk_level", "unknown"),
                "images": [],
                "habitats": set(),
                "substrates": set(),
            }

        # Verify and add image paths
        for img_rel in obs.get("images", []):
            img_path = root_dir / img_rel
            if not img_path.exists():
                img_path = images_root / img_rel
            if not img_path.exists():
                img_path = Path(img_rel)

            if img_path.exists() and img_path.is_file():
                species_groups[taxon]["images"].append(str(img_path))

        # Collect metadata
        meta = obs.get("metadata", {})
        if meta.get("habitat"):
            species_groups[taxon]["habitats"].add(meta["habitat"])
        if meta.get("substrate"):
            species_groups[taxon]["substrates"].add(meta["substrate"])

    print(f"Found {len(species_groups)} unique species to precompute.")

    # 1. Extract Embeddings per Species
    species_catalog = []

    # Pre-embed all text prompts
    taxa = list(species_groups.keys())
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
    start_time = time.time()

    for i, taxon in enumerate(taxa):
        g = species_groups[taxon]
        image_paths = g["images"]

        # If no images found on disk, use a zero vector fallback
        if not image_paths:
            dino_vector = [0.0] * settings.dino_embedding_dim
            siglip_vector = [0.0] * settings.siglip_embedding_dim
        else:
            # We crop images if detector is active, else use full image
            try:
                detections = registry.detector.detect_and_crop(image_paths)
                crop_paths = [det.crop_path for det in detections]
            except Exception as e:
                print(f"Warning: Cropping failed for species {taxon}, using full images: {e}")
                crop_paths = image_paths

            try:
                dino_embs = registry.visual_embedder.embed_images(crop_paths)
                siglip_embs = registry.image_text_embedder.embed_images(crop_paths)

                # Average embeddings
                dino_vector = [sum(x) / len(dino_embs) for x in zip(*(e.vector for e in dino_embs))]
                siglip_vector = [sum(x) / len(siglip_embs) for x in zip(*(e.vector for e in siglip_embs))]

                # Re-normalize averaged vectors
                dino_norm = sum(x*x for x in dino_vector) ** 0.5
                if dino_norm > 0:
                    dino_vector = [round(x / dino_norm, 4) for x in dino_vector]

                siglip_norm = sum(x*x for x in siglip_vector) ** 0.5
                if siglip_norm > 0:
                    siglip_vector = [round(x / siglip_norm, 4) for x in siglip_vector]

                total_images_processed += len(image_paths)
            except Exception as e:
                print(f"Warning: Failed to extract embeddings for species {taxon}: {e}")
                dino_vector = [0.0] * settings.dino_embedding_dim
                siglip_vector = [0.0] * settings.siglip_embedding_dim

        # Map risk level to edibility label
        edibility_label = "dangerous_or_unknown"
        if g["risk_level"] == "low":
            edibility_label = "unknown" # strict safety: keep unknown or dangerous

        species_catalog.append({
            "taxon": g["taxon"],
            "rank": "species",
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
        })

        if (i + 1) % 100 == 0 or (i + 1) == len(taxa):
            print(f"Processed {i + 1}/{len(taxa)} species...")

    print(f"Prototypes computed in {time.time() - start_time:.2f}s for {total_images_processed} images.")

    # 2. Calibrate Rejection Threshold
    print("Calibrating rejection threshold on validation dataset...")
    correct_scores = []

    # We build a lookup for species catalog entries to evaluate
    taxon_lookup = {item["taxon"]: item for item in species_catalog}

    metadata_encoder = MetadataEncoder()
    fusion_service = MultimodalFusionService()

    for idx, obs in enumerate(observations):
        taxon = obs.get("expected_taxon")
        if not taxon or taxon not in taxon_lookup:
            continue

        # Determine image files
        image_paths = []
        for img_rel in obs.get("images", []):
            img_path = root_dir / img_rel
            if not img_path.exists():
                img_path = images_root / img_rel
            if img_path.exists() and img_path.is_file():
                image_paths.append(str(img_path))

        if not image_paths:
            continue

        try:
            # Recreate observation classification logic
            detections = registry.detector.detect_and_crop(image_paths)
            detected_views = [det.estimated_view_type for det in detections]
            crop_paths = [det.crop_path for det in detections]

            dino_embs = registry.visual_embedder.embed_images(crop_paths)
            siglip_embs = registry.image_text_embedder.embed_images(crop_paths)

            meta_data = MushroomObservationMetadata(
                country=obs.get("metadata", {}).get("country"),
                region=obs.get("metadata", {}).get("region"),
                habitat=obs.get("metadata", {}).get("habitat"),
                substrate=obs.get("metadata", {}).get("substrate"),
            )
            meta_vector = metadata_encoder.encode(meta_data)

            representation = fusion_service.fuse(
                dino_embeddings=dino_embs,
                siglip_image_embeddings=siglip_embs,
                metadata_vector=meta_vector,
                detected_views=detected_views,
            )

            # Evaluate correct taxon's score
            sp = taxon_lookup[taxon]
            dino_score = cosine_similarity(representation.visual_component, sp["dino_reference_embedding"])
            siglip_score = cosine_similarity(representation.text_component, sp["siglip_text_embedding"])

            meta_score = metadata_score(sp, representation.metadata_vector.values)
            evidence_score = max(0.05, 1.0 - representation.evidence_penalty)

            visual_score = dino_score * 0.5 + siglip_score * 0.5
            fusion_score = visual_score * 0.55 + meta_score * 0.25 + evidence_score * 0.20
            correct_scores.append(fusion_score)
        except Exception:
            # Skip errors
            pass

    # Determine 5th percentile of correct class scores
    if correct_scores:
        correct_scores.sort()
        idx_5pct = int(len(correct_scores) * 0.05)
        raw_threshold = correct_scores[idx_5pct]
        # Keep threshold in a solid range [0.25, 0.50]
        calibrated_threshold = max(0.25, min(0.50, round(raw_threshold, 4)))
        print(f"5th percentile correct score: {raw_threshold:.4f} -> Calibrated Rejection Threshold: {calibrated_threshold:.4f}")
    else:
        calibrated_threshold = 0.35
        print(f"No validation scores could be computed. Using default Calibrated Rejection Threshold: {calibrated_threshold:.4f}")

    # Set calibrated threshold in the first species entry for easy retrieval
    if species_catalog:
        species_catalog[0]["open_set_min_confidence_calibrated"] = calibrated_threshold

    # Write output JSON
    output_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Writing {len(species_catalog)} species to {output_path}...")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(species_catalog, f, indent=2, ensure_ascii=False)

    print("Precomputation successfully completed!")


if __name__ == "__main__":
    main()

import json
from pathlib import Path

from .common import (
    apply_sampling,
    detect_column_heuristics,
    find_metadata_file,
    infer_risk_level,
    read_rows_from_file,
    resolve_image_path,
)


def convert_fungitastic(dataset_root, output_json, poisonous_catalog_path=None, sampling_options=None):
    """
    Converts FungiTastic dataset metadata to VisionSetil format.
    """
    root_path = Path(dataset_root)
    metadata_file = find_metadata_file(dataset_root, "fungitastic")
    if not metadata_file:
        raise FileNotFoundError(f"Could not find any metadata file for FungiTastic under {dataset_root}")

    print(f"FungiTastic Converter: Found metadata file at {metadata_file}")
    rows, columns = read_rows_from_file(metadata_file)
    if not rows:
        raise ValueError(f"No rows read from FungiTastic metadata file {metadata_file}")

    mapping = detect_column_heuristics(columns)
    print(f"FungiTastic Column Mapping Heuristics: {json.dumps(mapping, indent=2)}")

    obs_groups = {}
    for idx, row in enumerate(rows):
        obs_id_val = None
        if mapping["observation_id"]:
            obs_id_val = row.get(mapping["observation_id"])
        if not obs_id_val:
            obs_id_val = f"fungitastic_obs_{idx}"

        obs_groups.setdefault(str(obs_id_val), []).append(row)

    converted_list = []

    for obs_id, group in obs_groups.items():
        first_row = group[0]

        # Extract taxonomy
        taxon = None
        if mapping["species"]:
            taxon = first_row.get(mapping["species"])
        if not taxon:
            taxon = "unknown_fungus"

        genus = None
        if mapping["genus"]:
            genus = first_row.get(mapping["genus"])
        if not genus and taxon and taxon != "unknown_fungus":
            genus = taxon.split()[0]
        if not genus:
            genus = "unknown"

        family = None
        if mapping["family"]:
            family = first_row.get(mapping["family"])
        if not family:
            family = "unknown"

        # Infer risk level
        risk_level = infer_risk_level(taxon, genus, poisonous_catalog_path)

        # Map metadata
        metadata = {
            "country": first_row.get(mapping["country"]) if mapping["country"] else None,
            "region": None,
            "latitude": first_row.get("latitude") or first_row.get("lat") or None,
            "longitude": first_row.get("longitude") or first_row.get("lon") or None,
            "observed_at": first_row.get(mapping["date"]) if mapping["date"] else None,
            "habitat": first_row.get(mapping["habitat"]) if mapping["habitat"] else None,
            "substrate": first_row.get(mapping["substrate"]) if mapping["substrate"] else None,
            "nearby_trees": [],
            "altitude_m": first_row.get("altitude") or first_row.get("alt") or None,
            "smell": None,
            "color_change_on_cut": None,
            "user_notes": "Converted from FungiTastic."
        }

        # Clean metadata fields
        for k in ["latitude", "longitude", "altitude_m"]:
            if metadata[k] is not None:
                try:
                    metadata[k] = float(metadata[k])
                except ValueError:
                    metadata[k] = None

        converted_obs = {
            "observation_id": f"fungitastic_{obs_id}",
            "expected_taxon": taxon,
            "expected_genus": genus,
            "expected_family": family,
            "risk_level": risk_level,
            "images": [],
            "raw_images": [r.get(mapping["image_path"]) for r in group if mapping["image_path"] and r.get(mapping["image_path"])],
            "metadata": metadata,
            "source": {
                "type": "public_dataset",
                "dataset": "FungiTastic",
                "license": "see_original_dataset_terms",
                "original_observation_id": obs_id,
                "original_image_ids": [r.get(mapping["image_path"]) for r in group if mapping["image_path"]]
            },
            "expected_behavior": {
                "must_not_claim_safe": True,
                "should_detect_genus": True,
                "should_recommend_human_review": False,
                "should_flag_dangerous_lookalikes": False
            }
        }
        converted_list.append(converted_obs)

    # Apply sampling options BEFORE resolving images (saves massive time!)
    sampled_list = apply_sampling(converted_list, sampling_options)

    # Resolve image paths and filter observations to those with existing images
    final_sampled_list = []
    for obs in sampled_list:
        resolved_images = []
        for raw_img in obs.get("raw_images", []):
            resolved = resolve_image_path(root_path, raw_img)
            if resolved:
                resolved_images.append(resolved)

        if resolved_images:
            obs["images"] = resolved_images
            obs.pop("raw_images", None)
            final_sampled_list.append(obs)
        else:
            print(f"Warning: Skipping observation '{obs['observation_id']}' because none of its images could be found.")

    # Save to output file
    output_path = Path(output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final_sampled_list, f, indent=2, ensure_ascii=False)

    print(f"FungiTastic Converter: Converted and saved {len(final_sampled_list)} cases to {output_json}")
    return final_sampled_list

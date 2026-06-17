import json
from pathlib import Path
from .common import (
    find_metadata_file,
    read_rows_from_file,
    detect_column_heuristics,
    infer_risk_level,
    apply_sampling
)

def convert_fungiclef(dataset_root, output_json, poisonous_catalog_path=None, sampling_options=None):
    """
    Converts FungiCLEF 2025 metadata to VisionSetil format.
    """
    metadata_file = find_metadata_file(dataset_root, "fungiclef2025")
    if not metadata_file:
        metadata_file = find_metadata_file(dataset_root, "fungiclef")
        
    if not metadata_file:
        raise FileNotFoundError(f"Could not find any metadata file for FungiCLEF under {dataset_root}")

    print(f"FungiCLEF Converter: Found metadata file at {metadata_file}")
    rows, columns = read_rows_from_file(metadata_file)
    if not rows:
        raise ValueError(f"No rows read from FungiCLEF metadata file {metadata_file}")

    mapping = detect_column_heuristics(columns)
    
    # If heuristics missed, apply fallback column mappings for FungiCLEF
    if not mapping["observation_id"]:
        for c in columns:
            if "obs" in c.lower() or "id" in c.lower():
                mapping["observation_id"] = c
                break
    if not mapping["image_path"]:
        for c in columns:
            if "img" in c.lower() or "filename" in c.lower() or "path" in c.lower():
                mapping["image_path"] = c
                break

    print(f"FungiCLEF Column Mapping Heuristics: {json.dumps(mapping, indent=2)}")

    obs_groups = {}
    for idx, row in enumerate(rows):
        obs_id_val = None
        if mapping["observation_id"]:
            obs_id_val = row.get(mapping["observation_id"])
        if not obs_id_val:
            obs_id_val = f"fungiclef_obs_{idx}"
            
        obs_groups.setdefault(str(obs_id_val), []).append(row)

    converted_list = []
    root_path = Path(dataset_root)

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

        # Resolve image paths
        images = []
        for r in group:
            img_rel = ""
            if mapping["image_path"]:
                img_rel = r.get(mapping["image_path"]) or ""
            
            if img_rel:
                img_path = Path(img_rel)
                # Check absolute or relative to root
                candidates = [
                    root_path / img_path.name,
                    root_path / img_path,
                    img_path
                ]
                resolved = None
                for cand in candidates:
                    if cand.exists() and cand.is_file():
                        resolved = cand
                        break
                if resolved:
                    images.append(str(resolved.resolve()))

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
            "user_notes": "Converted from FungiCLEF 2025."
        }

        # Clean metadata fields
        for k in ["latitude", "longitude", "altitude_m"]:
            if metadata[k] is not None:
                try:
                    metadata[k] = float(metadata[k])
                except ValueError:
                    metadata[k] = None

        converted_obs = {
            "observation_id": f"fungiclef_{obs_id}",
            "expected_taxon": taxon,
            "expected_genus": genus,
            "expected_family": family,
            "risk_level": risk_level,
            "images": images,
            "metadata": metadata,
            "source": {
                "type": "public_dataset",
                "dataset": "FungiCLEF 2025",
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

    # Apply sampling options
    sampled_list = apply_sampling(converted_list, sampling_options)

    # Save to output file
    output_path = Path(output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(sampled_list, f, indent=2, ensure_ascii=False)

    print(f"FungiCLEF Converter: Converted and saved {len(sampled_list)} cases to {output_json}")
    return sampled_list

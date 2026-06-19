import json
from pathlib import Path
from .common import (
    build_image_path_index,
    find_metadata_file,
    read_rows_from_file,
    detect_column_heuristics,
    infer_risk_level,
    is_readable_image,
    apply_sampling,
    resolve_image_path,
    scan_individual_jsons
)

def convert_fungiclef(dataset_root, output_json, poisonous_catalog_path=None, sampling_options=None):
    """
    Converts FungiCLEF 2025 metadata to VisionSetil format.
    """
    root_path = Path(dataset_root)
    
    # 1. Search for train/val CSV metadata first, avoiding submission files
    metadata_file = None
    for name in ["FungiTastic-FewShot-Train.csv", "FungiTastic-FewShot-Val.csv", "FungiTastic-FewShot-Test.csv", "FewShot-Train", "FewShot-Val", "FewShot-Test"]:
        for p in root_path.rglob(f"*{name}*"):
            if p.is_file() and p.suffix in (".csv", ".json", ".parquet"):
                # Make sure it's not a sample submission
                if "submission" not in p.name.lower() and "sample" not in p.name.lower():
                    metadata_file = p
                    break
        if metadata_file:
            break
            
    if not metadata_file:
        metadata_file = find_metadata_file(dataset_root, "fungiclef2025")
    if not metadata_file:
        metadata_file = find_metadata_file(dataset_root, "fungiclef")

    rows = []
    columns = []
    
    if metadata_file:
        print(f"FungiCLEF Converter: Found metadata file at {metadata_file}")
        rows, columns = read_rows_from_file(metadata_file)
        
    # 2. Fallback to scanning individual JSONs if no file was found or no rows read
    if not rows:
        print("FungiCLEF Converter: No CSV metadata file or empty file. Scanning for individual JSON metadata files...")
        rows = scan_individual_jsons(dataset_root)
        if rows:
            columns = list(rows[0].keys())
            print(f"FungiCLEF Converter: Found {len(rows)} individual JSON metadata files.")

    if not rows:
        raise FileNotFoundError(f"Could not find any CSV metadata or individual JSON files under {dataset_root}")

    mapping = detect_column_heuristics(columns)
    
    # Heuristics updates for custom fields if not mapped
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

    # Group rows by observation
    obs_groups = {}
    for idx, row in enumerate(rows):
        obs_id_val = None
        if mapping["observation_id"]:
            obs_id_val = row.get(mapping["observation_id"])
        if not obs_id_val:
            obs_id_val = f"fungiclef_obs_{idx}"
            
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

        # Risk Level
        risk_level = infer_risk_level(taxon, genus, poisonous_catalog_path)

        # Metadata
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
            "images": [], # To resolve on sampled list
            "raw_images": [r.get(mapping["image_path"]) for r in group if mapping["image_path"] and r.get(mapping["image_path"])],
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

    # 3. Apply sampling options BEFORE resolving images (saves massive time!)
    sampled_list = apply_sampling(converted_list, sampling_options)

    # 4. Resolve image paths and filter observations to those with existing images.
    # Building this once avoids one recursive filesystem walk per image.
    image_path_index = build_image_path_index(root_path)
    print(f"FungiCLEF Converter: Indexed {len(image_path_index)} image path keys.")
    final_sampled_list = []
    unreadable_images = 0
    missing_image_observations = 0
    readability_cache = {}
    for obs in sampled_list:
        resolved_images = []
        for raw_img in obs.get("raw_images", []):
            resolved = resolve_image_path(root_path, raw_img, image_path_index)
            if resolved not in readability_cache:
                readability_cache[resolved] = bool(resolved) and is_readable_image(resolved)
            if resolved and readability_cache[resolved]:
                resolved_images.append(resolved)
            elif resolved:
                unreadable_images += 1
        
        # Keep observation only if at least one image exists!
        if resolved_images:
            obs["images"] = list(dict.fromkeys(resolved_images))
            # Clean temporary raw_images field
            obs.pop("raw_images", None)
            final_sampled_list.append(obs)
        else:
            missing_image_observations += 1
            if missing_image_observations <= 10:
                print(f"Warning: Skipping observation '{obs['observation_id']}' because none of its images could be found.")

    # Save to output file
    output_path = Path(output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final_sampled_list, f, indent=2, ensure_ascii=False)

    print(f"FungiCLEF Converter: Converted and saved {len(final_sampled_list)} cases to {output_json}")
    print(f"FungiCLEF Converter: Skipped {unreadable_images} unreadable image files.")
    print(f"FungiCLEF Converter: Skipped {missing_image_observations} observations without usable images.")
    return final_sampled_list

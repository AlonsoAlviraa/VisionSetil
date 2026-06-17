import csv
import json
import random
from pathlib import Path

HIGH_RISK_GENERA = ["amanita", "galerina", "cortinarius", "lepiota", "gyromitra", "inocybe", "clitocybe", "conocybe"]

def find_metadata_file(dataset_root, dataset_name):
    """
    Scans dataset_root recursively to find a CSV, Parquet or JSON metadata file.
    """
    root_path = Path(dataset_root)
    if not root_path.exists():
        return None

    # Priority list of patterns
    patterns = [
        f"*{dataset_name}*metadata*.csv",
        "*metadata*.csv",
        "*labels*.csv",
        "*annotations*.csv",
        "*.csv",
        "*.parquet",
        "*.json"
    ]
    
    for pat in patterns:
        for p in root_path.rglob(pat):
            if p.is_file() and p.suffix in (".csv", ".parquet", ".json", ".jsonl"):
                # Avoid submission or sample files
                if "submission" in p.name.lower() or "sample" in p.name.lower():
                    continue
                # Avoid temp files or our output folder
                if "visionsetil_outputs" not in p.parts:
                    return p
    return None

def resolve_image_path(root_path, img_rel):
    """
    Tries to locate the image under root_path.
    1. Direct relative check: root_path / img_rel
    2. Direct filename check: root_path / img_rel.name
    3. Common subdirectories (train, val, test, images)
    4. Recursive search for img_rel.name under root_path
    """
    if not img_rel:
        return None
        
    root_path = Path(root_path)
    img_path = Path(img_rel)
    
    # Candidate 1: direct relative check
    cand1 = root_path / img_path
    if cand1.exists() and cand1.is_file():
        return str(cand1.resolve())
        
    # Candidate 2: direct filename check in root
    cand2 = root_path / img_path.name
    if cand2.exists() and cand2.is_file():
        return str(cand2.resolve())
        
    # Candidate 3: common subdirectories
    common_subs = ["train", "val", "test", "images", "FewShot-Train", "FewShot-Val", "FewShot-Test", "FungiTastic-FewShot-Train", "FungiTastic-FewShot-Val", "FungiTastic-FewShot-Test"]
    for sub in common_subs:
        cand_sub = root_path / sub / img_path
        if cand_sub.exists() and cand_sub.is_file():
            return str(cand_sub.resolve())
        cand_sub_name = root_path / sub / img_path.name
        if cand_sub_name.exists() and cand_sub_name.is_file():
            return str(cand_sub_name.resolve())
            
    # Candidate 4: recursive search (glob)
    try:
        for p in root_path.rglob(img_path.name):
            if p.is_file():
                return str(p.resolve())
    except Exception:
        pass
        
    return None

def scan_individual_jsons(root_path):
    """
    Recursively scans for individual json metadata files under root_path.
    """
    rows = []
    root_path = Path(root_path)
    count = 0
    # Search for json files, avoiding typical package/config json files
    for p in root_path.rglob("*.json"):
        if "visionsetil_outputs" in p.parts or p.name in ("kernel-metadata.json", "package.json", "tsconfig.json", "dataset-metadata.json"):
            continue
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    data["_source_json_file"] = str(p)
                    rows.append(data)
                    count += 1
                    if count >= 10000:
                        break
        except Exception:
            pass
    return rows

def infer_risk_level(species_name, genus_name, poisonous_catalog_path=None):
    """
    Conservatively infers toxicity risk levels based on taxonomy and a local catalog.
    Never marks any species as safe.
    """
    poisonous_list = []
    if poisonous_catalog_path:
        p_path = Path(poisonous_catalog_path)
        if p_path.exists():
            try:
                with open(p_path, "r", encoding="utf-8") as f:
                    poisonous_list = json.load(f)
            except Exception:
                pass

    sp_clean = (species_name or "").strip().lower()
    gen_clean = (genus_name or "").strip().lower()
    
    if not gen_clean and sp_clean:
        gen_clean = sp_clean.split()[0]

    # Check poisonous catalog
    for p in poisonous_list:
        p_latin = p.get("latin_name", "").strip().lower()
        if p_latin == sp_clean:
            if p.get("risk_level") == "critical":
                return "deadly"
            else:
                return "high_or_unknown"

    # Check high risk genus list
    if gen_clean in HIGH_RISK_GENERA:
        return "high_or_unknown"

    return "unknown"

def detect_column_heuristics(columns):
    """
    Maps column name lists to expected fields like observation_id, species, etc.
    """
    cols_lower = [c.lower() for c in columns]
    mapping = {
        "observation_id": None,
        "image_path": None,
        "species": None,
        "genus": None,
        "family": None,
        "habitat": None,
        "substrate": None,
        "country": None,
        "date": None
    }
    
    # Heuristics for observation id
    obs_terms = ["observation_id", "observationid", "obs_id", "obsid", "observation", "id"]
    for term in obs_terms:
        if term in cols_lower:
            mapping["observation_id"] = columns[cols_lower.index(term)]
            break

    # Heuristics for image path
    img_terms = ["image_path", "imagepath", "image_id", "imageid", "filename", "path", "file", "imagename", "image_name"]
    for term in img_terms:
        if term in cols_lower:
            mapping["image_path"] = columns[cols_lower.index(term)]
            break

    # Heuristics for species
    sp_terms = ["species", "scientificname", "scientific_name", "taxon", "expected_taxon", "class_name", "label", "class"]
    for term in sp_terms:
        if term in cols_lower:
            mapping["species"] = columns[cols_lower.index(term)]
            break

    # Genus / Family
    if "genus" in cols_lower:
        mapping["genus"] = columns[cols_lower.index("genus")]
    if "family" in cols_lower:
        mapping["family"] = columns[cols_lower.index("family")]
        
    # Extra metadata
    if "habitat" in cols_lower:
        mapping["habitat"] = columns[cols_lower.index("habitat")]
    if "substrate" in cols_lower:
        mapping["substrate"] = columns[cols_lower.index("substrate")]
    for term in ["country", "region", "locality"]:
        if term in cols_lower:
            mapping["country"] = columns[cols_lower.index(term)]
            break
    for term in ["date", "observed_on", "observed_at", "year"]:
        if term in cols_lower:
            mapping["date"] = columns[cols_lower.index(term)]
            break

    return mapping

def read_rows_from_file(file_path):
    """
    Reads rows as dicts from CSV or JSON. Support for parquet if pandas available.
    """
    p = Path(file_path)
    if p.suffix == ".csv":
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            return list(reader), reader.fieldnames
    elif p.suffix == ".json":
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                if data:
                    return data, list(data[0].keys())
                return [], []
            elif isinstance(data, dict):
                # Check standard dictionary structures
                if "rows" in data and isinstance(data["rows"], list):
                    return data["rows"], list(data["rows"][0].keys())
                return [data], list(data.keys())
    elif p.suffix == ".parquet":
        try:
            import pandas as pd
            df = pd.read_parquet(p)
            return df.to_dict(orient="records"), list(df.columns)
        except ImportError:
            pass
    return [], []

def apply_sampling(observations, sampling_options):
    """
    Applies filtering and sampling rules: max_cases, risk_balanced, genus_balanced, etc.
    """
    if not sampling_options:
        return observations

    max_cases = sampling_options.get("max_cases")
    shuffle = sampling_options.get("shuffle", False)
    seed = sampling_options.get("seed", 42)
    risk_balanced = sampling_options.get("risk_balanced", False)
    genus_balanced = sampling_options.get("genus_balanced", False)
    include_dangerous = sampling_options.get("include_dangerous_genera", False)

    # Filter dangerous genera if required
    if include_dangerous:
        dangerous_list = []
        other_list = []
        for obs in observations:
            gen = (obs.get("expected_genus") or "").lower()
            if gen in HIGH_RISK_GENERA:
                dangerous_list.append(obs)
            else:
                other_list.append(obs)
        
        # Prioritize dangerous cases, but shuffle them if shuffle is on
        if shuffle:
            random.Random(seed).shuffle(dangerous_list)
            random.Random(seed).shuffle(other_list)
            
        observations = dangerous_list + other_list

    # Risk Balanced sampling
    if risk_balanced:
        deadly_cases = [o for o in observations if o.get("risk_level") == "deadly"]
        high_cases = [o for o in observations if o.get("risk_level") == "high_or_unknown"]
        other_cases = [o for o in observations if o.get("risk_level") == "unknown"]
        
        if shuffle:
            r = random.Random(seed)
            r.shuffle(deadly_cases)
            r.shuffle(high_cases)
            r.shuffle(other_cases)
            
        # Select equal shares if possible
        num_deadly = len(deadly_cases)
        num_high = len(high_cases)
        num_other = len(other_cases)
        
        target_per_cat = max_cases // 3 if max_cases else min(num_deadly, num_high, num_other)
        if target_per_cat == 0:
            target_per_cat = 50 # Default baseline
            
        balanced = deadly_cases[:target_per_cat] + high_cases[:target_per_cat] + other_cases[:target_per_cat]
        # Fill remaining spots if max_cases not reached
        if max_cases and len(balanced) < max_cases:
            remaining = deadly_cases[target_per_cat:] + high_cases[target_per_cat:] + other_cases[target_per_cat:]
            if shuffle:
                random.Random(seed).shuffle(remaining)
            balanced += remaining[:max_cases - len(balanced)]
        observations = balanced

    # Genus Balanced sampling
    elif genus_balanced:
        genus_buckets = {}
        for o in observations:
            gen = (o.get("expected_genus") or "unknown").lower()
            genus_buckets.setdefault(gen, []).append(o)
            
        if shuffle:
            r = random.Random(seed)
            for gen in genus_buckets:
                r.shuffle(genus_buckets[gen])
                
        # Interleave buckets
        balanced = []
        bucket_keys = list(genus_buckets.keys())
        r = random.Random(seed)
        if shuffle:
            r.shuffle(bucket_keys)
            
        idx = 0
        while len(balanced) < len(observations):
            added_any = False
            for gen in bucket_keys:
                if idx < len(genus_buckets[gen]):
                    balanced.append(genus_buckets[gen][idx])
                    added_any = True
            if not added_any:
                break
            idx += 1
            
        observations = balanced

    # Standard shuffle
    elif shuffle:
        random.Random(seed).shuffle(observations)

    # Slice to max cases
    if max_cases and max_cases > 0:
        observations = observations[:max_cases]

    return observations

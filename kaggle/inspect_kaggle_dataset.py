import argparse
import json
import sys
from pathlib import Path

from converters.common import detect_column_heuristics, read_rows_from_file


def main():
    parser = argparse.ArgumentParser(description="Inspect a Kaggle dataset's files and metadata schema.")
    parser.add_argument("--dataset-root", required=True, help="Path to the dataset directory.")
    args = parser.parse_args()

    root_path = Path(args.dataset_root)
    if not root_path.exists():
        print(f"Error: Dataset root {root_path} does not exist.", file=sys.stderr)
        sys.exit(1)

    print("==================================================")
    print(f"        DATASET INSPECTOR: {root_path.name}       ")
    print("==================================================")

    # 1. Scan files
    extensions = {}
    total_files = 0
    metadata_candidates = []

    for p in root_path.rglob("*"):
        if p.is_file():
            total_files += 1
            ext = p.suffix.lower()
            extensions[ext] = extensions.get(ext, 0) + 1
            if ext in (".csv", ".parquet", ".json", ".jsonl"):
                if "visionsetil_outputs" not in p.parts:
                    metadata_candidates.append(p)

    print(f"Total files: {total_files}")
    print("Files by extension:")
    for ext, count in sorted(extensions.items()):
        print(f"  - {ext or '(no ext)'}: {count}")

    print("--------------------------------------------------")
    print("Detected Metadata Candidates:")
    for cand in metadata_candidates[:10]:
        size_kb = cand.stat().st_size / 1024
        print(f"  - {cand.name} ({size_kb:.2f} KB)")

    if not metadata_candidates:
        print("  - None found. This dataset may contain only raw images or custom directories.")
        sys.exit(0)

    # 2. Inspect first candidate
    primary_metadata = metadata_candidates[0]
    print("--------------------------------------------------")
    print(f"Primary Metadata Inspection: {primary_metadata.name}")
    try:
        rows, columns = read_rows_from_file(primary_metadata)
        if not rows:
            print("  - Metadata file is empty.")
            sys.exit(0)

        print(f"Total rows in metadata: {len(rows)}")
        print(f"Columns available: {', '.join(columns)}")

        # Heuristics
        mapping = detect_column_heuristics(columns)
        print("\nCandidate Column Heuristics:")
        for key, val in mapping.items():
            print(f"  - {key}: {val or '(could not infer)'}")

        # Example rows
        print("\nPreview of first 3 rows:")
        for i, row in enumerate(rows[:3]):
            print(f"Row {i+1}:")
            print(json.dumps(row, indent=2))

    except Exception as e:
        print(f"Error reading metadata file: {e}", file=sys.stderr)

    print("==================================================")

if __name__ == "__main__":
    main()

import argparse
import json
import shutil
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Convert a local dataset to Kaggle format.")
    parser.add_argument("--labels", required=True, help="Path to input local labels JSON.")
    parser.add_argument("--images-root", required=True, help="Path to local images directory.")
    parser.add_argument("--output-dir", required=True, help="Path to write the exported dataset.")
    args = parser.parse_args()

    labels_path = Path(args.labels)
    if not labels_path.exists():
        print(f"Error: Labels file not found at {labels_path}", file=sys.stderr)
        sys.exit(1)

    images_root_path = Path(args.images_root)
    if not images_root_path.exists():
        print(f"Error: Images root not found at {images_root_path}", file=sys.stderr)
        sys.exit(1)

    output_dir_path = Path(args.output_dir)
    output_images_dir = output_dir_path / "images"
    output_images_dir.mkdir(parents=True, exist_ok=True)

    with open(labels_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("Error: Expected a list of observations in labels JSON.", file=sys.stderr)
        sys.exit(1)

    exported_cases = []
    skipped_images_count = 0
    copied_images_count = 0

    for idx, case in enumerate(data):
        expected_images = case.get("images", [])
        new_images = []
        
        for img_path_str in expected_images:
            # Try to resolve path
            img_path = Path(img_path_str)
            # Try 1: check if file is direct under images_root
            candidate1 = images_root_path / img_path.name
            # Try 2: check if path is relative to images_root
            candidate2 = images_root_path / img_path
            # Try 3: check if img_path is absolute and exists
            candidate3 = img_path
            
            resolved_img = None
            for cand in [candidate1, candidate2, candidate3]:
                if cand.exists() and cand.is_file():
                    resolved_img = cand
                    break

            if resolved_img:
                dest_filename = resolved_img.name
                dest_path = output_images_dir / dest_filename
                try:
                    shutil.copy2(resolved_img, dest_path)
                    new_images.append(f"images/{dest_filename}")
                    copied_images_count += 1
                except Exception as e:
                    print(f"Warning: Failed to copy {resolved_img} to {dest_path}: {e}", file=sys.stderr)
            else:
                print(f"Warning: Image {img_path_str} could not be resolved under {images_root_path}", file=sys.stderr)
                skipped_images_count += 1

        case_copy = dict(case)
        case_copy["images"] = new_images
        exported_cases.append(case_copy)

    # Write the new JSON file
    export_json_path = output_dir_path / "real_observations.json"
    with open(export_json_path, "w", encoding="utf-8") as f:
        json.dump(exported_cases, f, indent=2, ensure_ascii=False)

    # Write a quick README
    readme_path = output_dir_path / "README.md"
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(f"""# VisionSetil Kaggle Dataset Export

This dataset was exported using `prepare_kaggle_dataset.py` and is formatted for use as a Kaggle Dataset.

## Structure
- `real_observations.json`: Contains expert-labeled labels with compatible relative image paths.
- `images/`: Folder containing all referenced image files.

## Kaggle Upload Steps
1. Go to [Kaggle](https://www.kaggle.com/) and click on "Datasets" -> "New Dataset".
2. Set the dataset title to `visionsetil-real-data` (or similar).
3. Drag and drop the contents of this folder (`real_observations.json` and the `images/` directory).
4. Click "Create".
5. Link this dataset to your Kaggle Notebook to execute the batch benchmark.
""")

    print(f"Dataset export completed successfully!")
    print(f"  - Labels written to: {export_json_path}")
    print(f"  - Images copied to: {output_images_dir} ({copied_images_count} files)")
    if skipped_images_count > 0:
        print(f"  - Images not found/skipped: {skipped_images_count}")

if __name__ == "__main__":
    main()

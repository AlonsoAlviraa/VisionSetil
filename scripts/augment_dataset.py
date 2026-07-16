#!/usr/bin/env python3
"""Data augmentation pipeline for mushroom training images.

Generates augmented variants of each image to increase dataset diversity
and model robustness. Designed to be used before build_species_index.py
or model fine-tuning.

Augmentations applied:
    - Horizontal/vertical flip
    - Random rotation (±30°)
    - Color jitter (brightness, contrast, saturation, hue)
    - Random resized crop
    - Gaussian blur
    - JPEG compression artifacts

Usage:
    python scripts/augment_dataset.py \
        --input-dir data/raw/df20 \
        --output-dir data/augmented/df20 \
        --augmentations-per-image 3 \
        --target-size 518
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Augment mushroom image dataset")
    parser.add_argument("--input-dir", type=Path, required=True, help="Source dataset directory")
    parser.add_argument("--output-dir", type=Path, required=True, help="Output directory")
    parser.add_argument(
        "--augmentations-per-image",
        type=int,
        default=3,
        help="Number of augmented copies per original image",
    )
    parser.add_argument(
        "--target-size", type=int, default=518, help="Target image size (square)"
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=85,
        help="JPEG quality for saved images (50-100)",
    )
    parser.add_argument("--verbose", action="store_true", help="Print progress")
    return parser.parse_args()


def apply_augmentation(img, target_size: int, aug_type: str):
    """Apply a specific augmentation to a PIL Image."""
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps

    if aug_type == "original":
        return img.resize((target_size, target_size), Image.LANCZOS)

    if aug_type == "hflip":
        img = ImageOps.mirror(img)

    elif aug_type == "vflip":
        img = ImageOps.flip(img)

    elif aug_type == "rotate":
        angle = random.uniform(-30, 30)
        img = img.rotate(angle, expand=False, fillcolor=(128, 128, 128))

    elif aug_type == "brightness":
        factor = random.uniform(0.7, 1.3)
        img = ImageEnhance.Brightness(img).enhance(factor)

    elif aug_type == "contrast":
        factor = random.uniform(0.7, 1.3)
        img = ImageEnhance.Contrast(img).enhance(factor)

    elif aug_type == "saturation":
        factor = random.uniform(0.7, 1.3)
        img = ImageEnhance.Color(img).enhance(factor)

    elif aug_type == "blur":
        radius = random.uniform(0.5, 2.0)
        img = img.filter(ImageFilter.GaussianBlur(radius=radius))

    elif aug_type == "crop":
        w, h = img.size
        scale = random.uniform(0.7, 0.95)
        new_w, new_h = int(w * scale), int(h * scale)
        x1 = random.randint(0, w - new_w)
        y1 = random.randint(0, h - new_h)
        img = img.crop((x1, y1, x1 + new_w, y1 + new_h))

    elif aug_type == "combo":
        # Combine 2-3 random augmentations
        ops = random.sample(
            ["hflip", "rotate", "brightness", "contrast", "saturation", "blur"],
            k=random.randint(2, 3),
        )
        for op in ops:
            img = apply_augmentation(img, img.size[0], op)

    return img.resize((target_size, target_size), Image.LANCZOS)


AUGMENTATION_TYPES = [
    "hflip",
    "vflip",
    "rotate",
    "brightness",
    "contrast",
    "saturation",
    "blur",
    "crop",
    "combo",
]


def process_dataset(args: argparse.Namespace) -> None:
    """Process entire dataset with augmentations."""
    from PIL import Image

    random.seed(args.seed)

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    if not args.input_dir.exists():
        print(f"ERROR: Input directory not found: {args.input_dir}")
        sys.exit(1)

    args.output_dir.mkdir(parents=True, exist_ok=True)

    species_dirs = [d for d in sorted(args.input_dir.iterdir()) if d.is_dir()]
    total_species = len(species_dirs)
    total_generated = 0
    start_time = time.time()

    for idx, species_dir in enumerate(species_dirs, 1):
        species_name = species_dir.name
        out_species_dir = args.output_dir / species_name
        out_species_dir.mkdir(parents=True, exist_ok=True)

        images = [
            f for f in sorted(species_dir.iterdir()) if f.suffix.lower() in valid_extensions
        ]

        for img_path in images:
            try:
                original = Image.open(img_path).convert("RGB")
            except Exception as e:
                if args.verbose:
                    print(f"  SKIP {img_path.name}: {e}")
                continue

            # Copy original (resized)
            out_name = f"{img_path.stem}_original{img_path.suffix or '.jpg'}"
            out_path = out_species_dir / out_name
            resized = original.resize(
                (args.target_size, args.target_size), Image.LANCZOS
            )
            resized.save(out_path, quality=args.jpeg_quality)
            total_generated += 1

            # Generate augmentations
            for aug_idx in range(args.augmentations_per_image):
                aug_type = random.choice(AUGMENTATION_TYPES)
                try:
                    augmented = apply_augmentation(original, args.target_size, aug_type)
                    aug_name = f"{img_path.stem}_{aug_type}_{aug_idx}.jpg"
                    aug_path = out_species_dir / aug_name
                    augmented.save(aug_path, quality=args.jpeg_quality)
                    total_generated += 1
                except Exception as e:
                    if args.verbose:
                        print(f"  AUG FAIL {img_path.name} ({aug_type}): {e}")

        if args.verbose or idx % 100 == 0:
            elapsed = time.time() - start_time
            rate = idx / elapsed if elapsed > 0 else 0
            print(
                f"  [{idx}/{total_species}] {species_name}: "
                f"{len(images)} originals → {total_generated} total images "
                f"[{rate:.1f} species/s]"
            )

    elapsed = time.time() - start_time
    print(f"\n✅ Augmentation complete: {total_generated} images in {elapsed:.1f}s")
    print(f"   Output: {args.output_dir}")


def main() -> None:
    args = parse_args()

    print("=" * 60)
    print("VisionSetil — Data Augmentation Pipeline")
    print("=" * 60)
    print(f"  Input:     {args.input_dir}")
    print(f"  Output:    {args.output_dir}")
    print(f"  Augs/img:  {args.augmentations_per_image}")
    print(f"  Size:      {args.target_size}x{args.target_size}")
    print(f"  Seed:      {args.seed}")
    print()

    process_dataset(args)


if __name__ == "__main__":
    main()

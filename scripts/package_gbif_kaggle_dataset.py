#!/usr/bin/env python3
"""
Package local GBIF ES allowlist-40 media for a Kaggle dataset mount.

Lean layout under staging (default: data/kaggle_staging/visionsetil-gbif-es-allowlist40/):
  images/<Species_safe>/*.jpg
  obs_gbif_es.jsonl          # paths relative to dataset root
  dataset-metadata.json
  README.md

Does NOT re-download images. On Windows prefers directory junction / hardlinks
to avoid duplicating ~6.6 GB; falls back to copy if link fails.

Usage:
  python scripts/package_gbif_kaggle_dataset.py              # stage only
  python scripts/package_gbif_kaggle_dataset.py --create     # first push
  python scripts/package_gbif_kaggle_dataset.py --version -m "msg"
  python scripts/package_gbif_kaggle_dataset.py --link-mode junction
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_IMAGES = REPO / "data" / "industrial_v1" / "gbif" / "images"
DEFAULT_JSONL = REPO / "data" / "industrial_v1" / "obs_gbif_es.jsonl"
DEFAULT_STAGING = REPO / "data" / "kaggle_staging" / "visionsetil-gbif-es-allowlist40"
DATASET_SLUG = "alonsoalviraaaa/visionsetil-gbif-es-allowlist40"
DATASET_TITLE = "VisionSetil GBIF ES allowlist40 StillImage"


def _species_safe(name: str) -> str:
    return str(name).strip().replace(" ", "_").replace("/", "_")


def _rel_image_path(local_path: str, images_src: Path) -> str | None:
    """Map a local repo path to images/<Species_safe>/file.jpg relative to dataset root."""
    s = str(local_path).replace("\\", "/")
    # Common prefixes from download_gbif_media
    markers = (
        "data/industrial_v1/gbif/images/",
        "industrial_v1/gbif/images/",
        "gbif/images/",
    )
    for m in markers:
        if m in s:
            tail = s.split(m, 1)[1]
            return f"images/{tail}"
    p = Path(local_path)
    try:
        rel = p.resolve().relative_to(images_src.resolve())
        return f"images/{rel.as_posix()}"
    except Exception:
        pass
    # Bare: Species/file or Species_safe/file
    parts = Path(s).parts
    if len(parts) >= 2:
        return f"images/{parts[-2]}/{parts[-1]}"
    return None


def write_manifest(src_jsonl: Path, staging: Path, images_src: Path) -> dict:
    """Rewrite JSONL with relative image paths under dataset root."""
    out_path = staging / "obs_gbif_es.jsonl"
    n_in = n_out = n_paths = 0
    species_counts: dict[str, int] = {}
    with src_jsonl.open(encoding="utf-8") as fin, out_path.open("w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            n_in += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            raw_paths = row.get("image_paths") or []
            if isinstance(raw_paths, str):
                raw_paths = [raw_paths]
            rel_paths = []
            for rp in raw_paths:
                rel = _rel_image_path(str(rp), images_src)
                if rel:
                    rel_paths.append(rel)
                    n_paths += 1
            if not rel_paths:
                continue
            sp = str(row.get("species") or "").strip()
            species_counts[sp] = species_counts.get(sp, 0) + len(rel_paths)
            out = {
                "observation_id": row.get("observation_id"),
                "species": sp,
                "image_paths": rel_paths,
                "source": row.get("source") or "gbif_es",
                "license": row.get("license"),
                "license_class": row.get("license_class") or "unknown",
                "notes": row.get("notes") or "orientation_only_never_consume",
            }
            if row.get("media_url"):
                out["media_url"] = row["media_url"]
            fout.write(json.dumps(out, ensure_ascii=False) + "\n")
            n_out += 1
    return {
        "jsonl_rows_in": n_in,
        "jsonl_rows_out": n_out,
        "image_path_refs": n_paths,
        "species_with_rows": len(species_counts),
        "per_species_path_refs": dict(sorted(species_counts.items())),
    }


def _junction_images(src: Path, dst: Path) -> bool:
    """Windows directory junction (or symlink) so staging does not copy 6.6GB."""
    if dst.exists() or dst.is_symlink():
        if dst.is_dir() and not dst.is_symlink():
            # real dir — leave for hardlink/copy path
            return False
        try:
            if dst.is_symlink() or dst.is_junction():  # type: ignore[attr-defined]
                dst.unlink()
        except Exception:
            try:
                shutil.rmtree(dst)
            except Exception:
                return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        # mklink /J does not require admin
        r = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(dst), str(src.resolve())],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if r.returncode == 0 and dst.exists():
            print(f"  junction: {dst} -> {src}")
            return True
        print(f"  junction failed: {r.stderr or r.stdout}", file=sys.stderr)
        return False
    try:
        os.symlink(src.resolve(), dst, target_is_directory=True)
        print(f"  symlink: {dst} -> {src}")
        return True
    except OSError as e:
        print(f"  symlink failed: {e}", file=sys.stderr)
        return False


def _hardlink_or_copy_tree(src: Path, dst: Path, prefer_hardlink: bool = True) -> dict:
    """Mirror image tree with hardlinks (same volume) or file copy."""
    n_link = n_copy = n_skip = 0
    for root, _dirs, files in os.walk(src):
        rel = Path(root).relative_to(src)
        out_dir = dst / rel
        out_dir.mkdir(parents=True, exist_ok=True)
        for name in files:
            if Path(name).suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}:
                n_skip += 1
                continue
            sfile = Path(root) / name
            dfile = out_dir / name
            if dfile.exists() and dfile.stat().st_size == sfile.stat().st_size:
                n_skip += 1
                continue
            if dfile.exists():
                dfile.unlink()
            linked = False
            if prefer_hardlink:
                try:
                    os.link(sfile, dfile)
                    n_link += 1
                    linked = True
                except OSError:
                    linked = False
            if not linked:
                shutil.copy2(sfile, dfile)
                n_copy += 1
    return {"hardlinks": n_link, "copies": n_copy, "skipped": n_skip}


def link_or_copy_images(images_src: Path, staging: Path, link_mode: str) -> dict:
    dst = staging / "images"
    if link_mode == "junction":
        if _junction_images(images_src, dst):
            # count files through junction
            n = sum(1 for _ in dst.rglob("*") if _.is_file())
            return {"mode": "junction", "files": n}
        print("  falling back to hardlink/copy")
        link_mode = "hardlink"
    if dst.exists() and not dst.is_symlink():
        # partial previous run — continue hardlink/copy into it
        pass
    elif dst.exists():
        try:
            dst.unlink()
        except Exception:
            shutil.rmtree(dst, ignore_errors=True)
    stats = _hardlink_or_copy_tree(images_src, dst, prefer_hardlink=(link_mode != "copy"))
    stats["mode"] = link_mode if link_mode != "junction" else "hardlink"
    return stats


def write_metadata(staging: Path) -> None:
    meta = {
        "title": DATASET_TITLE,
        "id": DATASET_SLUG,
        "licenses": [{"name": "other"}],
        "keywords": ["fungi", "mushrooms", "gbif", "spain", "visionsetil", "allowlist40"],
        "collaborators": [],
        "data": [],
    }
    (staging / "dataset-metadata.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    readme = f"""# {DATASET_TITLE}

Industrial allowlist (40 spp) StillImage media from GBIF Spain occurrence download.

## Layout
- `images/<Genus_species>/*.jpg` — media files
- `obs_gbif_es.jsonl` — one row per image with `observation_id`, `species`,
  `image_paths` (relative to dataset root), `license_class` (`cc_ok` | `nc` | …)

## License note
Individual images retain their original licenses (many CC-BY-NC). Intended for
**research / educational orientation training only** — never consumption advice.
Prefer `license_class=cc_ok` when redistributing commercially.

## Anti-leak
Split / cap by `observation_id` (prefix `gbif_*`), not by filename.

## Product language
Orientation only. Never consumption permission.

Slug: `{DATASET_SLUG}`
"""
    (staging / "README.md").write_text(readme, encoding="utf-8")


def package(
    images_src: Path,
    jsonl_src: Path,
    staging: Path,
    link_mode: str,
    clean: bool,
) -> dict:
    if not images_src.is_dir():
        raise SystemExit(f"images not found: {images_src}")
    if not jsonl_src.is_file():
        raise SystemExit(f"manifest not found: {jsonl_src}")

    if clean and staging.exists():
        print(f"Cleaning staging {staging} ...")
        # If junction, remove link without deleting source images
        img = staging / "images"
        if img.exists():
            try:
                if img.is_symlink() or getattr(img, "is_junction", lambda: False)():
                    img.unlink()
                elif os.name == "nt":
                    # junction: rmdir removes link only
                    subprocess.run(["cmd", "/c", "rmdir", str(img)], check=False)
            except Exception:
                pass
        shutil.rmtree(staging, ignore_errors=True)

    staging.mkdir(parents=True, exist_ok=True)
    write_metadata(staging)
    print("Writing rewritten manifest ...")
    man = write_manifest(jsonl_src, staging, images_src)
    print(f"  rows {man['jsonl_rows_in']} → {man['jsonl_rows_out']}, path refs={man['image_path_refs']}")
    print(f"Linking images ({link_mode}) from {images_src} ...")
    img_stats = link_or_copy_images(images_src, staging, link_mode)
    print(f"  image link stats: {img_stats}")
    summary = {
        "dataset_slug": DATASET_SLUG,
        "staging": str(staging),
        "manifest": man,
        "images": img_stats,
    }
    (staging / "package_summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    return summary


def kaggle_push(staging: Path, create: bool, version: bool, message: str) -> int:
    meta = staging / "dataset-metadata.json"
    if not meta.is_file():
        raise SystemExit("missing dataset-metadata.json — run package first")
    if create:
        cmd = ["kaggle", "datasets", "create", "-p", str(staging), "--dir-mode", "zip"]
    elif version:
        cmd = [
            "kaggle",
            "datasets",
            "version",
            "-p",
            str(staging),
            "-m",
            message or "update gbif es allowlist40",
            "--dir-mode",
            "zip",
        ]
    else:
        raise SystemExit("pass --create or --version")
    print(" $", " ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    print(out[-5000:] if len(out) > 5000 else out)
    if r.returncode != 0:
        # create fails if exists → try version
        if create and ("already exists" in out.lower() or "409" in out or "exists" in out.lower()):
            print("Dataset exists — retrying as version ...")
            return kaggle_push(staging, create=False, version=True, message=message or "GBIF ES allowlist40 media")
        return r.returncode
    print(f"Dataset: https://www.kaggle.com/datasets/{DATASET_SLUG}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--images", type=Path, default=DEFAULT_IMAGES)
    ap.add_argument("--jsonl", type=Path, default=DEFAULT_JSONL)
    ap.add_argument("--staging", type=Path, default=DEFAULT_STAGING)
    ap.add_argument(
        "--link-mode",
        choices=("junction", "hardlink", "copy"),
        default="junction",
        help="How to place images into staging (default: junction on Windows)",
    )
    ap.add_argument("--clean", action="store_true", help="Wipe staging before package")
    ap.add_argument("--create", action="store_true", help="kaggle datasets create")
    ap.add_argument("--version", action="store_true", help="kaggle datasets version")
    ap.add_argument("-m", "--message", default="GBIF ES allowlist40 StillImage pack")
    ap.add_argument("--push-only", action="store_true", help="Skip package; only push staging")
    args = ap.parse_args()

    if not args.push_only:
        summary = package(args.images, args.jsonl, args.staging, args.link_mode, args.clean)
        print(json.dumps({k: summary[k] for k in ("dataset_slug", "staging", "images")}, indent=2))
    else:
        if not args.staging.is_dir():
            raise SystemExit(f"staging missing: {args.staging}")

    if args.create or args.version:
        return kaggle_push(args.staging, args.create, args.version, args.message)
    print("Staging ready. Push with --create or --version")
    print(f"  python scripts/package_gbif_kaggle_dataset.py --push-only --create")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

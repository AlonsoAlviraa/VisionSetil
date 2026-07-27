#!/usr/bin/env python3
"""Build E20 source-holdout notebook and push GPU kernel to Kaggle (T4x2 when available)."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
K = REPO / "kaggle"
SLUG = "alonsoalviraaaa/visionsetil-exp-v20-source-holdout"
OUT_LOCAL = K / "kernel_output_v20"
GBIF_DATASET = "alonsoalviraaaa/visionsetil-gbif-es-allowlist40"
FT_DATASET = "picekl/fungitastic"


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    print(" $", " ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO))
    if r.stdout:
        print(r.stdout[-4000:] if len(r.stdout) > 4000 else r.stdout)
    if r.stderr:
        print(r.stderr[-2000:] if len(r.stderr) > 2000 else r.stderr, file=sys.stderr)
    if check and r.returncode != 0:
        raise SystemExit(r.returncode)
    return r


def build() -> Path:
    run([sys.executable, str(K / "build_exp_v20_source_holdout.py")])
    nb = K / "visionsetil_exp_v20_source_holdout.ipynb"
    if not nb.is_file():
        raise SystemExit(f"missing {nb}")
    return nb


def gbif_dataset_ready() -> bool:
    """True when Kaggle accepts ListDatasetFiles for the GBIF pack."""
    r = run(["kaggle", "datasets", "files", GBIF_DATASET], check=False)
    text = (r.stdout or "") + (r.stderr or "")
    if r.returncode != 0:
        return False
    if "403" in text or "404" in text or "Forbidden" in text:
        return False
    return "images/" in text or "obs_gbif" in text or "name" in text.lower()


def wait_gbif_ready(max_wait_s: int = 900, interval_s: int = 30) -> bool:
    print(f"Waiting for dataset ready: {GBIF_DATASET}")
    elapsed = 0
    while elapsed <= max_wait_s:
        if gbif_dataset_ready():
            print(f"  dataset ready after ~{elapsed}s")
            return True
        print(f"  not ready ({elapsed}s)...")
        import time

        time.sleep(interval_s)
        elapsed += interval_s
    return False


def push(nb: Path, wait_dataset: bool = True) -> None:
    if wait_dataset and not gbif_dataset_ready():
        ok = wait_gbif_ready()
        if not ok:
            print(
                f"WARNING: {GBIF_DATASET} not listable yet — push may drop the source. "
                "Re-run --push-only after dataset finishes processing."
            )
    staging = K / "push_e20"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    meta = json.loads((K / "kernel-metadata-exp-v20.json").read_text(encoding="utf-8"))
    code = "visionsetil_exp_v20_source_holdout.ipynb"
    meta["code_file"] = code
    meta["id"] = SLUG
    meta["enable_gpu"] = True
    # Kaggle GPU sessions often land T4x2; notebook uses DataParallel when N_GPU>=2
    ds = list(meta.get("dataset_sources") or [])
    if FT_DATASET not in ds:
        ds.insert(0, FT_DATASET)
    if GBIF_DATASET not in ds:
        ds.append(GBIF_DATASET)
    meta["dataset_sources"] = ds
    shutil.copy(nb, staging / code)
    (staging / "kernel-metadata.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(meta, indent=2))
    r = run(["kaggle", "kernels", "push", "-p", str(staging)], check=False)
    out = (r.stdout or "") + (r.stderr or "")
    print(f"push returncode={r.returncode}")
    if "not valid dataset sources" in out.lower():
        print(
            "FATAL: dataset source rejected — wait for processing then:\n"
            "  python scripts/push_kaggle_e20.py --push-only"
        )
    if "maximum batch gpu" in out.lower():
        print(
            "FATAL: GPU session limit (2). Cancel a running GPU kernel in Kaggle UI, then:\n"
            "  python scripts/push_kaggle_e20.py --push-only"
        )
    print(f"Monitor: https://www.kaggle.com/code/{SLUG}")
    print(f"  kaggle kernels status {SLUG}")
    print(f"  python scripts/push_kaggle_e20.py --status")
    print(f"  python scripts/push_kaggle_e20.py --download")


def status() -> None:
    run(["kaggle", "kernels", "status", SLUG], check=False)


def download() -> None:
    OUT_LOCAL.mkdir(parents=True, exist_ok=True)
    run(
        [
            "kaggle",
            "kernels",
            "output",
            SLUG,
            "-p",
            str(OUT_LOCAL),
            "--file-pattern",
            r".*\.(json|log|pt|npz)$",
            "-o",
        ],
        check=False,
    )
    print("Downloaded under", OUT_LOCAL)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--build-only", action="store_true")
    ap.add_argument("--push-only", action="store_true", help="Push existing notebook without rebuild")
    args = ap.parse_args()
    if args.status:
        status()
        return 0
    if args.download:
        download()
        return 0
    if args.push_only:
        nb = K / "visionsetil_exp_v20_source_holdout.ipynb"
        if not nb.is_file():
            raise SystemExit(f"missing {nb}")
        push(nb)
        return 0
    nb = build()
    if args.build_only:
        print("Built", nb)
        return 0
    push(nb)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

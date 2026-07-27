#!/usr/bin/env python3
"""Build E17 data-scale notebook and push GPU kernel to Kaggle."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
K = REPO / "kaggle"
SLUG = "alonsoalviraaaa/visionsetil-exp-v17-data-scale"
OUT_LOCAL = K / "kernel_output_v17"


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
    run([sys.executable, str(K / "build_exp_v17_data_scale.py")])
    nb = K / "visionsetil_exp_v17_data_scale.ipynb"
    if not nb.is_file():
        raise SystemExit(f"missing {nb}")
    return nb


def push(nb: Path) -> None:
    staging = K / "push_e17"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    meta = json.loads((K / "kernel-metadata-exp-v17.json").read_text(encoding="utf-8"))
    code = "visionsetil_exp_v17_data_scale.ipynb"
    meta["code_file"] = code
    meta["id"] = SLUG
    shutil.copy(nb, staging / code)
    (staging / "kernel-metadata.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta, indent=2))
    run(["kaggle", "kernels", "push", "-p", str(staging)], check=False)
    print(f"Monitor: https://www.kaggle.com/code/{SLUG}")
    print(f"  kaggle kernels status {SLUG}")


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
    args = ap.parse_args()
    if args.status:
        status()
        return 0
    if args.download:
        download()
        return 0
    nb = build()
    if args.build_only:
        print("Built", nb)
        return 0
    push(nb)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Build E16 MEGA notebook and push a Kaggle GPU kernel.

Uses public FungiCLEF + FungiTastic datasets already attached in metadata.
Long train (~many hours). Resume supported via checkpoint_latest.pt in working dir.

  python scripts/push_kaggle_e16_mega.py
  python scripts/push_kaggle_e16_mega.py --status
  python scripts/push_kaggle_e16_mega.py --download
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
K = REPO / "kaggle"
# Must match ~/.kaggle/kaggle.json username (currently alonsoalviraaaa)
SLUG = "alonsoalviraaaa/visionsetil-exp-v16-mega-focus"
OUT_LOCAL = K / "kernel_output_v16"


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
    run([sys.executable, str(K / "build_exp_v16_mega_focus.py")])
    nb = K / "visionsetil_exp_v16_mega_focus.ipynb"
    if not nb.is_file():
        raise SystemExit(f"notebook missing: {nb}")
    return nb


def push(nb: Path) -> None:
    staging = K / "push_e16_mega"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    # Prefer fresh metadata template; code_file must match notebook name in folder
    meta = json.loads((K / "kernel-metadata-exp-v16.json").read_text(encoding="utf-8"))
    code_name = "visionsetil_exp_v16_mega_focus.ipynb"
    meta["code_file"] = code_name
    meta["id"] = SLUG
    meta["title"] = "visionsetil-exp-v16-mega-focus"
    meta["enable_gpu"] = True
    meta["enable_internet"] = True
    shutil.copy(nb, staging / code_name)
    (staging / "kernel-metadata.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    print("Staging:", staging)
    print(json.dumps(meta, indent=2))
    run(["kaggle", "kernels", "push", "-p", str(staging)], check=False)
    print("Pushed (or attempted). Monitor:")
    print(f"  kaggle kernels status {SLUG}")
    print(f"  https://www.kaggle.com/code/{SLUG}")


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
            "-f",
            "models/metrics.json",
        ],
        check=False,
    )
    run(
        ["kaggle", "kernels", "output", SLUG, "-p", str(OUT_LOCAL)],
        check=False,
    )
    print("Downloaded under", OUT_LOCAL)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--status", action="store_true")
    p.add_argument("--download", action="store_true")
    p.add_argument("--build-only", action="store_true")
    p.add_argument("--push-only", action="store_true")
    args = p.parse_args()
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
    if not args.push_only:
        push(nb)
    else:
        push(nb)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

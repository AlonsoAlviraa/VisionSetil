#!/usr/bin/env python3
"""End-to-end cycle: catalog ML-40 expand → SSOT sync → four-photo benchmark.

  python scripts/run_multiview_catalog_cycle.py
  python scripts/run_multiview_catalog_cycle.py --skip-torch

Exit: 0 if benchmark PASS and ML-40 fully in catalog; 1 partial; 2 error.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "eval" / "reports" / "ml_experiments" / "multiview_catalog_cycle.json"


def run(cmd: list[str]) -> tuple[int, str]:
    r = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    return r.returncode, out[-12000:]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-torch", action="store_true")
    ap.add_argument("--skip-sync", action="store_true")
    args = ap.parse_args()

    steps = []
    # 1) Expand catalog
    rc, out = run([sys.executable, str(ROOT / "scripts" / "expand_catalog_ml40_multiview.py")]
                  + ([] if args.skip_sync else ["--sync"]))
    steps.append({"name": "expand_catalog_ml40", "rc": rc, "tail": out[-2000:]})

    # 2) Benchmark
    bench_cmd = [sys.executable, str(ROOT / "eval" / "scripts" / "multiview_four_photo_benchmark.py")]
    if args.skip_torch:
        bench_cmd.append("--skip-torch")
    rc2, out2 = run(bench_cmd)
    steps.append({"name": "multiview_four_photo_benchmark", "rc": rc2, "tail": out2[-2000:]})

    overall = "PASS" if rc == 0 and rc2 == 0 else ("PARTIAL" if rc2 == 0 else "FAIL")
    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "overall": overall,
        "product_unlock": False,
        "policy": "orientation_only_never_consume",
        "steps": steps,
        "artifacts": {
            "benchmark_json": "eval/reports/ml_experiments/multiview_four_photo_benchmark.json",
            "benchmark_md": "eval/reports/ml_experiments/multiview_four_photo_benchmark.md",
            "catalog_report": "eval/reports/ml_experiments/catalog_ml40_multiview.json",
            "diagnostic_map": "data/species_catalog/multiview_diagnostic_map.json",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"overall": overall, "catalog_rc": rc, "bench_rc": rc2, "report": str(OUT)}, indent=2))
    if overall == "PASS":
        return 0
    if overall == "PARTIAL":
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

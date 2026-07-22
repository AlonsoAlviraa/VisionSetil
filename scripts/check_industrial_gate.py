#!/usr/bin/env python3
"""CI-style industrial gate: read metrics JSON + optional industrial eval report.

Exit codes:
  0 = deploy_pass (MAP@3>=0.20 and deadly>=0.90)
  2 = week1_pass only (map>=0.15 deadly@3>=0.50) but not deploy
  3 = fail both
  4 = missing metrics

Usage:
  python scripts/check_industrial_gate.py --metrics kaggle/kernel_output_v15/models/metrics.json
  python scripts/check_industrial_gate.py --eval-report data/industrial_v1/eval_report.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--metrics", type=Path, default=None)
    ap.add_argument("--eval-report", type=Path, default=None)
    ap.add_argument("--map-deploy", type=float, default=0.20)
    ap.add_argument("--deadly-deploy", type=float, default=0.90)
    ap.add_argument("--map-week1", type=float, default=0.15)
    ap.add_argument("--deadly-week1", type=float, default=0.50)
    args = ap.parse_args()

    map3 = None
    deadly = None
    source = None

    if args.eval_report and args.eval_report.is_file():
        r = json.loads(args.eval_report.read_text(encoding="utf-8"))
        map3 = float(r["map_at_3"])
        d = r.get("deadly") or {}
        deadly = d.get("any_deadly_top3")
        if deadly is not None:
            deadly = float(deadly)
        source = str(args.eval_report)
    elif args.metrics and args.metrics.is_file():
        m = json.loads(args.metrics.read_text(encoding="utf-8"))
        map3 = float(m.get("test_map_at_3"))
        deadly = m.get("safety_recall_deadly")
        if deadly is not None:
            deadly = float(deadly)
        source = str(args.metrics)
    else:
        print("NO_METRICS")
        return 4

    print(f"source={source}")
    print(f"map_at_3={map3} deadly={deadly}")
    print("policy=orientation_only_never_consume")

    deploy = map3 is not None and map3 >= args.map_deploy and deadly is not None and deadly >= args.deadly_deploy
    week1 = map3 is not None and map3 >= args.map_week1 and deadly is not None and deadly >= args.deadly_week1

    if deploy:
        print("DEPLOY_PASS")
        return 0
    if week1:
        print("WEEK1_PASS_DEPLOY_FAIL — continue E16, do not deploy")
        return 2
    print("FAIL — deepen data, do not expand allowlist, do not deploy")
    return 3


if __name__ == "__main__":
    raise SystemExit(main())

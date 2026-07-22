#!/usr/bin/env python3
"""One industrial plan tick: poll E15, download/eval on COMPLETE, update PROGRESS.

Safe: never points multi_view_weights_path to failing checkpoints.

Usage:
  python scripts/industrial_tick.py
  python scripts/industrial_tick.py --kernel alonsoalvira/visionsetil-exp-v15-focus40
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROGRESS = REPO / "data" / "industrial_v1" / "PROGRESS.json"
OUT_V15 = REPO / "kaggle" / "kernel_output_v15"


def run(cmd: list[str], timeout: int = 600) -> tuple[int, str]:
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, cwd=str(REPO)
        )
        return p.returncode, ((p.stdout or "") + (p.stderr or "")).strip()
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except FileNotFoundError as e:
        return 127, str(e)


def kernel_status(kernel: str) -> str:
    code, out = run(["kaggle", "kernels", "status", kernel], timeout=90)
    if code != 0:
        return f"CLI_ERROR:{out[:200]}"
    text = out.replace("KernelWorkerStatus.", "")
    if '"' in text:
        return text.split('"')[-2].strip().upper()
    return text.split()[-1].strip().upper() if text else "UNKNOWN"


def py_exe() -> str:
    v = REPO / "backend" / ".venv" / "Scripts" / "python.exe"
    return str(v) if v.is_file() else sys.executable


def update_progress(**kwargs) -> None:
    data = {}
    if PROGRESS.is_file():
        data = json.loads(PROGRESS.read_text(encoding="utf-8"))
    data.update(kwargs)
    data["updated"] = datetime.now(timezone.utc).isoformat()
    PROGRESS.parent.mkdir(parents=True, exist_ok=True)
    PROGRESS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--kernel", default="alonsoalvira/visionsetil-exp-v15-focus40"
    )
    ap.add_argument("--out", type=Path, default=OUT_V15)
    args = ap.parse_args()

    st = kernel_status(args.kernel)
    print(f"kernel_status={st}")

    metrics_path = args.out / "models" / "metrics.json"
    if "COMPLETE" in st and "INCOMPLETE" not in st:
        print("DOWNLOAD")
        args.out.mkdir(parents=True, exist_ok=True)
        code, out = run(
            [
                "kaggle",
                "kernels",
                "output",
                args.kernel,
                "-p",
                str(args.out),
                "--force",
            ],
            timeout=900,
        )
        print(f"download_exit={code}")
        if not metrics_path.is_file():
            print("NO_METRICS_AFTER_DOWNLOAD")
            update_progress(
                blocked_waiting=["E15 download missing metrics.json"],
                last_kernel_status=st,
            )
            return 2

        pred = args.out / "models" / "test_predictions.npz"
        l2i = args.out / "models" / "label2idx.json"
        eval_out = REPO / "data" / "industrial_v1" / "eval_report.json"
        code_e, out_e = run(
            [
                py_exe(),
                str(REPO / "eval" / "scripts" / "eval_industrial_metrics.py"),
                "--pred",
                str(pred),
                "--label2idx",
                str(l2i),
                "--out",
                str(eval_out),
            ],
            timeout=300,
        )
        print(out_e[-1500:] if len(out_e) > 1500 else out_e)
        code_g, out_g = run(
            [
                py_exe(),
                str(REPO / "scripts" / "check_industrial_gate.py"),
                "--eval-report",
                str(eval_out),
            ],
            timeout=60,
        )
        print(out_g)
        print(f"gate_exit={code_g}")

        # never auto-deploy
        deploy = code_g == 0
        week1 = code_g in (0, 2)
        update_progress(
            week=1 if not week1 else 2,
            day=5,
            last_kernel_status="COMPLETE",
            e15_gate_exit=code_g,
            e15_eval=str(eval_out),
            e15_metrics=str(metrics_path),
            blocked_waiting=[]
            if week1
            else ["week1 KPI fail — push E15b or deepen data"],
            next=[
                "E16+GBIF merge" if week1 else "push E15b deadly penalty notebook",
                "Do NOT deploy weights unless gate_exit=0",
            ],
            quality_gate="PASS_DEPLOY" if deploy else "UNACCEPTABLE — no weight deploy",
            policy="orientation_only_never_consume",
        )
        # copy metrics into industrial for tracking only (not auto path for serving)
        track = REPO / "data" / "industrial_v1" / "metrics_e15.json"
        track.write_text(metrics_path.read_text(encoding="utf-8"), encoding="utf-8")
        print("WROTE tracking metrics_e15.json (not deployed)")
        return 0 if week1 else 3

    if any(x in st for x in ("ERROR", "CANCEL", "FAILED")):
        update_progress(
            last_kernel_status=st,
            blocked_waiting=[f"E15 terminal fail {st} — push E15b"],
            next=["push visionsetil_exp_v15b_focus40.ipynb to free GPU kernel"],
        )
        print("E15_FAILED")
        return 4

    update_progress(
        last_kernel_status=st,
        blocked_waiting=["E15 COMPLETE"],
        day=4,
        week=1,
    )
    print("E15_STILL_RUNNING — no deploy")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Monitor Kaggle kernel until terminal status, then download + re-run experiment battery.

Prints one line per status change (and heartbeat) so Grok `monitor` can stream events.
Does not invent metrics — only acts on Kaggle CLI + disk artifacts.

Usage:
  python scripts/monitor_kaggle_exp_v12.py
  python scripts/monitor_kaggle_exp_v12.py --poll 120 --timeout-hours 12
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_KERNEL = "alonsoalvira/visionsetil-exp-v12-data-scale"
DEFAULT_OUT = REPO / "kaggle" / "kernel_output_v12"
TERMINAL = {
    "COMPLETE",
    "ERROR",
    "CANCEL_ACKNOWLEDGED",
    "CANCELLED",
    "CANCEL_REQUESTED",
}


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # one line, flush for monitor streaming
    print(f"[{ts}] {msg}", flush=True)


def run(cmd: list[str], *, timeout: int = 120) -> tuple[int, str]:
    try:
        p = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(REPO),
        )
        out = (p.stdout or "") + (p.stderr or "")
        return p.returncode, out.strip()
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except FileNotFoundError as exc:
        return 127, str(exc)


def kernel_status(kernel: str) -> str:
    code, out = run(["kaggle", "kernels", "status", kernel], timeout=60)
    if code != 0:
        return f"CLI_ERROR:{out[:200]}"
    # Examples:
    # alonsoalvira/... has status "KernelWorkerStatus.RUNNING"
    # alonsoalvira/... has status "COMPLETE"
    text = out.replace("KernelWorkerStatus.", "")
    if "has status" in text:
        # last quoted token or last word
        if '"' in text:
            return text.split('"')[-2].strip().upper().replace("KERNELWORKERSTATUS.", "")
        return text.split()[-1].strip().strip(".").upper()
    return text[:120]


def download_output(kernel: str, out_dir: Path) -> bool:
    out_dir.mkdir(parents=True, exist_ok=True)
    log(f"DOWNLOAD_START dir={out_dir}")
    code, out = run(
        ["kaggle", "kernels", "output", kernel, "-p", str(out_dir), "--force"],
        timeout=600,
    )
    # kaggle often writes useful info even on non-zero; check files
    log(f"DOWNLOAD_CLI exit={code} tail={out[-300:].replace(chr(10), ' ')}")
    files = list(out_dir.rglob("*"))
    log(f"DOWNLOAD_FILES count={len(files)}")
    for f in sorted(files)[:30]:
        if f.is_file():
            log(f"  FILE {f.relative_to(out_dir)} ({f.stat().st_size} bytes)")
    return any(f.is_file() for f in files)


def find_predictions(out_dir: Path) -> Path | None:
    candidates = list(out_dir.rglob("test_predictions.npz"))
    if candidates:
        return candidates[0]
    # sometimes nested under models/
    return None


def find_metrics(out_dir: Path) -> Path | None:
    cands = list(out_dir.rglob("metrics.json"))
    return cands[0] if cands else None


def run_battery(pred: Path | None, label2idx: Path | None) -> int:
    py = REPO / "backend" / ".venv" / "Scripts" / "python.exe"
    if not py.is_file():
        py = Path(sys.executable)
    script = REPO / "eval" / "scripts" / "run_ml_experiment_battery.py"
    out = REPO / "eval" / "reports" / "ml_experiments" / "v12"
    cmd = [str(py), str(script), "--out", str(out)]
    if pred and pred.is_file():
        cmd += ["--pred", str(pred)]
        # sibling label2idx if present
        sib = pred.parent / "label2idx.json"
        if label2idx and label2idx.is_file():
            cmd += ["--label2idx", str(label2idx)]
        elif sib.is_file():
            cmd += ["--label2idx", str(sib)]
        met = pred.parent / "metrics.json"
        if met.is_file():
            cmd += ["--metrics", str(met)]
    log(f"BATTERY_START {' '.join(cmd)}")
    code, out_txt = run(cmd, timeout=900)
    for line in (out_txt or "").splitlines()[-40:]:
        log(f"BATTERY| {line}")
    log(f"BATTERY_DONE exit={code}")
    summary = out / "experiment_battery_report.md"
    if summary.is_file():
        log(f"BATTERY_REPORT {summary}")
    return code


def write_status_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kernel", default=DEFAULT_KERNEL)
    ap.add_argument("--poll", type=int, default=90, help="seconds between polls")
    ap.add_argument("--timeout-hours", type=float, default=14.0)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument(
        "--status-file",
        type=Path,
        default=REPO / "eval" / "reports" / "ml_experiments" / "kaggle_monitor_status.json",
    )
    args = ap.parse_args()

    log(f"MONITOR_START kernel={args.kernel} poll={args.poll}s timeout_h={args.timeout_hours}")
    t0 = time.time()
    last = None
    deadline = t0 + args.timeout_hours * 3600

    while True:
        st = kernel_status(args.kernel)
        now = time.time()
        elapsed_m = (now - t0) / 60.0
        if st != last:
            log(f"STATUS_CHANGE {last or '∅'} -> {st} elapsed_min={elapsed_m:.1f}")
            last = st
            write_status_json(
                args.status_file,
                {
                    "kernel": args.kernel,
                    "status": st,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "elapsed_min": round(elapsed_m, 2),
                },
            )
        else:
            # heartbeat every poll so monitor stays alive
            log(f"HEARTBEAT status={st} elapsed_min={elapsed_m:.1f}")

        # normalize COMPLETE variants
        st_up = st.upper()
        if "COMPLETE" in st_up and "INCOMPLETE" not in st_up:
            log("TERMINAL_COMPLETE — downloading and evaluating")
            ok = download_output(args.kernel, args.out)
            pred = find_predictions(args.out)
            metrics = find_metrics(args.out)
            if metrics and metrics.is_file():
                try:
                    m = json.loads(metrics.read_text(encoding="utf-8"))
                    log(
                        "METRICS "
                        f"map3={m.get('test_map_at_3')} acc={m.get('test_accuracy')} "
                        f"safety_deadly={m.get('safety_recall_deadly')} "
                        f"version={m.get('version')}"
                    )
                except Exception as exc:  # noqa: BLE001
                    log(f"METRICS_PARSE_ERR {exc}")
            if not ok:
                log("DOWNLOAD_EMPTY — still writing status COMPLETE")
            label2idx = None
            if pred:
                cand = pred.parent / "label2idx.json"
                if cand.is_file():
                    label2idx = cand
            code = run_battery(pred, label2idx)
            write_status_json(
                args.status_file,
                {
                    "kernel": args.kernel,
                    "status": "COMPLETE_HANDLED",
                    "download_ok": ok,
                    "pred": str(pred) if pred else None,
                    "metrics": str(metrics) if metrics else None,
                    "battery_exit": code,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "elapsed_min": round((time.time() - t0) / 60.0, 2),
                },
            )
            log("MONITOR_DONE success" if code == 0 else f"MONITOR_DONE battery_exit={code}")
            return 0 if code == 0 else 2

        if any(t in st_up for t in ("ERROR", "CANCEL", "FAILED")):
            log(f"TERMINAL_FAIL status={st} — attempting log download")
            download_output(args.kernel, args.out)
            write_status_json(
                args.status_file,
                {
                    "kernel": args.kernel,
                    "status": st,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "elapsed_min": round((time.time() - t0) / 60.0, 2),
                },
            )
            log("MONITOR_DONE failed")
            return 3

        if now >= deadline:
            log(f"TIMEOUT after {args.timeout_hours}h last_status={st}")
            write_status_json(
                args.status_file,
                {
                    "kernel": args.kernel,
                    "status": f"TIMEOUT_{st}",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            return 4

        time.sleep(max(30, args.poll))


if __name__ == "__main__":
    raise SystemExit(main())

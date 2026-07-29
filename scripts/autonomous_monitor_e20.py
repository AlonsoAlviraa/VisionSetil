#!/usr/bin/env python3
"""Poll E20 Kaggle kernel; on COMPLETE download+postprocess; on bare-freeze ERROR re-push.

Never sets product_unlock. Orientation only.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SLUG = "alonsoalviraaaa/visionsetil-exp-v20-source-holdout"
OUT = REPO / "kaggle" / "kernel_output_v20"
STATUS_PATH = REPO / ".grok" / "graph-engineering" / "e20_run_status.json"
LOG_CANDIDATES = [
    OUT / "visionsetil-exp-v20-source-holdout.log",
    OUT / "kernel.log",
]


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO))


def kernel_status_line() -> str:
    r = run(["kaggle", "kernels", "status", SLUG])
    text = ((r.stdout or "") + (r.stderr or "")).strip()
    if r.returncode != 0 and not text:
        return f"api_error exit={r.returncode}"
    return text.splitlines()[0] if text else f"exit={r.returncode}"


def classify_status(line: str) -> str:
    """Return complete|error|cancel|running|queued|api_error|unknown.

    Do NOT treat SSL/HTTP errors as kernel ERROR (substring 'error' false positive).
    """
    low = (line or "").lower()
    if "sslerror" in low or "httpsconnectionpool" in low or "max retries" in low:
        return "api_error"
    if "api_error" in low:
        return "api_error"
    # Prefer KernelWorkerStatus tokens
    if "kernelworkerstatus.complete" in low or (
        "status" in low and "complete" in low and "error" not in low
    ):
        if "complete" in low and "error" not in low.replace("sslerror", ""):
            # bare complete without error status
            if "kernelworkerstatus.error" not in low:
                return "complete"
    if "kernelworkerstatus.error" in low:
        return "error"
    if "kernelworkerstatus.cancel" in low or "cancelled" in low or "canceled" in low:
        return "cancel"
    if "kernelworkerstatus.running" in low or '"running"' in low:
        return "running"
    if "kernelworkerstatus.queued" in low or "queued" in low:
        return "queued"
    # fallback substring (avoid matching SSLError)
    if "complete" in low and "error" not in low and "ssl" not in low:
        return "complete"
    if "running" in low:
        return "running"
    if "queued" in low:
        return "queued"
    return "unknown"


def write_status(payload: dict) -> None:
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def log_has_bare_freeze_crash() -> bool:
    for p in LOG_CANDIDATES:
        if not p.is_file():
            continue
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "DataParallel" in t and "no attribute 'backbone'" in t:
            return True
        if "for p in model.backbone.backbone.parameters()" in t and "AttributeError" in t:
            return True
    return False


def re_push_fixed() -> int:
    """Rebuild + push fixed E20 notebook (safe_dp_freeze)."""
    r = run([sys.executable, str(REPO / "scripts" / "push_kaggle_e20.py")])
    print((r.stdout or "")[-2000:])
    print((r.stderr or "")[-1000:], file=sys.stderr)
    return r.returncode


def postprocess(download: bool = True) -> int:
    cmd = [sys.executable, str(REPO / "scripts" / "e20_postprocess.py")]
    if download:
        cmd.append("--download")
    r = run(cmd)
    print((r.stdout or "")[-3000:])
    return r.returncode


def main() -> int:
    max_wait = int(sys.argv[1]) if len(sys.argv) > 1 else 120  # default one poll for scheduler
    interval = 90
    t0 = time.time()
    pushed_recovery = False

    while time.time() - t0 < max_wait:
        st = kernel_status_line()
        kind = classify_status(st)
        payload = {
            "slug": SLUG,
            "status_line": st,
            "status_kind": kind,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "elapsed_s": int(time.time() - t0),
            "product_unlock": False,
        }
        write_status(payload)
        print(payload["checked_at"], kind, st)

        if kind == "api_error":
            # Transient network/SSL — back off and continue
            print("Kaggle API transient error — retrying")
            time.sleep(min(interval * 2, 180))
            continue

        if kind == "complete":
            rc = postprocess(download=True)
            payload["postprocess_rc"] = rc
            payload["phase"] = "complete_postprocess"
            write_status(payload)
            return 0 if rc in (0, 2) else rc

        if kind in ("error", "cancel"):
            # Pull log to diagnose
            run(
                [
                    "kaggle",
                    "kernels",
                    "output",
                    SLUG,
                    "-p",
                    str(OUT),
                    "-o",
                ]
            )
            bare = log_has_bare_freeze_crash()
            payload["bare_freeze_crash"] = bare
            payload["terminal"] = True
            if bare and not pushed_recovery:
                print("Detected bare-freeze DP crash — re-pushing fixed notebook")
                prc = re_push_fixed()
                payload["recovery_push_rc"] = prc
                payload["recovery"] = "re_pushed_safe_dp_freeze"
                pushed_recovery = True
                write_status(payload)
                # After re-push, status becomes QUEUED/RUNNING — continue polling if budget left
                if time.time() - t0 < max_wait - interval:
                    time.sleep(interval)
                    continue
                return 0 if prc == 0 else 1
            write_status(payload)
            return 1

        time.sleep(interval)

    # Poll budget exhausted — report last known non-terminal status (not a kernel timeout)
    write_status(
        {
            "slug": SLUG,
            "status_line": kernel_status_line(),
            "poll_budget_exhausted": True,
            "elapsed_s": max_wait,
            "product_unlock": False,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "note": "Scheduler poll only; kernel may still be RUNNING",
        }
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

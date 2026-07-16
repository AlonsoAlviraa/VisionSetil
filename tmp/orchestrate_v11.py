#!/usr/bin/env python3
"""
VisionSetil v11 — Full Kaggle Orchestration Script
===================================================
Handles: credentials setup, notebook generation, push (with retry), 
output download, and metrics evaluation.

Usage:
    python tmp/orchestrate_v11.py push      # Generate + push kernel
    python tmp/orchestrate_v11.py download  # Download output + show metrics
    python tmp/orchestrate_v11.py status    # Check kernel status
    python tmp/orchestrate_v11.py full      # Full pipeline
"""
import os, sys, json, subprocess, time
from pathlib import Path

# ─── Config ───────────────────────────────────────────────────────────────────
USERNAME = "alonsoalviraaaa"
TOKEN = "KGAT_47893c54215cc359ba93342189276b23"
KERNEL_SLUG = "visionsetil-fungi-v11"
KERNEL_URL = f"https://www.kaggle.com/code/alonsoalvira/{KERNEL_SLUG}"

os.environ["KAGGLE_USERNAME"] = USERNAME
os.environ["KAGGLE_KEY"] = TOKEN

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg, prefix="▶"):
    print(f"[{time.strftime('%H:%M:%S')}] {prefix} {msg}", flush=True)

def run_cmd(cmd, timeout=60):
    """Run a command, return (returncode, stdout, stderr)."""
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout.strip(), r.stderr.strip()

def setup_credentials():
    """Write kaggle.json to home directory."""
    kaggle_dir = Path.home() / ".kaggle"
    kaggle_dir.mkdir(exist_ok=True)
    kaggle_json = kaggle_dir / "kaggle.json"
    kaggle_json.write_text(json.dumps({"username": USERNAME, "key": TOKEN}))
    try:
        kaggle_json.chmod(0o600)
    except:
        pass  # Windows doesn't support chmod
    log(f"Credentials written to {kaggle_json}")

# ─── Commands ─────────────────────────────────────────────────────────────────
def cmd_push():
    """Generate notebook and push to Kaggle with GPU."""
    setup_credentials()
    
    # Generate notebook
    log("Generating v11 notebook...")
    rc, out, err = run_cmd([sys.executable, "kaggle/gen_notebook_v11.py"])
    if rc != 0:
        log(f"Generation failed: {err}", "✗")
        return False
    log(f"Notebook generated: {out}")
    
    # Prepare push directory
    push_dir = Path("tmp/push_v11")
    push_dir.mkdir(parents=True, exist_ok=True)
    
    # Write metadata with GPU enabled
    meta = {
        "id": f"{USERNAME}/{KERNEL_SLUG}",
        "title": KERNEL_SLUG,
        "code_file": "visionsetil_mega_training.ipynb",
        "language": "python",
        "kernel_type": "notebook",
        "is_private": "true",
        "enable_gpu": "true",
        "enable_tpu": "false",
        "enable_internet": "true",
        "dataset_sources": ["seemshukla/fungiclef", "picekl/fungitastic"],
        "competition_sources": [],
        "kernel_sources": []
    }
    (push_dir / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))
    
    # Copy notebook
    import shutil
    shutil.copy("kaggle/visionsetil_mega_training.ipynb", push_dir / "visionsetil_mega_training.ipynb")
    
    # Push with retry (handles 409 conflict while previous version processes)
    log("Pushing kernel (with retry for 409 conflicts)...")
    for attempt in range(1, 31):
        rc, out, err = run_cmd(["kaggle", "kernels", "push", "-p", str(push_dir)])
        
        if rc == 0:
            log(f"✅ PUSHED SUCCESSFULLY!")
            log(f"   {out}")
            log(f"   URL: {KERNEL_URL}")
            return True
        
        if "Maximum batch GPU session count" in out:
            log("❌ GPU SESSION LIMIT REACHED!", "✗")
            log("   You need to cancel other running GPU kernels on Kaggle.")
            log(f"   Go to: https://www.kaggle.com/code")
            log("   Then re-run: python tmp/orchestrate_v11.py push")
            return False
        
        if "409" in out or "Conflict" in out:
            log(f"  Attempt {attempt}/30: v1 still processing, waiting 60s...", "⏳")
            time.sleep(60)
            continue
        
        log(f"  Attempt {attempt}: rc={rc} out={out[:100]} err={err[:100]}", "?")
        time.sleep(30)
    
    log("Failed after 30 attempts. Try manually from Kaggle UI.", "✗")
    return False

def cmd_download():
    """Download kernel output and display metrics."""
    setup_credentials()
    out_dir = Path("kaggle/kernel_output_v11")
    out_dir.mkdir(parents=True, exist_ok=True)
    
    log(f"Downloading output from {USERNAME}/{KERNEL_SLUG}...")
    rc, out, err = run_cmd(
        ["kaggle", "kernels", "output", f"{USERNAME}/{KERNEL_SLUG}", "-p", str(out_dir)],
        timeout=300
    )
    
    if rc != 0:
        log(f"Download failed: {out} {err}", "✗")
        log("Kernel may still be running or no output available.")
        return
    
    # List files
    files = sorted(f for f in out_dir.rglob("*") if f.is_file())
    log(f"Downloaded {len(files)} files:")
    for f in files:
        log(f"  {f.relative_to(out_dir)} ({f.stat().st_size:,} bytes)")
    
    # Show metrics
    metrics_path = out_dir / "models" / "metrics.json"
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text())
        print("\n" + "=" * 60)
        print("V11 RESULTS")
        print("=" * 60)
        print(json.dumps(metrics, indent=2))
        
        map3 = metrics.get("test_map_at_3", 0)
        safety = metrics.get("safety_recall_deadly", 0)
        ece = metrics.get("test_ece", 1)
        
        print("\n" + "=" * 60)
        print("DoD TARGET CHECK")
        print("=" * 60)
        print(f"  MAP@3 >= 0.45:        {'✅ PASS' if map3 >= 0.45 else '❌ FAIL'} ({map3:.4f})")
        print(f"  Safety Recall = 1.0:  {'✅ PASS' if safety >= 1.0 else '❌ FAIL'} ({safety:.4f})")
        print(f"  ECE <= 0.15:          {'✅ PASS' if ece <= 0.15 else '❌ FAIL'} ({ece:.4f})")
        print("=" * 60)
    else:
        log("No metrics.json found in output.")

def cmd_status():
    """Check kernel status."""
    setup_credentials()
    import requests
    HEADERS = {"Authorization": f"Bearer {TOKEN}"}
    
    r = requests.get(
        "https://www.kaggle.com/api/v1/kernels/status",
        params={"userName": USERNAME, "kernelSlug": KERNEL_SLUG},
        headers=HEADERS, timeout=30
    )
    
    if r.status_code == 200:
        data = r.json()
        status = data.get("status", "unknown")
        log(f"Kernel status: {status}")
        if status == "running":
            log("Training in progress...")
        elif status == "complete":
            log("Training complete! Run 'download' to get results.")
        elif status == "error":
            log(f"Kernel failed: {data.get('failureMessage', 'unknown error')}")
    else:
        log(f"Status check failed: {r.status_code} {r.text[:200]}")
        log("(KGAT token may not have status permissions)")
        log(f"Check manually: {KERNEL_URL}")

def cmd_full():
    """Full pipeline: push, wait, download."""
    if not cmd_push():
        return
    log("Waiting for training to complete (checking every 5 min)...")
    for i in range(144):  # 12 hours max
        time.sleep(300)
        import requests
        HEADERS = {"Authorization": f"Bearer {TOKEN}"}
        r = requests.get(
            "https://www.kaggle.com/api/v1/kernels/status",
            params={"userName": USERNAME, "kernelSlug": KERNEL_SLUG},
            headers=HEADERS, timeout=30
        )
        if r.status_code == 200:
            status = r.json().get("status", "")
            log(f"Status: {status}")
            if status in ["complete", "error", "cancelled"]:
                break
    cmd_download()

# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    commands = {"push": cmd_push, "download": cmd_download, "status": cmd_status, "full": cmd_full}
    if cmd in commands:
        commands[cmd]()
    else:
        print(f"Unknown command: {cmd}")
        print(f"Usage: python {sys.argv[0]} [push|download|status|full]")
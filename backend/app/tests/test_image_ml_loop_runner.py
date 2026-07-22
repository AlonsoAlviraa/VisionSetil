"""Structural + smoke tests for the image ML loop runner wiring."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONFIG = ROOT / "kaggle" / "configs" / "image_ml_loop_v1.json"
RUNNER = ROOT / "scripts" / "run_image_ml_loop.py"
PREDS = ROOT / "kaggle" / "kernel_output_v9" / "models" / "test_predictions.npz"
LABELS = ROOT / "kaggle" / "kernel_output_v9" / "models" / "label2idx.json"


def test_loop_config_wires_runner_and_predictions():
    assert CONFIG.exists()
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    assert cfg["runner"] == "scripts/run_image_ml_loop.py"
    assert RUNNER.exists()
    assert (ROOT / cfg["default_predictions"]).exists() or PREDS.exists()
    assert "MAP@3" in cfg["metrics"]
    assert "commands" in cfg and "local_eval" in cfg["commands"]


def test_run_image_ml_loop_on_v9_predictions(tmp_path):
    """Drive the shipped runner entrypoint on real v9 kernel predictions."""
    assert PREDS.exists(), "kernel_output_v9 predictions required for honest ML loop"
    assert LABELS.exists()
    out = tmp_path / "ml_loop_out"
    transcript = tmp_path / "metrics-run.log"
    proc = subprocess.run(
        [
            sys.executable,
            str(RUNNER),
            "--config",
            str(CONFIG),
            "--predictions",
            str(PREDS),
            "--label2idx",
            str(LABELS),
            "--output-dir",
            str(out),
            "--transcript",
            str(transcript),
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, proc.stdout + "\n" + proc.stderr
    metrics_path = out / "image_ml_loop_metrics.json"
    assert metrics_path.exists()
    report = json.loads(metrics_path.read_text(encoding="utf-8"))
    map3 = report["map_at_3"]
    assert map3["point"] is not None
    assert "ci_low" in map3 and "ci_high" in map3
    assert report["classification"]["num_samples"] == 600
    assert report["classification"]["top1_acc"] is not None
    # Transcript must be real pipeline log, not a metrics dump only
    text = transcript.read_text(encoding="utf-8")
    assert "generate_full_report" in text or "Full Evaluation Harness" in text or "MAP@3" in text
    assert "samples=600" in text or "Samples: 600" in text or "samples=600" in proc.stdout

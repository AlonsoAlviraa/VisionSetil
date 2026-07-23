"""Unit tests for multiview_v8 architecture detection + optional full load."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.ml.multiview_v8 import (
    DEFAULT_BACKBONE,
    detect_v8_checkpoint,
    infer_v8_hparams,
)


def _best_pt() -> Path:
    root = Path(__file__).resolve().parents[3]
    return root / "kaggle" / "kernel_output_v9" / "models" / "best.pt"


def test_detect_v8_from_synthetic_keys():
    fake = {
        "backbone.lora.lora_A": object(),
        "arcface.weight": object(),
        "metadata_encoder.embeddings.habitat.weight": object(),
    }
    assert detect_v8_checkpoint(fake) is True
    assert detect_v8_checkpoint({"head.weight": 1}) is False


@pytest.mark.skipif(not _best_pt().is_file(), reason="best.pt not in workspace")
def test_load_best_pt_is_real():
    pytest.importorskip("timm")  # E-14: CI without timm stays green
    import torch

    from app.ml.multiview_v8 import load_v8_from_checkpoint

    ckpt = torch.load(_best_pt(), map_location="cpu", weights_only=False)
    assert detect_v8_checkpoint(ckpt["model_state"])
    hp = infer_v8_hparams(ckpt["model_state"], ckpt.get("config"))
    assert hp["d_model"] == 512
    assert hp["num_classes"] == 500
    assert "tiny" in hp["backbone_name"] or hp["backbone_name"] == DEFAULT_BACKBONE
    model, info = load_v8_from_checkpoint(ckpt, device="cpu")
    assert model is not None
    assert info["arch"] == "multiview_v8"
    assert len(info["hparams"]["vocab_sizes"]) == 4

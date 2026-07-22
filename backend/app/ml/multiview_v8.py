"""Multi-view architecture matching Kaggle kernel_output_v9 (gen_notebook_v8).

Checkpoint keys (verified against best.pt):
  backbone.backbone.*, backbone.lora.{lora_A,lora_B}, backbone.view_embed,
  backbone.proj.{0,1}, metadata_encoder.embeddings.*, metadata_encoder.mlp.*,
  fusion.{meta_proj,view_pos,self_attn,norm1,norm2,ffn}, arcface.weight,
  center_loss.centers

Config in best.pt: d_model=512, metadata_dim=64, num_classes=500, lora_rank=16
Backbone: convnextv2_tiny (stem channels 96, feat 768).
"""

from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_BACKBONE = "convnextv2_tiny.fcmae_ft_in22k_in1k"
DEFAULT_VOCAB = {"habitat": 100, "substrate": 50, "smell": 30, "country": 200}


def _import_torch():
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    return torch, nn, F


def build_multiview_v8(
    *,
    num_classes: int = 500,
    d_model: int = 512,
    metadata_dim: int = 64,
    lora_rank: int = 16,
    backbone_name: str = DEFAULT_BACKBONE,
    vocab_sizes: dict[str, int] | None = None,
    pretrained: bool = False,
):
    """Instantiate the v8 MultiViewModel (untrained weights)."""
    torch, nn, F = _import_torch()
    try:
        import timm  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ImportError("timm is required to load multi-view v8 weights") from exc

    vocab = dict(DEFAULT_VOCAB)
    if vocab_sizes:
        vocab.update({k: int(v) for k, v in vocab_sizes.items()})

    class VectorizedLoRA(nn.Module):
        def __init__(self, in_features: int, num_views: int = 4, rank: int = 16, alpha: float = 16.0):
            super().__init__()
            self.num_views = num_views
            self.rank = rank
            self.scaling = alpha / max(rank, 1)
            self.lora_A = nn.Parameter(torch.randn(num_views, rank, in_features) * 0.01)
            self.lora_B = nn.Parameter(torch.zeros(num_views, in_features, rank))
            for v in range(num_views):
                nn.init.kaiming_uniform_(self.lora_A.data[v].unsqueeze(0), a=math.sqrt(5))

        def forward(self, features, view_idx):
            A = self.lora_A[view_idx]
            B = self.lora_B[view_idx]
            x = features.unsqueeze(-1)
            hidden = torch.bmm(A, x)
            delta = torch.bmm(B, hidden).squeeze(-1)
            return features + delta * self.scaling

    class ViewConditionedBackbone(nn.Module):
        def __init__(self):
            super().__init__()
            try:
                self.backbone = timm.create_model(
                    backbone_name, pretrained=pretrained, num_classes=0
                )
            except Exception:
                logger.warning(
                    "timm model %s unavailable; falling back to convnext_tiny",
                    backbone_name,
                )
                self.backbone = timm.create_model(
                    "convnext_tiny", pretrained=pretrained, num_classes=0
                )
            feat_dim = int(self.backbone.num_features)
            self.feat_dim = feat_dim
            self.d_model = d_model
            self.lora = VectorizedLoRA(feat_dim, num_views=4, rank=lora_rank)
            self.view_embed = nn.Embedding(4, feat_dim)
            # Matches checkpoint: Linear + LayerNorm (+ GELU has no params)
            self.proj = nn.Sequential(
                nn.Linear(feat_dim, d_model),
                nn.LayerNorm(d_model),
                nn.GELU(),
            )

        def forward(self, images, view_idx, attention_mask=None):
            # images: [B, N, C, H, W]
            B, N, C, H, W = images.shape
            if attention_mask is None:
                attention_mask = torch.ones(B, N, dtype=torch.bool, device=images.device)
            real_mask = attention_mask.reshape(-1)
            flat_images = images.reshape(-1, C, H, W)
            real_images = flat_images[real_mask]
            if real_images.size(0) > 0:
                real_features = self.backbone(real_images)
                features = torch.zeros(B * N, self.feat_dim, device=images.device)
                real_indices = torch.where(real_mask)[0]
                features = features.index_copy(0, real_indices, real_features)
            else:
                features = torch.zeros(B * N, self.feat_dim, device=images.device)
            flat_view = view_idx.reshape(-1).clamp(0, self.lora.num_views - 1)
            features = self.lora(features, flat_view)
            features = features + self.view_embed(flat_view)
            features = features * real_mask.unsqueeze(-1).float()
            features = features.view(B, N, self.feat_dim)
            embeddings = self.proj(features)
            embeddings = embeddings * attention_mask.unsqueeze(-1).float()
            return embeddings

    class MetadataEncoder(nn.Module):
        def __init__(self):
            super().__init__()
            embed_dim = 32
            self.embeddings = nn.ModuleDict(
                {name: nn.Embedding(size, embed_dim) for name, size in vocab.items()}
            )
            total_dim = embed_dim * len(vocab)
            self.mlp = nn.Sequential(
                nn.Linear(total_dim, metadata_dim * 2),
                nn.LayerNorm(metadata_dim * 2),
                nn.GELU(),
                nn.Linear(metadata_dim * 2, metadata_dim),
            )

        def forward(self, metadata_indices: dict):
            embeds = []
            for name in ("habitat", "substrate", "smell", "country"):
                idx = metadata_indices[name]
                embeds.append(self.embeddings[name](idx))
            return self.mlp(torch.cat(embeds, dim=-1))

    class AttentionFusion(nn.Module):
        def __init__(self):
            super().__init__()
            self.d_model = d_model
            self.metadata_dim = metadata_dim
            self.max_views = 10
            self.meta_proj = nn.Linear(metadata_dim, d_model)
            self.view_pos = nn.Embedding(self.max_views + 1, d_model)
            self.self_attn = nn.MultiheadAttention(
                embed_dim=d_model, num_heads=4, batch_first=True
            )
            self.norm1 = nn.LayerNorm(d_model)
            self.norm2 = nn.LayerNorm(d_model)
            self.ffn = nn.Sequential(
                nn.Linear(d_model, d_model * 2),
                nn.GELU(),
                nn.Linear(d_model * 2, d_model),
            )
            self.output_dim = d_model + metadata_dim

        def forward(self, visual_embeddings, attention_mask, metadata_emb=None):
            B, N, _ = visual_embeddings.shape
            pos_idx = torch.arange(N, device=visual_embeddings.device).clamp(
                0, self.max_views - 1
            )
            tokens = visual_embeddings + self.view_pos(pos_idx).unsqueeze(0)
            if metadata_emb is not None:
                meta_token = self.meta_proj(metadata_emb).unsqueeze(1)
                meta_token = meta_token + self.view_pos(
                    torch.tensor(self.max_views, device=tokens.device)
                ).unsqueeze(0)
                tokens = torch.cat([meta_token, tokens], dim=1)
                meta_pad = torch.zeros(B, 1, dtype=torch.bool, device=tokens.device)
                key_padding_mask = torch.cat([meta_pad, ~attention_mask], dim=1)
            else:
                key_padding_mask = ~attention_mask
            attn_out, _ = self.self_attn(
                tokens, tokens, tokens, key_padding_mask=key_padding_mask
            )
            tokens = self.norm1(tokens + attn_out)
            tokens = self.norm2(tokens + self.ffn(tokens))
            if metadata_emb is not None:
                valid_mask = torch.cat(
                    [
                        torch.ones(B, 1, dtype=torch.bool, device=tokens.device),
                        attention_mask,
                    ],
                    dim=1,
                )
            else:
                valid_mask = attention_mask
            pooled = (tokens * valid_mask.unsqueeze(-1).float()).sum(dim=1) / valid_mask.sum(
                dim=1, keepdim=True
            ).float().clamp(min=1)
            if metadata_emb is not None:
                return torch.cat([pooled, metadata_emb], dim=-1)
            zero_meta = torch.zeros(B, self.metadata_dim, device=pooled.device)
            return torch.cat([pooled, zero_meta], dim=-1)

    class ArcFaceHead(nn.Module):
        def __init__(self, in_features: int, n_classes: int, s: float = 30.0, m: float = 0.50):
            super().__init__()
            self.weight = nn.Parameter(torch.randn(n_classes, in_features))
            nn.init.xavier_uniform_(self.weight)
            self.s = s
            self.m = m
            self.num_classes = n_classes

        def forward(self, embeddings, labels=None):
            W = F.normalize(self.weight, dim=1)
            E = F.normalize(embeddings, dim=1)
            cosine = E @ W.T
            if labels is not None:
                theta = torch.acos(cosine.clamp(-1 + 1e-7, 1 - 1e-7))
                target_logits = torch.cos(theta + self.m)
                one_hot = F.one_hot(labels, self.num_classes).float()
                cosine = one_hot * target_logits + (1 - one_hot) * cosine
            return cosine * self.s

    class CenterLoss(nn.Module):
        def __init__(self, n_classes: int, feat_dim: int):
            super().__init__()
            self.centers = nn.Parameter(torch.randn(n_classes, feat_dim))

        def forward(self, x, labels):
            batch_centers = self.centers[labels]
            return ((x - batch_centers) ** 2).sum(dim=1).mean()

    class MultiViewModelV8(nn.Module):
        def __init__(self):
            super().__init__()
            self.backbone = ViewConditionedBackbone()
            self.metadata_encoder = MetadataEncoder()
            self.fusion = AttentionFusion()
            feat_dim = self.fusion.output_dim
            self.arcface = ArcFaceHead(feat_dim, num_classes)
            self.center_loss = CenterLoss(num_classes, feat_dim)
            self.arch = "multiview_v8"
            self.d_model = d_model
            self.metadata_dim = metadata_dim
            self.num_classes = num_classes

        def forward(self, images, view_idx, attention_mask, metadata_indices, labels=None):
            visual_emb = self.backbone(images, view_idx, attention_mask)
            meta_embeds = []
            for name in ("habitat", "substrate", "smell", "country"):
                idx = metadata_indices.get(
                    name,
                    torch.zeros(images.size(0), dtype=torch.long, device=images.device),
                )
                meta_embeds.append(self.metadata_encoder.embeddings[name](idx))
            meta_concat = torch.cat(meta_embeds, dim=-1)
            metadata_emb = self.metadata_encoder.mlp(meta_concat)
            obs_emb = self.fusion(visual_emb, attention_mask, metadata_emb)
            logits = self.arcface(obs_emb, labels)
            return logits, obs_emb

    return MultiViewModelV8()


def detect_v8_checkpoint(state_dict: dict[str, Any]) -> bool:
    """Heuristic: v8 uses backbone.lora + arcface.weight (not head.weight)."""
    keys = set(state_dict.keys())
    return (
        any(k.startswith("backbone.lora.") for k in keys)
        and any(k.startswith("arcface.") for k in keys)
        and any(k.startswith("metadata_encoder.embeddings.") for k in keys)
    )


def infer_v8_hparams(state_dict: dict[str, Any], checkpoint_cfg: dict | None = None) -> dict:
    """Infer d_model / metadata_dim / num_classes / vocab from tensors + cfg."""
    cfg = dict(checkpoint_cfg or {})
    d_model = int(cfg.get("d_model") or 512)
    metadata_dim = int(cfg.get("metadata_dim") or cfg.get("metadata_embed_dim") or 64)
    num_classes = int(cfg.get("num_classes") or 500)
    lora_rank = int(cfg.get("lora_rank") or 16)

    if "backbone.proj.0.weight" in state_dict:
        # [d_model, feat_dim]
        d_model = int(state_dict["backbone.proj.0.weight"].shape[0])
    if "arcface.weight" in state_dict:
        num_classes = int(state_dict["arcface.weight"].shape[0])
        out_dim = int(state_dict["arcface.weight"].shape[1])
        # out_dim = d_model + metadata_dim
        if out_dim > d_model:
            metadata_dim = out_dim - d_model
    if "backbone.lora.lora_A" in state_dict:
        lora_rank = int(state_dict["backbone.lora.lora_A"].shape[1])

    vocab_sizes = dict(DEFAULT_VOCAB)
    for field in ("habitat", "substrate", "smell", "country"):
        key = f"metadata_encoder.embeddings.{field}.weight"
        if key in state_dict:
            vocab_sizes[field] = int(state_dict[key].shape[0])

    backbone = DEFAULT_BACKBONE
    # stem 96 → tiny; 128 → base
    stem = state_dict.get("backbone.backbone.stem.0.weight")
    if stem is not None:
        ch = int(stem.shape[0])
        if ch == 96:
            backbone = DEFAULT_BACKBONE
        elif ch == 128:
            backbone = "convnextv2_base.fcmae_ft_in22k_in1k"

    return {
        "d_model": d_model,
        "metadata_dim": metadata_dim,
        "num_classes": num_classes,
        "lora_rank": lora_rank,
        "backbone_name": backbone,
        "vocab_sizes": vocab_sizes,
    }


def load_v8_from_checkpoint(
    checkpoint: dict[str, Any],
    *,
    device: str = "cpu",
) -> tuple[Any, dict]:
    """Build v8 model and load state_dict strictly enough to detect failure.

    Returns (model, info) where info has keys: missing, unexpected, hparams.
    Raises on size-mismatch / failed load.
    """
    torch, _, _ = _import_torch()
    state_dict = (
        checkpoint.get("model_state")
        or checkpoint.get("model_state_dict")
        or checkpoint.get("state_dict")
        or checkpoint
    )
    if not isinstance(state_dict, dict):
        raise TypeError(f"state_dict is not a dict: {type(state_dict)}")

    hparams = infer_v8_hparams(state_dict, checkpoint.get("config") if isinstance(checkpoint, dict) else None)
    model = build_multiview_v8(
        num_classes=hparams["num_classes"],
        d_model=hparams["d_model"],
        metadata_dim=hparams["metadata_dim"],
        lora_rank=hparams["lora_rank"],
        backbone_name=hparams["backbone_name"],
        vocab_sizes=hparams["vocab_sizes"],
        pretrained=False,
    )
    missing, unexpected = model.load_state_dict(state_dict, strict=False)
    # Fail if too many missing core weights (architecture mismatch)
    critical_prefixes = ("backbone.backbone.", "arcface.", "fusion.")
    missing_critical = [
        m for m in missing if any(m.startswith(p) for p in critical_prefixes)
    ]
    if missing_critical:
        raise RuntimeError(
            f"v8 load missing critical keys ({len(missing_critical)}): "
            f"{missing_critical[:5]}"
        )
    model.to(device)
    model.eval()
    info = {
        "missing": list(missing),
        "unexpected": list(unexpected),
        "hparams": hparams,
        "arch": "multiview_v8",
    }
    return model, info

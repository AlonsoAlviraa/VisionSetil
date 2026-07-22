"""
Multi-View Mushroom Classification Model (v5)
==============================================

Core neural architecture for multi-view mushroom identification.

Components:
    1. ViewConditionedBackbone  — shared backbone + per-view LoRA adapters.
    2. MetadataEncoder          — habitat/substrate/smell/country → dense embedding.
    3. AttentionFusion          — late fusion of N image embeddings + metadata.
    4. ArcFaceHead              — metric-learning head for open-set rejection.
    5. TemperatureScaler        — per-view-combo calibration.
    6. MultiViewModel           — end-to-end wrapper combining all components.

Design principles:
    - Variable number of views per observation (2 to ``max_views``).
    - View-conditioned specialization via low-rank adapters (parameter-efficient).
    - Open-set capable via cosine-similarity ArcFace embedding space.
    - No synthetic images (see PROMPT.md §16 and ML_IMPROVEMENT_PROMPT.md §12).
    - **Vectorized**: all per-view operations use batched tensor ops, no Python loops.

This module is part of the Kaggle training pipeline; the backend loads the
exported weights via ``services/multi_view_classifier.py``.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

import torch
import torch.nn as nn
import torch.nn.functional as F

# Canonical view vocabulary. The order matters for the learned view embeddings
# and per-view LoRA adapter lookup.
VIEW_TYPES: tuple[str, ...] = ("gills", "front", "habitat", "detail")
VIEW_TO_IDX: dict[str, int] = {v: i for i, v in enumerate(VIEW_TYPES)}
NUM_VIEWS: int = len(VIEW_TYPES)
UNKNOWN_VIEW: str = "unknown"


# --------------------------------------------------------------------------- #
# LoRA Adapter                                                                 #
# --------------------------------------------------------------------------- #
class LoRAAdapter(nn.Module):
    """Low-Rank Adaptation adapter applied additively to a frozen feature.

    ``W + (A @ B)`` where ``A: [rank, in_dim]`` and ``B: [in_dim, rank]``.
    Initialized so the adapter is near-identity at start (B near zero).
    """

    def __init__(self, in_features: int, rank: int = 16, alpha: float = 16.0) -> None:
        super().__init__()
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank
        self.lora_A = nn.Linear(in_features, rank, bias=False)
        self.lora_B = nn.Linear(rank, in_features, bias=False)
        # Standard LoRA init: A with kaiming, B with zeros → starts at zero.
        nn.init.kaiming_uniform_(self.lora_A.weight, a=math.sqrt(5))
        nn.init.zeros_(self.lora_B.weight)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.lora_B(self.lora_A(x)) * self.scaling


# --------------------------------------------------------------------------- #
# Multi-View LoRA Layer (vectorized — no Python loops over views)              #
# --------------------------------------------------------------------------- #
class MultiViewLoRA(nn.Module):
    """Vectorized per-view LoRA: applies the correct adapter based on view_idx.

    Instead of looping over views, we use a single batched matmul with
    per-sample adapter selection. This is significantly faster on GPU.

    Internally stores A_stacked [NUM_VIEWS, in_features, rank] and
    B_stacked [NUM_VIEWS, rank, in_features]. For each sample, selects the
    row corresponding to its view index.

    Unknown views (index -1) get the identity (no adapter).
    """

    def __init__(self, in_features: int, rank: int = 16, alpha: float = 16.0) -> None:
        super().__init__()
        self.in_features = in_features
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank

        # Stacked parameters: [NUM_VIEWS, in_features, rank] and [NUM_VIEWS, rank, in_features]
        self.lora_A = nn.Parameter(torch.empty(NUM_VIEWS, in_features, rank))
        self.lora_B = nn.Parameter(torch.zeros(NUM_VIEWS, rank, in_features))
        # Kaiming init for A, zeros for B (near-identity start).
        for v in range(NUM_VIEWS):
            nn.init.kaiming_uniform_(self.lora_A[v], a=math.sqrt(5))

    def forward(self, x: torch.Tensor, view_idx: torch.Tensor) -> torch.Tensor:
        """Apply per-view LoRA adapter.

        Args:
            x: [N, in_features] feature tensor.
            view_idx: [N] long tensor, view index for each sample (-1 = unknown/identity).
        Returns:
            [N, in_features] adapted features.
        """
        # Clamp unknown (-1) to view 0 for indexing, but mask them out.
        safe_idx = view_idx.clamp(min=0, max=NUM_VIEWS - 1)  # [N]

        # Gather per-sample A and B: [N, in_features, rank] and [N, rank, in_features]
        A_sample = self.lora_A[safe_idx]  # [N, in_features, rank]
        B_sample = self.lora_B[safe_idx]  # [N, rank, in_features]

        # Batched low-rank transform: x @ A @ B for each sample.
        # x: [N, in_features], A_sample: [N, in_features, rank]
        # → einsum: [N, rank]
        hidden = torch.bmm(x.unsqueeze(1), A_sample)  # [N, 1, rank]
        delta = torch.bmm(hidden, B_sample).squeeze(1)  # [N, in_features]

        # Mask out unknown views (they get identity = no adaptation).
        unknown_mask = (view_idx == -1).unsqueeze(-1).float()  # [N, 1]
        delta = delta * (1.0 - unknown_mask)

        return x + delta * self.scaling


# --------------------------------------------------------------------------- #
# View-Conditioned Backbone                                                    #
# --------------------------------------------------------------------------- #
class ViewConditionedBackbone(nn.Module):
    """Shared backbone with per-view LoRA adapters + projection head.

    A single timm backbone is shared across all views for parameter efficiency.
    Four small LoRA adapters (one per canonical view) specialize the pooled
    feature via the vectorized ``MultiViewLoRA`` layer. A linear projection
    maps to ``d_model`` dimensions.

    Args:
        base_backbone: timm model name (e.g. ``convnextv2_base.fcmae_ft_in22k_in1k``).
        d_model: output embedding dimension.
        lora_rank: rank of the LoRA adapters.
        use_lora_adapters: if False, no adapters are applied (ablation A3).
        pretrained: whether to load ImageNet/22k pretrained weights.
    """

    def __init__(
        self,
        base_backbone: str = "convnextv2_base.fcmae_ft_in22k_in1k",
        d_model: int = 1024,
        lora_rank: int = 16,
        use_lora_adapters: bool = True,
        pretrained: bool = False,
    ) -> None:
        super().__init__()
        import timm

        self.use_lora_adapters = use_lora_adapters
        # Default pretrained=False for serving: checkpoint supplies weights; avoids HF download.
        self.backbone = timm.create_model(base_backbone, pretrained=pretrained, num_classes=0)
        feat_dim = self.backbone.num_features
        self.feat_dim = feat_dim
        self.d_model = d_model

        if use_lora_adapters:
            self.adapters = MultiViewLoRA(feat_dim, rank=lora_rank)
        else:
            self.adapters = None

        self.proj = nn.Linear(feat_dim, d_model)
        self.norm = nn.LayerNorm(d_model)

    def forward_features(self, images: torch.Tensor, view_idx: torch.Tensor) -> torch.Tensor:
        """Extract per-image features with view-specific adapter.

        Args:
            images: ``[N, C, H, W]`` tensor of cropped view images.
            view_idx: ``[N]`` long tensor mapping each image to a view index.
        Returns:
            ``[N, d_model]`` view-conditioned embeddings.
        """
        # Backbone features (shared) — fully batched.
        feats = self.backbone(images)  # [N, feat_dim]

        if self.use_lora_adapters and self.adapters is not None:
            feats = self.adapters(feats, view_idx)

        feats = self.proj(feats)
        feats = self.norm(feats)
        return feats


# --------------------------------------------------------------------------- #
# Metadata Encoder                                                             #
# --------------------------------------------------------------------------- #
@dataclass
class MetadataVocab:
    """Vocabulary sizes for each metadata field (1 = <unk> token reserved)."""
    habitat: int = 50
    substrate: int = 50
    smell: int = 50
    country: int = 200


class MetadataEncoder(nn.Module):
    """Encode categorical metadata (habitat/substrate/smell/country) → dense.

    Each field gets its own embedding table. Embeddings are concatenated and
    passed through a small MLP to produce an ``embed_dim`` vector.
    """

    def __init__(
        self,
        embed_dim: int = 64,
        vocab: MetadataVocab | None = None,
        use_habitat: bool = True,
        use_substrate: bool = True,
        use_smell: bool = True,
        use_country: bool = True,
    ) -> None:
        super().__init__()
        if vocab is None:
            vocab = MetadataVocab()
        self.use_habitat = use_habitat
        self.use_substrate = use_substrate
        self.use_smell = use_smell
        self.use_country = use_country

        self.habitat_emb = nn.Embedding(vocab.habitat, 32, padding_idx=0) if use_habitat else None
        self.substrate_emb = nn.Embedding(vocab.substrate, 32, padding_idx=0) if use_substrate else None
        self.smell_emb = nn.Embedding(vocab.smell, 32, padding_idx=0) if use_smell else None
        self.country_emb = nn.Embedding(vocab.country, 32, padding_idx=0) if use_country else None

        in_dim = sum(32 for flag in (use_habitat, use_substrate, use_smell, use_country) if flag)
        self.mlp = nn.Sequential(
            nn.Linear(in_dim, embed_dim * 2),
            nn.GELU(),
            nn.Linear(embed_dim * 2, embed_dim),
        )

    def forward(
        self,
        habitat: torch.Tensor | None = None,
        substrate: torch.Tensor | None = None,
        smell: torch.Tensor | None = None,
        country: torch.Tensor | None = None,
    ) -> torch.Tensor:
        parts: list[torch.Tensor] = []
        if self.use_habitat and habitat is not None:
            parts.append(self.habitat_emb(habitat))
        if self.use_substrate and substrate is not None:
            parts.append(self.substrate_emb(substrate))
        if self.use_smell and smell is not None:
            parts.append(self.smell_emb(smell))
        if self.use_country and country is not None:
            parts.append(self.country_emb(country))
        if not parts:
            dev = next(self.parameters()).device
            return torch.zeros(1, self.mlp[-1].out_features, device=dev)
        cat = torch.cat(parts, dim=-1)
        return self.mlp(cat)


# --------------------------------------------------------------------------- #
# Attention Fusion Pooling                                                     #
# --------------------------------------------------------------------------- #
class AttentionFusion(nn.Module):
    """Late fusion of N visual embeddings + optional metadata via attention.

    The N visual tokens (one per view image) plus an optional metadata token
    are passed through a single transformer encoder layer. The output token
    (CLS-style) is the observation-level embedding via attention-weighted sum.

    Supports batched input: [B, S, d_model] where S = max_views + metadata.
    Padded positions are masked via the ``mask`` parameter.
    """

    def __init__(
        self,
        d_model: int = 1024,
        metadata_dim: int = 64,
        num_heads: int = 4,
        max_views: int = 10,
        include_metadata_token: bool = True,
    ) -> None:
        super().__init__()
        self.d_model = d_model
        self.metadata_dim = metadata_dim
        self.max_views = max_views
        self.include_metadata_token = include_metadata_token

        self.metadata_proj = (
            nn.Linear(metadata_dim, d_model) if include_metadata_token else None
        )

        # Learnable per-view type embedding (added to each token).
        self.view_pos_emb = nn.Embedding(NUM_VIEWS + 1, d_model)  # +1 for unknown

        self.norm1 = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, num_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(d_model)

        # Attention pooling query (learnable).
        self.pool_query = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)

    def forward(
        self,
        visual_embeddings: torch.Tensor,  # [N, d_model] or [B, S, d_model]
        view_idx: torch.Tensor,           # [N] or [B, S] long
        metadata_emb: torch.Tensor | None = None,  # [1, metadata_dim] or [B, metadata_dim] or None
        mask: torch.Tensor | None = None, # [N] or [B, S] bool, True = valid token
    ) -> torch.Tensor:
        """Fuse N view embeddings into observation embedding(s).

        Accepts either:
        - Unbatched: single observation [N, d_model] → [d_model]
        - Batched: [B, S, d_model] → [B, d_model]

        Returns ``[d_model]`` (single observation, unbatched) or ``[B, d_model]``
        if called with batched inputs.
        """
        is_batched = visual_embeddings.dim() == 3

        if is_batched:
            return self._forward_batched(visual_embeddings, view_idx, metadata_emb, mask)
        return self._forward_single(visual_embeddings, view_idx, metadata_emb, mask)

    def _forward_single(
        self,
        visual_embeddings: torch.Tensor,
        view_idx: torch.Tensor,
        metadata_emb: torch.Tensor | None,
        mask: torch.Tensor | None,
    ) -> torch.Tensor:
        """Single observation: [N, d_model] → [d_model]."""
        safe_view_idx = view_idx.clamp(min=0)
        view_pe = self.view_pos_emb(safe_view_idx)
        tokens = visual_embeddings + view_pe

        if self.include_metadata_token and metadata_emb is not None and self.metadata_proj is not None:
            meta_tok = self.metadata_proj(metadata_emb)
            tokens = torch.cat([meta_tok, tokens], dim=0)
            if mask is not None:
                mask = torch.cat([torch.ones(1, dtype=torch.bool, device=mask.device), mask])

        tokens = tokens.unsqueeze(0)
        attn_out, _ = self.attn(tokens, tokens, tokens)
        tokens = self.norm1(tokens + attn_out)
        tokens = self.norm2(tokens)

        q = self.pool_query
        scores = (tokens * q).sum(dim=-1)
        if mask is not None:
            scores = scores.masked_fill(~mask.unsqueeze(0), float("-inf"))
        weights = F.softmax(scores, dim=-1)
        fused = (tokens * weights.unsqueeze(-1)).sum(dim=1)
        return fused.squeeze(0)

    def _forward_batched(
        self,
        visual_embeddings: torch.Tensor,  # [B, S, d_model]
        view_idx: torch.Tensor,           # [B, S]
        metadata_emb: torch.Tensor | None,  # [B, metadata_dim]
        mask: torch.Tensor | None,        # [B, S] bool
    ) -> torch.Tensor:
        """Batched fusion: [B, S, d_model] → [B, d_model]."""
        B, S, _ = visual_embeddings.shape

        safe_view_idx = view_idx.clamp(min=0)  # [B, S]
        view_pe = self.view_pos_emb(safe_view_idx)  # [B, S, d_model]
        tokens = visual_embeddings + view_pe

        # Prepend metadata token.
        if self.include_metadata_token and metadata_emb is not None and self.metadata_proj is not None:
            meta_tok = self.metadata_proj(metadata_emb).unsqueeze(1)  # [B, 1, d_model]
            tokens = torch.cat([meta_tok, tokens], dim=1)  # [B, S+1, d_model]
            if mask is not None:
                meta_mask = torch.ones(B, 1, dtype=mask.dtype, device=mask.device)
                mask = torch.cat([meta_mask, mask], dim=1)  # [B, S+1]

        # Transformer encoder layer (batched).
        # key_padding_mask: True = position should be IGNORED (PyTorch convention).
        key_padding_mask = ~mask if mask is not None else None
        attn_out, _ = self.attn(tokens, tokens, tokens, key_padding_mask=key_padding_mask)
        tokens = self.norm1(tokens + attn_out)
        tokens = self.norm2(tokens)

        # Attention pooling.
        q = self.pool_query.expand(B, -1, -1)  # [B, 1, d_model]
        scores = (tokens * q).sum(dim=-1)  # [B, S+1]
        if mask is not None:
            scores = scores.masked_fill(~mask, float("-inf"))
        weights = F.softmax(scores, dim=-1)  # [B, S+1]
        fused = (tokens * weights.unsqueeze(-1)).sum(dim=1)  # [B, d_model]
        return fused


# --------------------------------------------------------------------------- #
# ArcFace Head                                                                 #
# --------------------------------------------------------------------------- #
class ArcFaceHead(nn.Module):
    """ArcFace metric-learning head for open-set rejection.

    During training, applies an angular margin penalty to the logit of the
    ground-truth class. At inference, returns cosine similarities which can be
    compared against class centroids for open-set rejection.
    """

    def __init__(
        self,
        in_features: int,
        num_classes: int,
        s: float = 30.0,
        m: float = 0.50,
    ) -> None:
        super().__init__()
        self.in_features = in_features
        self.num_classes = num_classes
        self.s = s
        self.m = m
        self.weight = nn.Parameter(torch.randn(num_classes, in_features))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, embeddings: torch.Tensor, labels: torch.Tensor | None = None) -> torch.Tensor:
        """Compute logits (ArcFace-marginized during training).

        Args:
            embeddings: ``[B, in_features]`` L2-normalized-ready embeddings.
            labels: ``[B]`` long labels. If provided, training margin is applied.
        Returns:
            ``[B, num_classes]`` logits.
        """
        emb = F.normalize(embeddings, p=2, dim=-1)
        w = F.normalize(self.weight, p=2, dim=-1)
        cosine = emb @ w.t()
        cosine = cosine.clamp(-1 + 1e-7, 1 - 1e-7)

        if labels is not None:
            one_hot = torch.zeros_like(cosine)
            one_hot.scatter_(1, labels.unsqueeze(1), 1.0)
            theta = torch.acos(cosine)
            theta_target = theta + (one_hot * self.m)
            logits = torch.cos(theta_target) * self.s
        else:
            logits = cosine * self.s
        return logits

    @torch.no_grad()
    def cosine_to_centroids(self, embeddings: torch.Tensor) -> torch.Tensor:
        """Pure cosine similarity (for open-set inference)."""
        emb = F.normalize(embeddings, p=2, dim=-1)
        w = F.normalize(self.weight, p=2, dim=-1)
        return emb @ w.t()


# --------------------------------------------------------------------------- #
# Temperature Calibration (fixed — single param, no duplication)               #
# --------------------------------------------------------------------------- #
class TemperatureScaler(nn.Module):
    """Per-view-combination temperature scaling for calibrated confidence.

    Holds ``num_view_combos`` log-temperature parameters. The caller selects
    which temperature to apply based on which views are present in the observation.
    """

    def __init__(self, num_view_combos: int = 16) -> None:
        super().__init__()
        self.num_view_combos = num_view_combos
        # Single parameter: log_temperature (exp gives actual T).
        self.log_temp = nn.Parameter(torch.zeros(num_view_combos))

    def forward(self, logits: torch.Tensor, combo_idx: int = 0) -> torch.Tensor:
        t = self.log_temp[combo_idx].exp().clamp(min=0.1)
        return logits / t


# --------------------------------------------------------------------------- #
# Full Multi-View Model                                                        #
# --------------------------------------------------------------------------- #
@dataclass
class MultiViewConfig:
    base_backbone: str = "convnextv2_base.fcmae_ft_in22k_in1k"
    d_model: int = 1024
    lora_rank: int = 16
    use_lora_adapters: bool = True
    use_arcface: bool = True
    arcface_s: float = 30.0
    arcface_m: float = 0.50
    metadata_embed_dim: int = 64
    fusion_num_heads: int = 4
    max_views: int = 10
    include_metadata_token: bool = True
    use_habitat: bool = True
    use_substrate: bool = True
    use_smell: bool = True
    use_country: bool = True
    use_foundation_ensemble: bool = False
    foundation_models: tuple[str, ...] = ("dinov2_base", "beit_fungi")


class MultiViewModel(nn.Module):
    """End-to-end multi-view mushroom classification model.

    Combines: ViewConditionedBackbone + MetadataEncoder + AttentionFusion +
    (optional) ArcFaceHead. Designed for variable numbers of views per obs.

    Supports two forward modes:
    1. **Single observation** (legacy): images [N, C, H, W] → logits [1, C]
    2. **Batched**: images [B, S, C, H, W], view_idx [B, S], padding_mask [B, S]
       → logits [B, num_classes]
    """

    def __init__(self, cfg: MultiViewConfig, num_classes: int) -> None:
        super().__init__()
        self.cfg = cfg
        self.num_classes = num_classes

        self.backbone = ViewConditionedBackbone(
            base_backbone=cfg.base_backbone,
            d_model=cfg.d_model,
            lora_rank=cfg.lora_rank,
            use_lora_adapters=cfg.use_lora_adapters,
        )
        self.metadata_encoder = MetadataEncoder(
            embed_dim=cfg.metadata_embed_dim,
            use_habitat=cfg.use_habitat,
            use_substrate=cfg.use_substrate,
            use_smell=cfg.use_smell,
            use_country=cfg.use_country,
        )
        self.fusion = AttentionFusion(
            d_model=cfg.d_model,
            metadata_dim=cfg.metadata_embed_dim,
            num_heads=cfg.fusion_num_heads,
            max_views=cfg.max_views,
            include_metadata_token=cfg.include_metadata_token,
        )
        if cfg.use_arcface:
            self.head = ArcFaceHead(
                in_features=cfg.d_model,
                num_classes=num_classes,
                s=cfg.arcface_s,
                m=cfg.arcface_m,
            )
        else:
            self.head = nn.Linear(cfg.d_model, num_classes)

    def forward(
        self,
        images: torch.Tensor,
        view_idx: torch.Tensor,
        metadata: dict | None = None,
        mask: torch.Tensor | None = None,
        labels: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Forward pass.

        **Single observation mode:**
            images: [N, C, H, W], view_idx: [N]
            Returns: logits [1, num_classes], embedding [d_model]

        **Batched mode** (images.dim() == 5):
            images: [B, S, C, H, W], view_idx: [B, S], mask: [B, S] bool
            metadata: dict of [B] tensors
            Returns: logits [B, num_classes], embedding [B, d_model]
        """
        if images.dim() == 5:
            return self._forward_batched(images, view_idx, metadata, mask, labels)
        return self._forward_single(images, view_idx, metadata, mask, labels)

    def _forward_single(
        self,
        images: torch.Tensor,
        view_idx: torch.Tensor,
        metadata: dict | None,
        mask: torch.Tensor | None,
        labels: torch.Tensor | None,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        feats = self.backbone.forward_features(images, view_idx)

        meta_emb = None
        if metadata is not None:
            meta_emb = self.metadata_encoder(**metadata)

        fused = self.fusion(feats, view_idx, meta_emb, mask)
        fused = fused.unsqueeze(0)

        if isinstance(self.head, ArcFaceHead):
            logits = self.head(fused, labels)
        else:
            logits = self.head(fused)
        return logits, fused.squeeze(0)

    def _forward_batched(
        self,
        images: torch.Tensor,  # [B, S, C, H, W]
        view_idx: torch.Tensor,  # [B, S]
        metadata: dict | None,
        mask: torch.Tensor | None,  # [B, S] bool, True = valid
        labels: torch.Tensor | None,  # [B] long
    ) -> tuple[torch.Tensor, torch.Tensor]:
        B, S, C, H, W = images.shape

        # Flatten views for backbone: [B*S, C, H, W]
        flat_images = images.view(B * S, C, H, W)
        flat_view_idx = view_idx.view(B * S)

        # Backbone features (batched across all views of all observations).
        flat_feats = self.backbone.forward_features(flat_images, flat_view_idx)  # [B*S, d_model]

        # Reshape back: [B, S, d_model]
        feats = flat_feats.view(B, S, -1)

        # Metadata encoding.
        meta_emb = None
        if metadata is not None:
            meta_emb = self.metadata_encoder(**metadata)  # [B, metadata_dim]

        # Batched fusion.
        fused = self.fusion(feats, view_idx, meta_emb, mask)  # [B, d_model]

        if isinstance(self.head, ArcFaceHead):
            logits = self.head(fused, labels)
        else:
            logits = self.head(fused)
        return logits, fused

    @torch.no_grad()
    def extract_embedding(
        self,
        images: torch.Tensor,
        view_idx: torch.Tensor,
        metadata: dict | None = None,
        mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Extract observation-level embedding without logits (for open-set)."""
        _, emb = self.forward(images, view_idx, metadata, mask, labels=None)
        return emb


# --------------------------------------------------------------------------- #
# Loss functions                                                               #
# --------------------------------------------------------------------------- #
class CenterLoss(nn.Module):
    """Center loss for intra-class cohesion.

    Maintains learnable class centers and penalizes embeddings far from their
    class center, improving cluster separability in the embedding space.
    """

    def __init__(self, num_classes: int, feat_dim: int) -> None:
        super().__init__()
        self.centers = nn.Parameter(torch.randn(num_classes, feat_dim))

    def forward(self, embeddings: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
        batch_centers = self.centers[labels]
        return ((embeddings - batch_centers) ** 2).sum(dim=-1).mean()


class FocalLoss(nn.Module):
    """Focal Loss with class weights for long-tail distributions.

    FL(p_t) = -alpha_t * (1 - p_t)^gamma * log(p_t)

    When ``class_weights`` is provided, applies per-class weighting to handle
    class imbalance (common in fungi datasets with hundreds of rare species).
    """

    def __init__(
        self,
        gamma: float = 2.0,
        alpha: float | None = None,
        label_smoothing: float = 0.0,
        reduction: str = "mean",
    ) -> None:
        super().__init__()
        self.gamma = gamma
        self.alpha = alpha
        self.label_smoothing = label_smoothing
        self.reduction = reduction

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """Compute focal loss.

        Args:
            logits: [B, C] raw logits.
            targets: [B] class indices.
        """
        num_classes = logits.size(1)
        if self.label_smoothing > 0:
            soft_targets = torch.full_like(
                logits, self.label_smoothing / (num_classes - 1)
            )
            soft_targets.scatter_(1, targets.unsqueeze(1), 1.0 - self.label_smoothing)
            log_probs = F.log_softmax(logits, dim=-1)
            ce = -(soft_targets * log_probs).sum(dim=-1)
            probs = log_probs.exp()
            p_t = (soft_targets * probs).sum(dim=-1)
        else:
            ce = F.cross_entropy(logits, targets, reduction="none")
            probs = F.softmax(logits, dim=-1)
            p_t = probs.gather(1, targets.unsqueeze(1)).squeeze(1)

        focal_weight = (1.0 - p_t) ** self.gamma
        loss = focal_weight * ce

        if self.alpha is not None:
            # Per-class alpha weighting.
            alpha_t = torch.full_like(logits, self.alpha)
            alpha_t = alpha_t.gather(1, targets.unsqueeze(1)).squeeze(1)
            loss = alpha_t * loss

        if self.reduction == "mean":
            return loss.mean()
        elif self.reduction == "sum":
            return loss.sum()
        return loss


class TripletLoss(nn.Module):
    """Batch-hard triplet loss for embedding space separation.

    For each anchor, selects the hardest positive (max distance same class)
    and hardest negative (min distance different class) within the batch.
    Improves open-set rejection by pushing apart species embeddings.
    """

    def __init__(self, margin: float = 0.3) -> None:
        super().__init__()
        self.margin = margin

    def forward(self, embeddings: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
        """Batch-hard triplet loss.

        Args:
            embeddings: [B, D] L2-normalizable embeddings.
            labels: [B] class labels.
        """
        if embeddings.size(0) < 2:
            return torch.tensor(0.0, device=embeddings.device)

        # Normalize embeddings.
        emb = F.normalize(embeddings, p=2, dim=-1)

        # Pairwise distance matrix (squared euclidean on normalized = 2 - 2*cos).
        dist = torch.cdist(emb, emb, p=2)  # [B, B]

        # Masks for valid positive/negative pairs.
        labels_eq = labels.unsqueeze(0) == labels.unsqueeze(1)  # [B, B]
        labels_ne = ~labels_eq

        # Hardest positive: max distance among same-class samples.
        # Set diagonal to inf so we don't pick self.
        eye = torch.eye(dist.size(0), dtype=torch.bool, device=dist.device)
        pos_dist = dist.masked_fill(~labels_eq | eye, float("-inf"))
        hardest_pos = pos_dist.max(dim=1).values  # [B]

        # Hardest negative: min distance among different-class samples.
        neg_dist = dist.masked_fill(~labels_ne, float("inf"))
        hardest_neg = neg_dist.min(dim=1).values  # [B]

        # Triplet loss: max(0, hardest_pos - hardest_neg + margin).
        # Only for samples that have at least one positive and one negative.
        has_pos = labels_eq.fill_diagonal_(False).any(dim=1)
        has_neg = labels_ne.any(dim=1)
        valid = has_pos & has_neg

        if valid.sum() == 0:
            return torch.tensor(0.0, device=embeddings.device)

        loss = F.relu(hardest_pos[valid] - hardest_neg[valid] + self.margin)
        return loss.mean()


def view_consistency_loss(
    embeddings_a: torch.Tensor,
    embeddings_b: torch.Tensor,
) -> torch.Tensor:
    """Encourage same-species observations to have close embeddings."""
    return F.mse_loss(embeddings_a, embeddings_b)


# --------------------------------------------------------------------------- #
# Progressive resizing helper                                                 #
# --------------------------------------------------------------------------- #
class ProgressiveResizing:
    """Schedule image size changes across epochs for training efficiency."""

    def __init__(self, schedule: Sequence[tuple[int, int, int]]) -> None:
        self.schedule = sorted(schedule, key=lambda x: x[0])

    def get_image_size(self, epoch: int) -> int:
        for start, end, size in self.schedule:
            if start <= epoch < end:
                return size
        return self.schedule[-1][2]


# --------------------------------------------------------------------------- #
# MixUp at observation level                                                   #
# --------------------------------------------------------------------------- #
def observation_mixup_lambda(alpha: float = 0.2) -> float:
    """Sample a MixUp lambda for observation-level mixing."""
    if alpha <= 0:
        return 1.0
    lam = float(torch.distributions.Beta(alpha, alpha).sample())
    return max(lam, 1.0 - lam)


def view_combo_index(view_idx: torch.Tensor) -> int:
    """Map a set of present views to a combo bucket index (0..15).

    Uses a bitmask over the 4 canonical views. E.g. gills+front = 0b0011 = 3.
    Unknown views (index -1) are ignored.
    """
    mask_bits = 0
    for v in view_idx.tolist():
        if 0 <= v < NUM_VIEWS:
            mask_bits |= 1 << v
    return mask_bits & 0xF


def view_combo_index_batched(view_idx: torch.Tensor) -> torch.Tensor:
    """Vectorized version of view_combo_index for batched inputs.

    Args:
        view_idx: [B, S] long tensor of view indices.
    Returns:
        [B] long tensor of combo indices in [0, 15].
    """
    # Clamp -1 to a value that doesn't set any bit (use a large index > NUM_VIEWS).
    safe = view_idx.clamp(min=0)
    valid = (view_idx >= 0) & (view_idx < NUM_VIEWS)  # [B, S] bool

    # Build bitmask: for each position, if valid, set bit (1 << view_idx).
    bit_values = torch.where(valid, torch.ones_like(safe), torch.zeros_like(safe))
    # Shift: 1 << safe, but only if valid.
    shifted = torch.bitwise_left_shift(bit_values, safe.clamp(max=NUM_VIEWS - 1))

    # OR all positions together per batch element.
    combo = shifted.sum(dim=1).clamp(0, 15)
    return combo
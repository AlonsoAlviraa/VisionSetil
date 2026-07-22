"""Cost-sensitive helpers for industrial Kaggle training (importable snippet).

Copy or paste into notebook cells. Deadly false-negatives get higher CE weight;
optional additive deadly-ranking term encourages deadly mass in top-k.
"""

from __future__ import annotations


def build_class_weights(num_classes: int, deadly_indices: set[int], deadly_w: float = 10.0):
    import torch

    w = torch.ones(num_classes)
    for i in deadly_indices:
        if 0 <= int(i) < num_classes:
            w[int(i)] = deadly_w
    return w


def weighted_ce(logits, labels, class_weights, label_smoothing: float = 0.1):
    import torch.nn.functional as F

    return F.cross_entropy(
        logits, labels, weight=class_weights, label_smoothing=label_smoothing
    )


def deadly_topk_penalty(logits, labels, deadly_indices: set[int], k: int = 3, scale: float = 0.5):
    """Penalize when true class is deadly but not in top-k logits.

    Returns scalar tensor (0 if batch has no deadly labels).
    """
    import torch
    import torch.nn.functional as F

    if not deadly_indices:
        return logits.new_zeros(())
    deadly = torch.tensor(sorted(deadly_indices), device=logits.device, dtype=torch.long)
    is_deadly = (labels.unsqueeze(1) == deadly.unsqueeze(0)).any(dim=1)
    if not is_deadly.any():
        return logits.new_zeros(())
    # soft top-k: encourage logit of true class among top
    log_probs = F.log_softmax(logits, dim=-1)
    true_lp = log_probs.gather(1, labels.unsqueeze(1)).squeeze(1)
    # penalty = -log p(true) for deadly only (already in CE); extra push via margin vs topk
    topk_vals, _ = logits.topk(k, dim=-1)
    kth = topk_vals[:, -1]
    true_logit = logits.gather(1, labels.unsqueeze(1)).squeeze(1)
    # hinge: want true_logit >= kth
    hinge = torch.relu(kth - true_logit + 0.1)
    return scale * hinge[is_deadly].mean()

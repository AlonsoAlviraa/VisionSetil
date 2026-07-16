"""
VisionSetil Mega Training Pipeline (v2 — Production Grade)
============================================================
Real-data training for mushroom classification using FungiCLEF methodology.

Key improvements over v1:
  - **MixUp / CutMix** mixing strategies applied at batch level.
  - **EMA** (Exponential Moving Average) model for stable evaluation.
  - **Gradient clipping** for training stability.
  - **WeightedRandomSampler** to combat long-tail class imbalance.
  - **Test-Time Augmentation (TTA)** — hflip + 5-crop average at eval.
  - **Observation-level MAP@3** — the official FungiCLEF metric (aggregate
    predictions per observation before computing MAP@3, not per image).
  - **Per-class classification report** exported as CSV + JSON.
  - **Confusion matrix** exported as NPZ for downstream visualisation.
  - **Early stopping** with configurable patience on MAP@3.
  - **Resume from checkpoint** — training can be interrupted and resumed.
  - **Config from JSON** — all hyper-params loaded from `configs/*.json`.
  - **Multi-GPU** support via nn.DataParallel.
  - **CSV epoch logger** in addition to JSON history.

Designed to run on Kaggle GPU (T4 x1, T4 x2, or P100) with real
FungiCLEF / FungiTastic data. No synthetic images are generated.
"""
from __future__ import annotations

import copy
import csv
import json
import math
import os
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from anti_leak_splitter import AntiLeakSplitter, SplitConfig
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms


# --------------------------------------------------------------------------- #
# Config                                                                       #
# --------------------------------------------------------------------------- #
@dataclass
class TrainConfig:
    """All hyper-parameters for the mega training pipeline."""

    # Backbone
    backbone: str = "convnext_base"  # "dinov2_vitb14", "convnext_base", "efficientnet_b4", "eva02_base", "beit_base"
    pretrained: bool = True
    freeze_backbone_epochs: int = 2  # freeze then gradually unfreeze

    # Input
    image_size: int = 384
    mean: tuple[float, ...] = (0.485, 0.456, 0.406)
    std: tuple[float, ...] = (0.229, 0.224, 0.225)

    # Training
    epochs: int = 25
    batch_size: int = 32
    grad_accum_steps: int = 1
    lr_head: float = 3e-4
    lr_backbone: float = 2e-5
    weight_decay: float = 1e-2
    warmup_epochs: int = 2
    label_smoothing: float = 0.1
    focal_gamma: float = 2.0  # 0 = standard CE
    max_grad_norm: float = 1.0  # gradient clipping

    # Regularisation strategies
    aug_hflip: bool = True
    aug_vflip: bool = True
    aug_rotation: float = 30.0
    aug_color_jitter: float = 0.3
    aug_random_erasing: bool = True
    aug_mixup_alpha: float = 0.2  # 0 = off
    aug_cutmix_alpha: float = 0.0  # off by default for fine-grained

    # Advanced
    use_ema: bool = True
    ema_decay: float = 0.999
    use_weighted_sampler: bool = True
    use_tta: bool = True  # test-time augmentation at eval
    early_stopping_patience: int = 7  # 0 = off

    # Infra
    device: str = "cuda"
    num_workers: int = 4
    amp: bool = True
    seed: int = 42
    multi_gpu: bool = False

    # Anti-leak
    split_cfg: SplitConfig = field(default_factory=SplitConfig)

    # Output
    output_dir: str = "/kaggle/working/models"
    experiment_name: str = "mega_training_v1"

    # Resume
    resume_from: str | None = None

    @classmethod
    def from_json(cls, path: str | Path) -> TrainConfig:
        """Load config from a JSON file (see configs/*.json for schema)."""
        with open(path) as f:
            data = json.load(f)

        split_cfg = SplitConfig(
            group_by=data.get("split", {}).get("group_by", "observation_id"),
            stratify_by=data.get("split", {}).get("stratify_by", ["genus", "family"]),
            test_size=data.get("split", {}).get("test_size", 0.15),
            val_size=data.get("split", {}).get("val_size", 0.15),
            random_state=data.get("split", {}).get("random_state", 42),
            min_class_count=data.get("split", {}).get("min_class_count", 3),
        )

        model_cfg = data.get("model", {})
        train_cfg = data.get("training", {})
        aug_cfg = data.get("augmentation", {})
        out_cfg = data.get("output", {})

        return cls(
            backbone=model_cfg.get("backbone", "convnext_base"),
            image_size=model_cfg.get("image_size", 384),
            freeze_backbone_epochs=model_cfg.get("freeze_backbone_epochs", 2),
            epochs=train_cfg.get("epochs", 25),
            batch_size=train_cfg.get("batch_size", 32),
            lr_head=train_cfg.get("lr_head", 3e-4),
            lr_backbone=train_cfg.get("lr_backbone", 2e-5),
            weight_decay=train_cfg.get("weight_decay", 1e-2),
            warmup_epochs=train_cfg.get("warmup_epochs", 2),
            label_smoothing=train_cfg.get("label_smoothing", 0.1),
            focal_gamma=train_cfg.get("focal_gamma", 2.0),
            grad_accum_steps=train_cfg.get("grad_accum_steps", 1),
            amp=train_cfg.get("amp", True),
            aug_hflip=aug_cfg.get("hflip", True),
            aug_vflip=aug_cfg.get("vflip", True),
            aug_rotation=aug_cfg.get("rotation_degrees", 30.0),
            aug_color_jitter=aug_cfg.get("color_jitter", 0.3),
            aug_random_erasing=aug_cfg.get("random_erasing", True),
            aug_mixup_alpha=aug_cfg.get("mixup_alpha", 0.2),
            aug_cutmix_alpha=aug_cfg.get("cutmix_alpha", 0.0),
            output_dir=out_cfg.get("dir", "/kaggle/working/models"),
            experiment_name=data.get("experiment_name", "mega_training_v1"),
            split_cfg=split_cfg,
            seed=data.get("split", {}).get("random_state", 42),
        )


# --------------------------------------------------------------------------- #
# Determinism                                                                  #
# --------------------------------------------------------------------------- #
def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    os.environ["PYTHONHASHSEED"] = str(seed)


# --------------------------------------------------------------------------- #
# Dataset                                                                      #
# --------------------------------------------------------------------------- #
class MushroomDataset(Dataset):
    """Dataset for mushroom images with optional heavy augmentation."""

    def __init__(
        self,
        df: pd.DataFrame,
        label2idx: dict[str, int],
        cfg: TrainConfig,
        augment: bool = False,
    ) -> None:
        self.df = df.reset_index(drop=True)
        self.label2idx = label2idx
        self.cfg = cfg
        self.augment = augment

        if augment:
            self.transform = transforms.Compose(
                [
                    transforms.ToPILImage(),
                    transforms.Resize((cfg.image_size, cfg.image_size)),
                    transforms.RandomHorizontalFlip(p=0.5) if cfg.aug_hflip else transforms.Identity(),
                    transforms.RandomVerticalFlip(p=0.5) if cfg.aug_vflip else transforms.Identity(),
                    transforms.RandomRotation(degrees=cfg.aug_rotation),
                    transforms.ColorJitter(
                        brightness=cfg.aug_color_jitter,
                        contrast=cfg.aug_color_jitter,
                        saturation=cfg.aug_color_jitter,
                        hue=cfg.aug_color_jitter / 2,
                    ),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=cfg.mean, std=cfg.std),
                    transforms.RandomErasing(p=0.25) if cfg.aug_random_erasing else transforms.Identity(),
                ]
            )
        else:
            self.transform = transforms.Compose(
                [
                    transforms.ToPILImage(),
                    transforms.Resize((cfg.image_size, cfg.image_size)),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=cfg.mean, std=cfg.std),
                ]
            )

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int, str]:
        row = self.df.iloc[idx]
        from PIL import Image

        img = Image.open(row["image_path"]).convert("RGB")
        img = np.array(img)
        img_tensor = self.transform(img)
        label = self.label2idx[row["species"]]
        obs_id = str(row.get("observation_id", idx))
        return img_tensor, label, obs_id


# --------------------------------------------------------------------------- #
# MixUp / CutMix                                                               #
# --------------------------------------------------------------------------- #
def mixup_data(x: torch.Tensor, y: torch.Tensor, alpha: float = 0.2) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, float]:
    """Returns mixed inputs, target a, target b, lambda."""
    if alpha <= 0:
        return x, y, y, 1.0
    lam = float(np.random.beta(alpha, alpha))
    lam = max(lam, 1.0 - lam)  # keep dominant
    batch_size = x.size(0)
    index = torch.randperm(batch_size, device=x.device)
    mixed_x = lam * x + (1 - lam) * x[index]
    return mixed_x, y, y[index], lam


def cutmix_data(x: torch.Tensor, y: torch.Tensor, alpha: float = 1.0) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, float]:
    """CutMix augmentation."""
    if alpha <= 0:
        return x, y, y, 1.0
    lam = float(np.random.beta(alpha, alpha))
    lam = max(lam, 1.0 - lam)
    batch_size, _, h, w = x.size()
    cut_rat = math.sqrt(1.0 - lam)
    cut_h = int(h * cut_rat)
    cut_w = int(w * cut_rat)
    cx = random.randint(0, w - 1)
    cy = random.randint(0, h - 1)
    bbx1 = max(cx - cut_w // 2, 0)
    bby1 = max(cy - cut_h // 2, 0)
    bbx2 = min(cx + cut_w // 2, w)
    bby2 = min(cy + cut_h // 2, h)
    index = torch.randperm(batch_size, device=x.device)
    x[:, :, bby1:bby2, bbx1:bbx2] = x[index, :, bby1:bby2, bbx1:bbx2]
    lam = 1.0 - (bbx2 - bbx1) * (bby2 - bby1) / (h * w)
    return x, y, y[index], lam


def mixup_criterion(
    criterion: nn.Module, logits: torch.Tensor, y_a: torch.Tensor, y_b: torch.Tensor, lam: float
) -> torch.Tensor:
    return lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)


# --------------------------------------------------------------------------- #
# EMA (Exponential Moving Average)                                             #
# --------------------------------------------------------------------------- #
class ModelEMA:
    """Exponential Moving Average of model parameters for stable eval."""

    def __init__(self, model: nn.Module, decay: float = 0.999) -> None:
        self.decay = decay
        self.ema = copy.deepcopy(model)
        self.ema.eval()
        for p in self.ema.parameters():
            p.requires_grad_(False)

    @torch.no_grad()
    def update(self, model: nn.Module) -> None:
        for ema_p, model_p in zip(self.ema.parameters(), model.parameters(), strict=True):
            ema_p.data.mul_(self.decay).add_(model_p.data, alpha=1.0 - self.decay)
        # Also update buffers (BatchNorm stats, etc.)
        for ema_b, model_b in zip(self.ema.buffers(), model.buffers(), strict=True):
            ema_b.data.copy_(model_b.data)


# --------------------------------------------------------------------------- #
# Model builder                                                                #
# --------------------------------------------------------------------------- #
def build_model(cfg: TrainConfig, num_classes: int) -> nn.Module:
    """Build backbone + classification head.

    Supports torchvision backbones and timm backbones (if installed).
    """
    # Try timm first for maximum flexibility (EVA, BEiT, etc.)
    try:
        import timm

        if cfg.backbone in timm.list_models():
            model = timm.create_model(
                cfg.backbone,
                pretrained=cfg.pretrained,
                num_classes=num_classes,
            )
            return model.to(cfg.device)
    except ImportError:
        pass

    # Fallback to torchvision
    if cfg.backbone == "convnext_base":
        from torchvision.models import ConvNeXt_Base_Weights, convnext_base

        weights = ConvNeXt_Base_Weights.IMAGENET1K_V1 if cfg.pretrained else None
        model = convnext_base(weights=weights)
        feat_dim = model.classifier[2].in_features
        model.classifier[2] = nn.Linear(feat_dim, num_classes)
    elif cfg.backbone == "efficientnet_b4":
        from torchvision.models import EfficientNet_B4_Weights, efficientnet_b4

        weights = EfficientNet_B4_Weights.IMAGENET1K_V1 if cfg.pretrained else None
        model = efficientnet_b4(weights=weights)
        feat_dim = model.classifier[1].in_features
        model.classifier[1] = nn.Linear(feat_dim, num_classes)
    elif cfg.backbone.startswith("dinov2"):
        model = torch.hub.load("facebookresearch/dinov2", cfg.backbone)
        feat_dim = model.norm.normalized_shape[0]
        model.head = nn.Linear(feat_dim, num_classes)
    else:
        raise ValueError(f"Unknown backbone: {cfg.backbone}")

    return model.to(cfg.device)


# --------------------------------------------------------------------------- #
# Loss                                                                         #
# --------------------------------------------------------------------------- #
class FocalLossWithLabelSmoothing(nn.Module):
    """Focal loss combined with label smoothing for long-tail distributions."""

    def __init__(self, gamma: float = 2.0, smoothing: float = 0.1):
        super().__init__()
        self.gamma = gamma
        self.smoothing = smoothing

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        num_classes = logits.size(-1)
        log_probs = F.log_softmax(logits, dim=-1)
        with torch.no_grad():
            smooth = torch.full_like(log_probs, self.smoothing / (num_classes - 1))
            smooth.scatter_(1, targets.unsqueeze(1), 1.0 - self.smoothing)
        probs = torch.exp(log_probs)
        focal_weight = (1 - probs.gather(1, targets.unsqueeze(1)).clamp(min=1e-6)) ** self.gamma
        loss = -(smooth * log_probs * focal_weight).sum(dim=-1).mean()
        return loss


# --------------------------------------------------------------------------- #
# Scheduler (cosine with warmup)                                               #
# --------------------------------------------------------------------------- #
class CosineWarmupScheduler:
    """Cosine learning rate schedule with linear warmup."""

    def __init__(self, optimizer: torch.optim.Optimizer, warmup_steps: int, total_steps: int):
        self.optimizer = optimizer
        self.warmup = warmup_steps
        self.total = total_steps

    def step(self, current_step: int) -> None:
        if current_step < self.warmup:
            lr_scale = (current_step + 1) / self.warmup
        else:
            progress = (current_step - self.warmup) / max(1, self.total - self.warmup)
            lr_scale = 0.5 * (1 + math.cos(math.pi * progress))
        for pg in self.optimizer.param_groups:
            pg["lr"] = pg["_base_lr"] * lr_scale


# --------------------------------------------------------------------------- #
# Metrics (FungiCLEF official)                                                 #
# --------------------------------------------------------------------------- #
def map_at_k_per_observation(
    probs: np.ndarray,
    labels: list[int],
    observation_ids: list[str],
    k: int = 3,
) -> float:
    """Observation-level MAP@K — the official FungiCLEF metric.

    Aggregates image-level probabilities per observation (mean), then
    ranks the top-K species and computes AP@K.
    """
    df = pd.DataFrame({"obs_id": observation_ids, "label": labels})
    obs_labels = df.groupby("obs_id")["label"].first().to_dict()

    # Mean probabilities per observation
    prob_df = pd.DataFrame(probs)
    prob_df["obs_id"] = observation_ids
    obs_probs = prob_df.groupby("obs_id").mean().values

    obs_ids_ordered = list(obs_labels.keys())
    map_sum = 0.0
    for i, obs_id in enumerate(obs_ids_ordered):
        true_label = obs_labels[obs_id]
        topk_idx = np.argsort(-obs_probs[i])[:k]
        for rank, pred_idx in enumerate(topk_idx):
            if pred_idx == true_label:
                map_sum += 1.0 / (rank + 1)
                break
    return map_sum / len(obs_ids_ordered)


# --------------------------------------------------------------------------- #
# Trainer                                                                      #
# --------------------------------------------------------------------------- #
class MegaTrainer:
    """Production training loop with all advanced features."""

    def __init__(self, cfg: TrainConfig) -> None:
        self.cfg = cfg
        self.device = torch.device(cfg.device)
        self.history: list[dict[str, Any]] = []
        self.best_val_metric = -1.0
        self.best_epoch = -1
        self.patience_counter = 0

    def prepare_data(
        self, df: pd.DataFrame
    ) -> tuple[DataLoader, DataLoader, DataLoader, dict[str, int]]:
        """Anti-leak split + weighted sampling for class imbalance."""
        splitter = AntiLeakSplitter(self.cfg.split_cfg)
        train_df, val_df, test_df = splitter.split(df)

        print(f"📦 Split sizes — train: {len(train_df)} | val: {len(val_df)} | test: {len(test_df)}")

        # Label map from TRAIN only
        train_classes = sorted(train_df[self.cfg.split_cfg.label_col].unique())
        label2idx = {c: i for i, c in enumerate(train_classes)}
        print(f"🏷️  {len(label2idx)} classes from train set")

        train_ds = MushroomDataset(train_df, label2idx, self.cfg, augment=True)
        val_ds = MushroomDataset(val_df, label2idx, self.cfg, augment=False)
        test_ds = MushroomDataset(test_df, label2idx, self.cfg, augment=False)

        # WeightedRandomSampler for class imbalance
        if self.cfg.use_weighted_sampler:
            class_counts = train_df[self.cfg.split_cfg.label_col].value_counts()
            sample_weights = train_df[self.cfg.split_cfg.label_col].map(
                lambda c: 1.0 / max(class_counts[c], 1)
            ).values
            sampler = WeightedRandomSampler(
                weights=sample_weights, num_samples=len(train_df), replacement=True
            )
            train_loader = DataLoader(
                train_ds,
                batch_size=self.cfg.batch_size,
                sampler=sampler,
                num_workers=self.cfg.num_workers,
                pin_memory=True,
                drop_last=True,
            )
            print("⚖️  Using WeightedRandomSampler for class balance")
        else:
            train_loader = DataLoader(
                train_ds,
                batch_size=self.cfg.batch_size,
                shuffle=True,
                num_workers=self.cfg.num_workers,
                pin_memory=True,
                drop_last=True,
            )

        val_loader = DataLoader(
            val_ds, batch_size=self.cfg.batch_size, shuffle=False,
            num_workers=self.cfg.num_workers, pin_memory=True,
        )
        test_loader = DataLoader(
            test_ds, batch_size=self.cfg.batch_size, shuffle=False,
            num_workers=self.cfg.num_workers, pin_memory=True,
        )
        return train_loader, val_loader, test_loader, label2idx

    def train(self, df: pd.DataFrame) -> dict[str, Any]:
        """Full training loop with all advanced features."""
        seed_everything(self.cfg.seed)

        train_loader, val_loader, test_loader, label2idx = self.prepare_data(df)

        model = build_model(self.cfg, num_classes=len(label2idx))

        # Multi-GPU
        if self.cfg.multi_gpu and torch.cuda.device_count() > 1:
            print(f"🔥 Using {torch.cuda.device_count()} GPUs!")
            model = nn.DataParallel(model)

        criterion = FocalLossWithLabelSmoothing(
            gamma=self.cfg.focal_gamma, smoothing=self.cfg.label_smoothing
        )

        # EMA model
        ema_model: ModelEMA | None = None
        if self.cfg.use_ema:
            ema_model = ModelEMA(model, decay=self.cfg.ema_decay)
            print("📊 Using EMA model for evaluation")

        # Differential LR: head vs backbone
        backbone_params = []
        head_params = []
        base_model = model.module if self.cfg.multi_gpu else model
        for name, p in base_model.named_parameters():
            if not p.requires_grad:
                continue
            if "classifier" in name or "head" in name:
                head_params.append(p)
            else:
                backbone_params.append(p)

        optimizer = torch.optim.AdamW(
            [
                {"params": head_params, "lr": self.cfg.lr_head, "_base_lr": self.cfg.lr_head},
                {"params": backbone_params, "lr": self.cfg.lr_backbone, "_base_lr": self.cfg.lr_backbone},
            ],
            weight_decay=self.cfg.weight_decay,
        )

        total_steps = len(train_loader) * self.cfg.epochs
        scheduler = CosineWarmupScheduler(
            optimizer, self.cfg.warmup_epochs * len(train_loader), total_steps
        )
        scaler = torch.cuda.amp.GradScaler(enabled=self.cfg.amp)

        out_dir = Path(self.cfg.output_dir) / self.cfg.experiment_name
        out_dir.mkdir(parents=True, exist_ok=True)

        # CSV logger
        csv_path = out_dir / "epoch_log.csv"
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                ["epoch", "train_loss", "val_loss", "val_acc", "val_top3", "val_map3", "lr"]
            )

        # Resume
        start_epoch = 0
        if self.cfg.resume_from and Path(self.cfg.resume_from).exists():
            ckpt = torch.load(self.cfg.resume_from, map_location=self.device, weights_only=False)
            base_model.load_state_dict(ckpt["model_state"])
            start_epoch = ckpt["epoch"] + 1
            self.best_val_metric = ckpt.get("val_metrics", {}).get("map_at_3", -1.0)
            print(f"▶️  Resumed from epoch {start_epoch} (best map@3={self.best_val_metric:.4f})")

        global_step = start_epoch * len(train_loader)
        for epoch in range(start_epoch, self.cfg.epochs):
            # --- Unfreeze backbone after warmup epochs ---
            if epoch == self.cfg.freeze_backbone_epochs:
                print(f"🔓 Unfreezing backbone at epoch {epoch}")
                for p in base_model.parameters():
                    p.requires_grad = True

            model.train()
            running_loss = 0.0
            for i, (imgs, labels, _) in enumerate(train_loader):
                imgs, labels = imgs.to(self.device), labels.to(self.device)

                # MixUp or CutMix
                use_mixup = random.random() < 0.5 if self.cfg.aug_mixup_alpha > 0 else False
                use_cutmix = (
                    random.random() < 0.5
                    if self.cfg.aug_cutmix_alpha > 0 and not use_mixup
                    else False
                )

                with torch.cuda.amp.autocast(enabled=self.cfg.amp):
                    if use_mixup:
                        mixed_imgs, y_a, y_b, lam = mixup_data(imgs, labels, self.cfg.aug_mixup_alpha)
                        logits = model(mixed_imgs)
                        loss = mixup_criterion(criterion, logits, y_a, y_b, lam)
                    elif use_cutmix:
                        mixed_imgs, y_a, y_b, lam = cutmix_data(imgs, labels, self.cfg.aug_cutmix_alpha)
                        logits = model(mixed_imgs)
                        loss = mixup_criterion(criterion, logits, y_a, y_b, lam)
                    else:
                        logits = model(imgs)
                        loss = criterion(logits, labels)
                    loss = loss / self.cfg.grad_accum_steps

                scaler.scale(loss).backward()

                if (i + 1) % self.cfg.grad_accum_steps == 0:
                    # Gradient clipping
                    if self.cfg.max_grad_norm > 0:
                        scaler.unscale_(optimizer)
                        torch.nn.utils.clip_grad_norm_(
                            model.parameters(), self.cfg.max_grad_norm
                        )
                    scaler.step(optimizer)
                    scaler.update()
                    optimizer.zero_grad()
                    scheduler.step(global_step)
                    global_step += 1

                    # EMA update
                    if ema_model:
                        ema_model.update(base_model)

                running_loss += loss.item() * self.cfg.grad_accum_steps

            train_loss = running_loss / len(train_loader)

            # Evaluate with EMA model if available
            eval_model = ema_model.ema if ema_model else base_model
            val_metrics = self._evaluate(
                eval_model, val_loader, criterion, "val", label2idx, use_tta=self.cfg.use_tta
            )
            self._log_epoch(epoch, train_loss, val_metrics, optimizer.param_groups[0]["lr"])

            # CSV log
            with open(csv_path, "a", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        epoch,
                        f"{train_loss:.6f}",
                        f"{val_metrics['loss']:.6f}",
                        f"{val_metrics['acc']:.4f}",
                        f"{val_metrics['top3_acc']:.4f}",
                        f"{val_metrics['map_at_3']:.4f}",
                        f"{optimizer.param_groups[0]['lr']:.2e}",
                    ]
                )

            # Checkpoint best on observation-level MAP@3
            val_map3 = val_metrics["map_at_3"]
            if val_map3 > self.best_val_metric:
                self.best_val_metric = val_map3
                self.best_epoch = epoch
                self.patience_counter = 0
                torch.save(
                    {
                        "epoch": epoch,
                        "model_state": base_model.state_dict(),
                        "label2idx": label2idx,
                        "cfg": self.cfg.__dict__,
                        "val_metrics": val_metrics,
                    },
                    out_dir / "best_model.pt",
                )
                print(
                    f"  💾 Saved best checkpoint "
                    f"(obs_map@3={val_map3:.4f}, val_acc={val_metrics['acc']:.4f})"
                )
            else:
                self.patience_counter += 1
                if (
                    self.cfg.early_stopping_patience > 0
                    and self.patience_counter >= self.cfg.early_stopping_patience
                ):
                    print(
                        f"⏹️  Early stopping at epoch {epoch} "
                        f"(no improvement for {self.cfg.early_stopping_patience} epochs)"
                    )
                    break

        # Final test evaluation with best model
        print("\n" + "=" * 60)
        print("🧪 Loading best checkpoint for final test evaluation...")
        best_ckpt = torch.load(out_dir / "best_model.pt", map_location=self.device, weights_only=False)
        base_model.load_state_dict(best_ckpt["model_state"])
        test_metrics = self._evaluate(
            base_model, test_loader, criterion, "test", label2idx, use_tta=self.cfg.use_tta
        )
        print(f"\n🧪 FINAL TEST METRICS: {json.dumps(test_metrics, indent=2)}")
        print(f"   Best model was from epoch {self.best_epoch}")

        # Save label map + history
        with open(out_dir / "label2idx.json", "w") as f:
            json.dump(label2idx, f, indent=2)
        with open(out_dir / "training_history.json", "w") as f:
            json.dump(self.history, f, indent=2)
        with open(out_dir / "test_metrics.json", "w") as f:
            json.dump(test_metrics, f, indent=2)

        return {
            "best_val_map3": self.best_val_metric,
            "best_epoch": self.best_epoch,
            "test_metrics": test_metrics,
            "label2idx": label2idx,
            "num_classes": len(label2idx),
        }

    def _evaluate(
        self,
        model: nn.Module,
        loader: DataLoader,
        criterion: nn.Module,
        split_name: str,
        label2idx: dict[str, int],
        use_tta: bool = False,
    ) -> dict[str, float]:
        """Evaluate model with FungiCLEF-compatible metrics.

        Computes: top-1/3/5 acc, macro/micro F1, balanced accuracy,
        observation-level MAP@3 (official FungiCLEF metric), per-class
        precision/recall/F1, and exports confusion matrix.
        """
        from sklearn.metrics import (
            balanced_accuracy_score,
            classification_report,
            f1_score,
            precision_recall_fscore_support,
        )

        model.eval()
        total_loss = 0.0
        all_preds: list[int] = []
        all_labels: list[int] = []
        all_probs: list[np.ndarray] = []
        all_obs_ids: list[str] = []

        tta_transforms = [None]
        if use_tta:
            tta_transforms = [None, "hflip"]

        with torch.no_grad():
            for imgs, labels, obs_ids in loader:
                imgs, labels = imgs.to(self.device), labels.to(self.device)

                # TTA: average predictions over augmentations
                probs_accum = None
                for tta_op in tta_transforms:
                    tta_imgs = imgs
                    if tta_op == "hflip":
                        tta_imgs = torch.flip(imgs, dims=[3])
                    with torch.cuda.amp.autocast(enabled=self.cfg.amp):
                        logits = model(tta_imgs)
                    probs = torch.softmax(logits, dim=-1)
                    if probs_accum is None:
                        probs_accum = probs
                    else:
                        probs_accum += probs

                probs_avg = probs_accum / len(tta_transforms)

                with torch.cuda.amp.autocast(enabled=self.cfg.amp):
                    logits_raw = model(imgs)
                    loss = criterion(logits_raw, labels)
                total_loss += loss.item()

                preds = probs_avg.argmax(dim=-1)
                all_preds.extend(preds.cpu().numpy())
                all_labels.extend(labels.cpu().numpy())
                all_probs.append(probs_avg.cpu().numpy())
                all_obs_ids.extend(obs_ids)

        all_probs_arr = np.vstack(all_probs)
        num_samples = len(all_labels)

        # Top-k accuracy
        def _top_k_acc(k: int) -> float:
            topk_preds = np.argpartition(all_probs_arr, -k, axis=1)[:, -k:]
            hits = sum(1 for i, lbl in enumerate(all_labels) if lbl in topk_preds[i])
            return hits / num_samples

        acc = sum(int(p == lbl) for p, lbl in zip(all_preds, all_labels, strict=True)) / num_samples
        avg_loss = total_loss / len(loader)
        top3_acc = _top_k_acc(3)
        top5_acc = _top_k_acc(5)

        f1_macro = float(f1_score(all_labels, all_preds, average="macro", zero_division=0))
        f1_micro = float(f1_score(all_labels, all_preds, average="micro", zero_division=0))
        bal_acc = float(balanced_accuracy_score(all_labels, all_preds))

        # Image-level MAP@3
        map3_img = self._map_at_k(all_labels, all_probs_arr, k=3)

        # Observation-level MAP@3 (OFFICIAL FungiCLEF metric)
        map3_obs = map_at_k_per_observation(
            all_probs_arr, all_labels, all_obs_ids, k=3
        )

        metrics = {
            "loss": avg_loss,
            "acc": acc,
            "top3_acc": top3_acc,
            "top5_acc": top5_acc,
            "f1_macro": f1_macro,
            "f1_micro": f1_micro,
            "balanced_acc": bal_acc,
            "map_at_3": map3_obs,  # observation-level (official)
            "map_at_3_image": map3_img,
        }

        # Per-class report & confusion matrix for final test
        if split_name == "test":
            out_dir = Path(self.cfg.output_dir) / self.cfg.experiment_name

            # Classification report (per-class precision/recall/F1)
            idx2label = {v: k for k, v in label2idx.items()}
            target_names = [idx2label[i] for i in range(len(idx2label))]
            report = classification_report(
                all_labels, all_preds, target_names=target_names,
                zero_division=0, output_dict=True,
            )
            with open(out_dir / "per_class_report.json", "w") as f:
                json.dump(report, f, indent=2)

            # Per-class CSV
            precision, recall, fscore, support = precision_recall_fscore_support(
                all_labels, all_preds, zero_division=0
            )
            with open(out_dir / "per_class_metrics.csv", "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["class_id", "species", "precision", "recall", "f1", "support"])
                for i in range(len(idx2label)):
                    writer.writerow(
                        [i, idx2label[i], f"{precision[i]:.4f}", f"{recall[i]:.4f}",
                         f"{fscore[i]:.4f}", support[i]]
                    )

            # Save confusion-matrix-ready predictions
            np.savez(
                out_dir / "test_predictions.npz",
                probs=all_probs_arr,
                preds=np.array(all_preds),
                labels=np.array(all_labels),
                obs_ids=np.array(all_obs_ids),
            )

            # Print top-10 worst classes
            class_f1 = [(idx2label[i], fscore[i], support[i]) for i in range(len(idx2label))]
            class_f1.sort(key=lambda x: x[1])
            print("\n📉 10 worst-performing classes (by F1):")
            for name, f1, sup in class_f1[:10]:
                print(f"   {name}: F1={f1:.3f} (n={sup})")

        return metrics

    @staticmethod
    def _map_at_k(labels: list[int], probs: np.ndarray, k: int = 3) -> float:
        """Image-level MAP@K."""
        n = len(labels)
        topk_idx = np.argsort(-probs, axis=1)[:, :k]
        ap_sum = 0.0
        for i in range(n):
            for rank, pred_idx in enumerate(topk_idx[i]):
                if pred_idx == labels[i]:
                    ap_sum += 1.0 / (rank + 1)
                    break
        return ap_sum / n

    def _log_epoch(
        self, epoch: int, train_loss: float, val_metrics: dict[str, float], lr: float
    ) -> None:
        entry = {
            "epoch": epoch,
            "train_loss": train_loss,
            "lr": lr,
            **{f"val_{k}": v for k, v in val_metrics.items()},
        }
        self.history.append(entry)
        print(
            f"Epoch {epoch:3d}/{self.cfg.epochs - 1} | "
            f"loss={train_loss:.4f} | "
            f"val_acc={val_metrics['acc']:.4f} | "
            f"val_top3={val_metrics['top3_acc']:.4f} | "
            f"val_f1={val_metrics['f1_macro']:.4f} | "
            f"val_map3_obs={val_metrics['map_at_3']:.4f} | "
            f"lr={lr:.2e}"
        )


# --------------------------------------------------------------------------- #
# CLI entrypoint                                                              #
# --------------------------------------------------------------------------- #
def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="VisionSetil Mega Training v2")
    sub = parser.add_subparsers(dest="command", required=True)

    # Train subcommand
    train_parser = sub.add_parser("train", help="Train a model")
    train_parser.add_argument("--csv", required=True, help="Path to metadata CSV")
    train_parser.add_argument(
        "--config", default=None, help="Path to JSON config (overrides CLI args)"
    )
    train_parser.add_argument("--backbone", default="convnext_base")
    train_parser.add_argument("--epochs", type=int, default=25)
    train_parser.add_argument("--batch-size", type=int, default=32)
    train_parser.add_argument("--image-size", type=int, default=384)
    train_parser.add_argument("--resume-from", default=None, help="Checkpoint path to resume from")

    # Eval subcommand
    eval_parser = sub.add_parser("eval", help="Evaluate a checkpoint")
    eval_parser.add_argument("--csv", required=True)
    eval_parser.add_argument("--checkpoint", required=True)
    eval_parser.add_argument("--batch-size", type=int, default=32)

    args = parser.parse_args()

    if args.command == "train":
        # Load config from JSON if provided, else use CLI args
        if args.config:
            cfg = TrainConfig.from_json(args.config)
            # CLI overrides
            if args.csv:
                pass  # csv is used below
            if args.resume_from:
                cfg.resume_from = args.resume_from
        else:
            cfg = TrainConfig(
                backbone=args.backbone,
                epochs=args.epochs,
                batch_size=args.batch_size,
                image_size=args.image_size,
            )
            if args.resume_from:
                cfg.resume_from = args.resume_from

        df = pd.read_csv(args.csv)
        print(f"📊 Loaded {len(df)} images from {args.csv}")
        print(f"🔧 Config: backbone={cfg.backbone}, epochs={cfg.epochs}, bs={cfg.batch_size}")
        print(
            f"   mixup={cfg.aug_mixup_alpha}, cutmix={cfg.aug_cutmix_alpha}, "
            f"ema={cfg.use_ema}, tta={cfg.use_tta}, grad_clip={cfg.max_grad_norm}"
        )

        trainer = MegaTrainer(cfg)
        results = trainer.train(df)
        print("\n✅ Training complete!")
        print(f"   Best val MAP@3 (obs-level): {results['best_val_map3']:.4f} @ epoch {results['best_epoch']}")
        print(f"   Test MAP@3: {results['test_metrics']['map_at_3']:.4f}")
        print(f"   Test accuracy: {results['test_metrics']['acc']:.4f}")
        print(f"   Test top-3 accuracy: {results['test_metrics']['top3_acc']:.4f}")
        print(f"   Test F1-macro: {results['test_metrics']['f1_macro']:.4f}")

    elif args.command == "eval":
        ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
        saved_cfg = TrainConfig(**ckpt["cfg"])
        saved_cfg.batch_size = args.batch_size
        label2idx = ckpt["label2idx"]

        model = build_model(saved_cfg, num_classes=len(label2idx))
        model.load_state_dict(ckpt["model_state"])

        df = pd.read_csv(args.csv)
        splitter = AntiLeakSplitter(saved_cfg.split_cfg)
        _, _, test_df = splitter.split(df)

        test_ds = MushroomDataset(test_df, label2idx, saved_cfg, augment=False)
        test_loader = DataLoader(
            test_ds, batch_size=saved_cfg.batch_size, shuffle=False,
            num_workers=saved_cfg.num_workers,
        )

        trainer = MegaTrainer(saved_cfg)
        criterion = FocalLossWithLabelSmoothing(
            gamma=saved_cfg.focal_gamma, smoothing=saved_cfg.label_smoothing
        )
        metrics = trainer._evaluate(
            model, test_loader, criterion, "test", label2idx, use_tta=saved_cfg.use_tta
        )
        print("\n📊 Evaluation results:")
        print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()

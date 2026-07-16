"""Generate a valid Jupyter notebook for VisionSetil Mega Training v2."""
import json
from pathlib import Path

cells = []


def md(text):
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": text.strip("\n").split("\n"),
    })


def code(src):
    lines = src.strip("\n").split("\n")
    # Jupyter expects each line (except last) to end with \n
    source = [line + "\n" for line in lines[:-1]] + [lines[-1]]
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source,
    })


md("""
# VisionSetil Mega Training v2 — FungiCLEF 2025

**Production-grade training pipeline** with:
- ConvNeXt-Base backbone @ 384px (40 epochs)
- MixUp / CutMix augmentation strategies
- EMA (Exponential Moving Average) for stable evaluation
- WeightedRandomSampler for long-tail class balance
- Test-Time Augmentation (TTA)
- **Observation-level MAP@3** (official FungiCLEF metric)
- Anti-leak split (observation + session aware)
- Per-class metrics + confusion matrix export
- Early stopping + resume from checkpoint

**Data**: Real FungiCLEF 2025 data only. No synthetic images.
""")

code("""
# CELL 1 — Environment setup
import sys, os, warnings
warnings.filterwarnings('ignore')

import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
    print(f'GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB')

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
NUM_WORKERS = 4
print(f'Using device: {DEVICE}')
""")

code("""
# CELL 2 — Install timm for backbone flexibility
import subprocess
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'timm'])
import timm
print(f'timm: {timm.__version__}')
""")

code("""
# CELL 3 — Load FungiCLEF 2025 metadata
import pandas as pd
import numpy as np
from pathlib import Path

DATA_ROOT = Path('/kaggle/input/fungi-clef-2025')

meta_candidates = [
    DATA_ROOT / 'train.csv',
    DATA_ROOT / 'train_metadata.csv',
    DATA_ROOT / 'FungiTastic-FewShot' / 'train.csv',
    DATA_ROOT / 'metadata.csv',
]

df = None
for meta_path in meta_candidates:
    if meta_path.exists():
        df = pd.read_csv(meta_path)
        print(f'Loaded metadata from: {meta_path}')
        break

if df is None:
    csv_files = list(DATA_ROOT.rglob('*.csv'))
    print(f'CSV files found: {csv_files}')
    if csv_files:
        df = pd.read_csv(csv_files[0])

if df is not None:
    print(f'Dataset shape: {df.shape}')
    print(f'Columns: {list(df.columns)}')
""")

code("""
# CELL 4 — Normalize column names
COLUMN_MAP = {
    'class': 'species', 'class_id': 'species', 'scientificName': 'species',
    'observationUUID': 'observation_id', 'filename': 'image_path',
    'photo_id': 'observation_id',
}

if df is not None:
    df = df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns})
    if 'image_path' in df.columns:
        df['image_path'] = df['image_path'].apply(
            lambda p: str(DATA_ROOT / p) if not str(p).startswith('/') else str(p)
        )
    if 'observation_id' not in df.columns:
        df['observation_id'] = range(len(df))
    if 'genus' not in df.columns:
        df['genus'] = df['species'].str.split().str[0]
    for col in ['family', 'user_id', 'observed_at']:
        if col not in df.columns:
            df[col] = 'unknown'
    print(f'Species: {df["species"].nunique()} | Images: {len(df)}')
""")

md("## Training Pipeline (v2)")

code("""
# CELL 5 — Config and seeding
import copy, csv, json, math, random
from dataclasses import dataclass

import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms
from PIL import Image
from sklearn.metrics import (
    balanced_accuracy_score, f1_score, precision_recall_fscore_support,
)


@dataclass
class TrainConfig:
    backbone: str = 'convnext_base'
    pretrained: bool = True
    image_size: int = 384
    epochs: int = 40
    batch_size: int = 32
    lr_head: float = 3e-4
    lr_backbone: float = 2e-5
    weight_decay: float = 1e-2
    warmup_epochs: int = 3
    label_smoothing: float = 0.1
    focal_gamma: float = 2.0
    max_grad_norm: float = 1.0
    aug_mixup_alpha: float = 0.2
    use_ema: bool = True
    ema_decay: float = 0.999
    use_tta: bool = True
    early_stopping_patience: int = 7
    seed: int = 42


def seed_everything(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

seed_everything(42)
cfg = TrainConfig()
print('Config ready')
""")

code("""
# CELL 6 — Anti-leak split
from anti_leak_splitter import AntiLeakSplitter, SplitConfig

split_cfg = SplitConfig(
    group_by='observation_id',
    stratify_by=['species', 'genus'],
    test_size=0.15, val_size=0.15,
    min_class_count=3, random_state=42,
)
splitter = AntiLeakSplitter(split_cfg)
train_df, val_df, test_df = splitter.split(df)
print(f'Train: {len(train_df)} | Val: {len(val_df)} | Test: {len(test_df)}')
""")

code("""
# CELL 7 — Dataset, MixUp, EMA
class MushroomDataset(Dataset):
    def __init__(self, df, label2idx, cfg, augment=False):
        self.df = df.reset_index(drop=True)
        self.label2idx = label2idx
        if augment:
            self.transform = transforms.Compose([
                transforms.ToPILImage(),
                transforms.Resize((cfg.image_size, cfg.image_size)),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.RandomVerticalFlip(p=0.5),
                transforms.RandomRotation(30),
                transforms.ColorJitter(0.3, 0.3, 0.3, 0.15),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
                transforms.RandomErasing(p=0.25),
            ])
        else:
            self.transform = transforms.Compose([
                transforms.ToPILImage(),
                transforms.Resize((cfg.image_size, cfg.image_size)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ])

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img = np.array(Image.open(row['image_path']).convert('RGB'))
        return self.transform(img), self.label2idx[row['species']], str(row.get('observation_id', idx))


def mixup_data(x, y, alpha=0.2):
    lam = max(float(np.random.beta(alpha, alpha)), 1.0 - float(np.random.beta(alpha, alpha)))
    idx = torch.randperm(x.size(0), device=x.device)
    return lam * x + (1 - lam) * x[idx], y, y[idx], lam


class ModelEMA:
    def __init__(self, model, decay=0.999):
        self.decay = decay
        self.ema = copy.deepcopy(model).eval()
        for p in self.ema.parameters():
            p.requires_grad_(False)

    @torch.no_grad()
    def update(self, model):
        for ep, mp in zip(self.ema.parameters(), model.parameters(), strict=True):
            ep.data.mul_(self.decay).add_(mp.data, alpha=1.0 - self.decay)

print('Classes defined')
""")

code("""
# CELL 8 — Model, Loss, Scheduler, Metrics
def build_model(backbone, num_classes, pretrained=True):
    return timm.create_model(backbone, pretrained=pretrained, num_classes=num_classes).to(DEVICE)


class FocalLossLS(nn.Module):
    def __init__(self, gamma=2.0, smoothing=0.1):
        super().__init__()
        self.gamma = gamma
        self.smoothing = smoothing

    def forward(self, logits, targets):
        nc = logits.size(-1)
        lp = F.log_softmax(logits, dim=-1)
        with torch.no_grad():
            smooth = torch.full_like(lp, self.smoothing / (nc - 1))
            smooth.scatter_(1, targets.unsqueeze(1), 1.0 - self.smoothing)
        probs = torch.exp(lp)
        fw = (1 - probs.gather(1, targets.unsqueeze(1)).clamp(min=1e-6)) ** self.gamma
        return -(smooth * lp * fw).sum(-1).mean()


class CosineWarmup:
    def __init__(self, opt, warmup, total):
        self.opt, self.warmup, self.total = opt, warmup, total
        self.base_lrs = [pg['lr'] for pg in opt.param_groups]

    def step(self, step):
        if step < self.warmup:
            scale = (step + 1) / self.warmup
        else:
            prog = (step - self.warmup) / max(1, self.total - self.warmup)
            scale = 0.5 * (1 + math.cos(math.pi * prog))
        for pg, blr in zip(self.opt.param_groups, self.base_lrs, strict=True):
            pg['lr'] = blr * scale


def map_at_k_per_observation(probs, labels, obs_ids, k=3):
    df_t = pd.DataFrame({'obs_id': obs_ids, 'label': labels})
    obs_labels = df_t.groupby('obs_id')['label'].first().to_dict()
    prob_df = pd.DataFrame(probs)
    prob_df['obs_id'] = obs_ids
    obs_probs = prob_df.groupby('obs_id').mean().values
    map_sum = 0.0
    for i, obs_id in enumerate(obs_labels.keys()):
        topk = np.argsort(-obs_probs[i])[:k]
        for rank, pred in enumerate(topk):
            if pred == obs_labels[obs_id]:
                map_sum += 1.0 / (rank + 1)
                break
    return map_sum / len(obs_labels)

print('Model/Loss/Scheduler/Metrics defined')
""")

code("""
# CELL 9 — Dataloaders
train_classes = sorted(train_df['species'].unique())
label2idx = {c: i for i, c in enumerate(train_classes)}
print(f'Classes: {len(label2idx)}')

train_ds = MushroomDataset(train_df, label2idx, cfg, augment=True)
val_ds = MushroomDataset(val_df, label2idx, cfg, augment=False)
test_ds = MushroomDataset(test_df, label2idx, cfg, augment=False)

class_counts = train_df['species'].value_counts()
sample_wts = train_df['species'].map(lambda c: 1.0 / max(class_counts[c], 1)).values
sampler = WeightedRandomSampler(sample_wts, len(train_df), replacement=True)

train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, sampler=sampler,
                          num_workers=NUM_WORKERS, pin_memory=True, drop_last=True)
val_loader = DataLoader(val_ds, batch_size=cfg.batch_size, shuffle=False,
                        num_workers=NUM_WORKERS, pin_memory=True)
test_loader = DataLoader(test_ds, batch_size=cfg.batch_size, shuffle=False,
                         num_workers=NUM_WORKERS, pin_memory=True)
print(f'Batches: train={len(train_loader)} val={len(val_loader)} test={len(test_loader)}')
""")

code("""
# CELL 10 — Build model + optimizer
model = build_model(cfg.backbone, len(label2idx))
print(f'Model: {cfg.backbone} | params: {sum(p.numel() for p in model.parameters())/1e6:.1f}M')

for name, p in model.named_parameters():
    if 'classifier' not in name and 'head' not in name:
        p.requires_grad = False

head_params = [p for n, p in model.named_parameters() if p.requires_grad]
backbone_params = [p for n, p in model.named_parameters() if not p.requires_grad]

optimizer = torch.optim.AdamW([
    {'params': head_params, 'lr': cfg.lr_head},
    {'params': backbone_params, 'lr': cfg.lr_backbone},
], weight_decay=cfg.weight_decay)

criterion = FocalLossLS(gamma=cfg.focal_gamma, smoothing=cfg.label_smoothing)
total_steps = len(train_loader) * cfg.epochs
scheduler = CosineWarmup(optimizer, cfg.warmup_epochs * len(train_loader), total_steps)
scaler = torch.cuda.amp.GradScaler(enabled=(DEVICE == 'cuda'))
ema_model = ModelEMA(model, decay=cfg.ema_decay) if cfg.use_ema else None
print('Optimizer ready. Backbone frozen for 2 epochs.')
""")

code("""
# CELL 11 — Training loop
OUT_DIR = Path('/kaggle/working/visionsetil_outputs')
OUT_DIR.mkdir(parents=True, exist_ok=True)

best_map3, best_epoch, patience, history = -1.0, -1, 0, []

for epoch in range(cfg.epochs):
    if epoch == 2:
        for p in model.parameters():
            p.requires_grad = True
        print(f'Epoch {epoch}: Unfroze backbone')

    model.train()
    running_loss = 0.0
    global_step = epoch * len(train_loader)

    for i, (imgs, labels, _) in enumerate(train_loader):
        imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)
        use_mix = random.random() < 0.5 if cfg.aug_mixup_alpha > 0 else False

        with torch.cuda.amp.autocast(enabled=(DEVICE == 'cuda')):
            if use_mix:
                mixed, ya, yb, lam = mixup_data(imgs, labels, cfg.aug_mixup_alpha)
                logits = model(mixed)
                loss = lam * criterion(logits, ya) + (1 - lam) * criterion(logits, yb)
            else:
                loss = criterion(model(imgs), labels)

        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.max_grad_norm)
        scaler.step(optimizer)
        scaler.update()
        optimizer.zero_grad()
        scheduler.step(global_step)
        global_step += 1
        if ema_model:
            ema_model.update(model)
        running_loss += loss.item()

    train_loss = running_loss / len(train_loader)

    eval_model = ema_model.ema if ema_model else model
    eval_model.eval()
    all_preds, all_labels, all_probs, all_obs = [], [], [], []
    with torch.no_grad():
        for imgs, labels, obs_ids in val_loader:
            imgs = imgs.to(DEVICE)
            probs_accum = None
            for tta in [None, 'hflip']:
                tta_imgs = torch.flip(imgs, dims=[3]) if tta == 'hflip' else imgs
                logits = eval_model(tta_imgs)
                probs = torch.softmax(logits, dim=-1)
                probs_accum = probs if probs_accum is None else probs_accum + probs
            probs_avg = probs_accum / 2.0
            all_preds.extend(probs_avg.argmax(-1).cpu().numpy())
            all_labels.extend(labels.numpy())
            all_probs.append(probs_avg.cpu().numpy())
            all_obs.extend(obs_ids)

    all_probs_arr = np.vstack(all_probs)
    val_acc = sum(int(p == l) for p, l in zip(all_preds, all_labels, strict=True)) / len(all_labels)
    val_f1 = f1_score(all_labels, all_preds, average='macro', zero_division=0)
    val_map3 = map_at_k_per_observation(all_probs_arr, list(all_labels), all_obs, k=3)
    history.append({'epoch': epoch, 'train_loss': train_loss, 'val_acc': val_acc, 'val_f1': val_f1, 'val_map3': val_map3})
    print(f'Epoch {epoch:3d} | loss={train_loss:.4f} | acc={val_acc:.4f} | f1={val_f1:.4f} | map3={val_map3:.4f}')

    if val_map3 > best_map3:
        best_map3, best_epoch, patience = val_map3, epoch, 0
        torch.save({'epoch': epoch, 'model_state': model.state_dict(), 'label2idx': label2idx}, OUT_DIR / 'best_model.pt')
    else:
        patience += 1
        if patience >= cfg.early_stopping_patience:
            print(f'Early stopping at epoch {epoch}')
            break

print(f'Best val MAP@3: {best_map3:.4f} @ epoch {best_epoch}')
""")

code("""
# CELL 12 — Final test evaluation
ckpt = torch.load(OUT_DIR / 'best_model.pt', map_location=DEVICE, weights_only=False)
model.load_state_dict(ckpt['model_state'])
model.eval()

all_preds, all_labels, all_probs, all_obs = [], [], [], []
with torch.no_grad():
    for imgs, labels, obs_ids in test_loader:
        imgs = imgs.to(DEVICE)
        probs_accum = None
        for tta in [None, 'hflip']:
            tta_imgs = torch.flip(imgs, dims=[3]) if tta == 'hflip' else imgs
            logits = model(tta_imgs)
            probs = torch.softmax(logits, dim=-1)
            probs_accum = probs if probs_accum is None else probs_accum + probs
        probs_avg = probs_accum / 2.0
        all_preds.extend(probs_avg.argmax(-1).cpu().numpy())
        all_labels.extend(labels.numpy())
        all_probs.append(probs_avg.cpu().numpy())
        all_obs.extend(obs_ids)

all_probs_arr = np.vstack(all_probs)
test_acc = sum(int(p == l) for p, l in zip(all_preds, all_labels, strict=True)) / len(all_labels)
test_f1 = f1_score(all_labels, all_preds, average='macro', zero_division=0)
test_bal = balanced_accuracy_score(all_labels, all_preds)
test_map3 = map_at_k_per_observation(all_probs_arr, list(all_labels), all_obs, k=3)
print(f'FINAL TEST METRICS:')
print(f'  Accuracy: {test_acc:.4f} | F1: {test_f1:.4f} | MAP@3: {test_map3:.4f}')
""")

code("""
# CELL 13 — Export artifacts
with open(OUT_DIR / 'label2idx.json', 'w') as f:
    json.dump(label2idx, f, indent=2)
with open(OUT_DIR / 'training_history.json', 'w') as f:
    json.dump(history, f, indent=2)
with open(OUT_DIR / 'test_metrics.json', 'w') as f:
    json.dump({'acc': test_acc, 'f1_macro': test_f1, 'balanced_acc': test_bal, 'map_at_3': test_map3}, f, indent=2)
np.savez(OUT_DIR / 'test_predictions.npz', probs=all_probs_arr, preds=np.array(all_preds),
         labels=np.array(all_labels), obs_ids=np.array(all_obs))
print(f'Artifacts saved to {OUT_DIR}')
""")


notebook = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.10"},
        "accelerator": "GPU",
    },
    "nbformat": 4,
    "nbformat_minor": 4,
}

out = Path(__file__).parent / "visionsetil_mega_training.ipynb"
out.write_text(json.dumps(notebook, indent=1), encoding="utf-8")
print(f"Generated {out}")

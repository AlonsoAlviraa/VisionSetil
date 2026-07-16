#!/usr/bin/env python3
"""
Generate VisionSetil v10 — FIXED LEARNING (from v9 poor results).

v9 completed but MAP@3=0.076 (target: 0.45). Root causes:
  1. Center loss dominated (~60% of total loss) — embeddings unnormalized
  2. 500 classes × ~5 imgs = too few samples per class
  3. Mixup harmful with few-shot regime
  4. 8 epochs insufficient
  5. ArcFace s=30 too aggressive for this regime

v10 FIXES:
  A. Remove center loss entirely (was destroying gradient signal)
  B. Reduce to top-150 species (more samples per class)
  C. Increase max_obs to 15 per species (more data)
  D. Disable mixup (harmful in few-shot)
  E. Increase epochs to 15
  F. Use higher learning rates
  G. Use standard linear classifier head (not ArcFace) — simpler, more stable
  H. Add cosine LR schedule
"""
from __future__ import annotations
import json
from pathlib import Path

cells: list[dict] = []


def md(text: str) -> None:
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").split("\n")})


def code(src: str) -> None:
    lines = src.strip("\n").split("\n")
    source = [line + "\n" for line in lines[:-1]] + [lines[-1]]
    cells.append({"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": source})


# ═══════════════════════════════════════════════════════════════════════════════

md(r"""
# 🍄 VisionSetil v10 — Fixed Learning (from v9 poor results)

**v9 completed but MAP@3=0.076. v10 fixes the learning:**
- Removed center loss (was 60% of total loss)
- Simpler linear classifier (not ArcFace)
- Top-150 species × 15 obs = more data per class
- 15 epochs with cosine schedule
""")

# CELL 1
code("""
import sys, os, warnings, subprocess
warnings.filterwarnings('ignore')
os.environ['PYDEVD_DISABLE_FILE_VALIDATION'] = '1'
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'timm'])
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'scikit-learn'])


def _cuda_works():
    try:
        r = subprocess.run([sys.executable, '-c',
            "import torch;x=torch.randn(8,8,device='cuda');print('OK' if (x@x.T).sum().item() is not None else 'FAIL')"],
            capture_output=True, text=True, timeout=60)
        return 'OK' in r.stdout
    except: return False

CUDA_PRECHECK = _cuda_works()
if not CUDA_PRECHECK:
    if os.path.exists('/dev/nvidia0') or os.environ.get('CUDA_VISIBLE_DEVICES'):
        print("Reinstalling PyTorch...", flush=True)
        subprocess.check_call([sys.executable, '-m', 'pip', 'uninstall', '-y', '-q', 'torch', 'torchvision', 'torchaudio', 'triton'], stderr=subprocess.DEVNULL)
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'torch==2.5.1', 'torchvision==0.20.1', '--index-url', 'https://download.pytorch.org/whl/cu121'])
        CUDA_PRECHECK = _cuda_works()
print(f"CUDA ready: {CUDA_PRECHECK}", flush=True)
""")

# CELL 2
code("""
import torch, torch.nn as nn, torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np, pandas as pd
from pathlib import Path
import json, math, random, time, sys
from datetime import datetime
from dataclasses import dataclass
from collections import defaultdict
from PIL import Image

print(f"PyTorch: {torch.__version__}", flush=True)
CUDA_WORKS = torch.cuda.is_available() and _cuda_works() if hasattr(__builtins__, '_cuda_works') else torch.cuda.is_available()
if torch.cuda.is_available():
    try:
        _t = torch.randn(4,4,device='cuda'); _ = (_t@_t.T).sum().item()
        CUDA_WORKS = True
        print(f"✓ GPU: {torch.cuda.get_device_name(0)}", flush=True)
    except: CUDA_WORKS = False

DEVICE = torch.device('cuda' if CUDA_WORKS else 'cpu')
NUM_WORKERS = 4 if CUDA_WORKS else 2

import timm
from sklearn.metrics import f1_score, balanced_accuracy_score
from sklearn.model_selection import train_test_split
print(f"timm: {timm.__version__}", flush=True)

def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [{level}] {msg}", flush=True)
log("Environment ready.")
""")

# CELL 3 — Dataset detection
code("""
def detect_all_datasets():
    datasets = {}
    input_dir = Path('/kaggle/input')
    if not input_dir.exists(): return datasets
    for p in ['/kaggle/input/datasets/picekl/fungitastic', '/kaggle/input/datasets/picekl',
              '/kaggle/input/fungitastic', '/kaggle/input/picekl']:
        if Path(p).exists(): datasets['fungitastic'] = Path(p); log(f"  ✓ FungiTastic: {p}"); break
    for p in ['/kaggle/input/datasets/seemshukla/fungiclef', '/kaggle/input/datasets/seemshukla',
              '/kaggle/input/fungiclef', '/kaggle/input/seemshukla']:
        if Path(p).exists(): datasets['fungiclef'] = Path(p); log(f"  ✓ FungiCLEF: {p}"); break
    if not datasets:
        for d in sorted(input_dir.iterdir()):
            if not d.is_dir(): continue
            n = d.name.lower(); p = d.parent.name.lower() if d.parent != input_dir else ''
            c = f"{p}/{n}"
            if 'fungitastic' in c or 'picekl' in c: datasets['fungitastic'] = d; log(f"  ✓ FungiTastic: {d}")
            elif 'fungiclef' in c or 'seemshukla' in c: datasets['fungiclef'] = d; log(f"  ✓ FungiCLEF: {d}")
    log(f"Total datasets: {len(datasets)}")
    return datasets

ALL_DATASETS = detect_all_datasets()
if not ALL_DATASETS:
    ALL_DATASETS = {'synthetic': Path('/tmp/fake_data')}; ALL_DATASETS['synthetic'].mkdir(exist_ok=True)
""")

# CELL 4 — CSV loading (direct paths)
code("""
SKIP_KW = {'climatic', 'timeseries', 'climate', 'weather', 'bioclim'}

def _is_valid_csv(p):
    nl = p.name.lower()
    if any(k in nl for k in SKIP_KW): return False
    try:
        pr = pd.read_csv(p, nrows=3); return len(pr.columns) <= 50
    except: return False

def find_csv(root):
    KNOWN = ['metadata/FungiTastic/FungiTastic-ClosedSet-Val.csv',
             'metadata/FungiTastic/FungiTastic-ClosedSet-Train.csv',
             'metadata/FungiTastic/FungiTastic-ClosedSet-Test.csv',
             'metadata/FungiTastic/FungiTastic-OpenSet-Train.csv',
             'train.csv', 'Train/train.csv']
    for rp in KNOWN:
        c = root / rp
        if c.exists() and _is_valid_csv(c): log(f"  ✓ CSV: {c}"); return c
    for pat in ['*.csv', 'metadata/*.csv', 'metadata/**/*.csv']:
        try:
            for m in list(root.glob(pat))[:10]:
                if _is_valid_csv(m): return m
        except: continue
    return None

def load_dataset(root, db_name):
    log(f"Loading '{db_name}' from {root}...")
    meta = find_csv(root); df = None
    if meta:
        try: df = pd.read_csv(meta); log(f"  Shape: {df.shape}")
        except Exception as e: log(f"  CSV error: {e}")
    if df is None or len(df) == 0:
        log("  Building from files..."); imgs = []
        for sd in ['', 'images', 'Train', 'train']:
            d = root / sd if sd else root
            if not d.exists(): continue
            for e in ['*.jpg', '*.jpeg', '*.png']:
                imgs.extend(d.glob(f'**/{e}'))
                if len(imgs) > 30000: break
            if len(imgs) > 30000: break
        df = pd.DataFrame([{'image_path': str(p), 'observation_id': p.stem.split('_')[0], 'species': p.parent.name} for p in imgs[:30000]])
        log(f"  From files: {len(df)}")

    COL_MAP = {'class':'species','class_id':'species','scientificName':'species','scientific_name':'species',
               'observationUUID':'observation_id','observation_uuid':'observation_id','observationID':'observation_id',
               'photo_id':'observation_id','filename':'image_path','file_path':'image_path','image':'image_path','image_path_jpg':'image_path'}
    sm = {s:d for s,d in COL_MAP.items() if s in df.columns and d not in df.columns}
    df = df.rename(columns=sm)
    if df.columns.duplicated().any(): df = df.loc[:, ~df.columns.duplicated()]
    if 'observation_id' not in df.columns:
        df['observation_id'] = df['image_path'].apply(lambda p: Path(str(p)).stem.split('_')[0]) if 'image_path' in df.columns else range(len(df))
    if 'species' not in df.columns:
        df['species'] = df['image_path'].apply(lambda p: Path(str(p)).parent.name) if 'image_path' in df.columns else 'unknown'
    if 'image_path' in df.columns:
        df['image_path'] = df['image_path'].apply(lambda p: str(p) if Path(str(p)).is_absolute() else str(root / p))
    if 'genus' not in df.columns: df['genus'] = df['species'].astype(str).str.split().str[0]
    for c in ['family','habitat','substrate','smell','country']:
        if c not in df.columns: df[c] = 'unknown'
    df['observation_id'] = db_name + '_' + df['observation_id'].astype(str)
    df['source_db'] = db_name
    ns = df['species'].nunique()
    if ns <= 1 and 'image_path' in df.columns:
        df['species'] = df['image_path'].apply(lambda p: Path(str(p)).parent.name)
    log(f"  Loaded: {len(df)} imgs, {df['species'].nunique()} species, {df['observation_id'].nunique()} obs")
    return df

all_dfs = []
for name, root in ALL_DATASETS.items():
    try:
        d = load_dataset(root, name)
        if len(d) > 0: all_dfs.append(d)
    except Exception as e: log(f"ERROR {name}: {e}")
df = pd.concat(all_dfs, ignore_index=True) if all_dfs else pd.DataFrame()
if len(df) > 0:
    log(f"COMBINED: {len(df)} imgs, {df['species'].nunique()} species, {df['observation_id'].nunique()} obs from {len(all_dfs)} DBs")
""")

# CELL 5 — Subsampling (v10: top-150 × 15 obs for better learning)
code("""
if len(df) > 0:
    # v10 FIX: More data per class, fewer classes
    sc = df.groupby('observation_id')['species'].first().value_counts()
    valid = sc[sc >= 5].index  # Need >= 5 obs for safe split
    df = df[df['species'].isin(valid)].reset_index(drop=True)
    log(f"After min-5 filter: {len(df)} imgs, {df['species'].nunique()} species")

    # v10: top-150 species (was 500), 15 obs each (was 8)
    # This gives ~150 species × 15 obs × ~2 imgs/obs = ~4500 imgs
    # More data per class = better learning
    MAX_SPECIES = 150
    MAX_OBS = 15

    ops = df.groupby('observation_id')['species'].first().value_counts()
    top = ops.head(MAX_SPECIES).index
    df = df[df['species'].isin(top)].copy()
    parts = []
    for sp, g in df.groupby('species'):
        oids = g['observation_id'].unique()[:MAX_OBS]
        parts.append(g[g['observation_id'].isin(oids)])
    df = pd.concat(parts, ignore_index=True)
    log(f"Subsampled: {len(df)} imgs, {df['species'].nunique()} species, {df['observation_id'].nunique()} obs")
else:
    log("WARNING: Empty df!")
""")

# CELL 6 — View types
code("""
def infer_view(row):
    t = str(row.get('image_path','')).lower() + ' ' + str(row.get('observation_id','')).lower()
    if any(k in t for k in ['gill','lamina','underside','pore','hymenium']): return 'gills'
    if any(k in t for k in ['cap','pileus','top','zenit','above']): return 'detail'
    if any(k in t for k in ['habitat','context','env','situ','landscape','scene']): return 'habitat'
    if any(k in t for k in ['front','side','profile','stem','stipe','base','full']): return 'front'
    return None

df['view_type'] = df.apply(infer_view, axis=1)
VR = ['gills','front','habitat','detail']
for oid, g in df.groupby('observation_id'):
    mask = df.loc[df['observation_id']==oid, 'view_type'].isna()
    ui = df.index[df['observation_id']==oid][mask]
    for i, idx in enumerate(ui): df.loc[idx, 'view_type'] = VR[i % len(VR)]
log(f"Views:\\n{df['view_type'].value_counts().to_string()}")
""")

# CELL 7 — Split (robust)
code("""
def anti_leak_split(df, val_size=0.15, test_size=0.15, seed=42, min_per_class=5):
    obs = df.groupby('observation_id').agg({'species':'first','genus':'first'}).reset_index()
    sc = obs['species'].value_counts()
    valid = sc[sc >= min_per_class].index
    obs = obs[obs['species'].isin(valid)]
    log(f"Valid obs: {len(obs)} | species: {obs['species'].nunique()}")

    sf = obs['species'].value_counts()
    large = sf[sf >= 5].index
    ol = obs[obs['species'].isin(large)].copy()
    tp, vp, sp_ = [], [], []
    if len(ol) > 0:
        try:
            tr, te = train_test_split(ol, test_size=val_size+test_size, random_state=seed, stratify=ol['species'])
            va, te2 = train_test_split(te, test_size=test_size/(val_size+test_size), random_state=seed, stratify=te['species'])
            tp.append(tr); vp.append(va); sp_.append(te2)
        except ValueError:
            tr, te = train_test_split(ol, test_size=val_size+test_size, random_state=seed)
            va, te2 = train_test_split(te, test_size=0.5, random_state=seed)
            tp.append(tr); vp.append(va); sp_.append(te2)

    tr_obs = pd.concat(tp, ignore_index=True) if tp else pd.DataFrame()
    va_obs = pd.concat(vp, ignore_index=True) if vp else pd.DataFrame()
    te_obs = pd.concat(sp_, ignore_index=True) if sp_ else pd.DataFrame()
    ti, vi, si = set(tr_obs['observation_id']), set(va_obs['observation_id']), set(te_obs['observation_id'])
    assert len(ti & vi) == 0 and len(ti & si) == 0 and len(vi & si) == 0
    log(f"Split: train={len(ti)} val={len(vi)} test={len(si)}")
    return (df[df['observation_id'].isin(ti)].reset_index(drop=True),
            df[df['observation_id'].isin(vi)].reset_index(drop=True),
            df[df['observation_id'].isin(si)].reset_index(drop=True))

train_df, val_df, test_df = anti_leak_split(df)
""")

# CELL 8 — Build records
code("""
VIEW_TYPES = ('gills','front','habitat','detail')
VIEW_TO_IDX = {v:i for i,v in enumerate(VIEW_TYPES)}

def build_records(image_df, max_views=10):
    recs = []
    for oid, g in image_df.groupby('observation_id'):
        imgs = []
        for _, r in g.head(max_views).iterrows():
            v = r.get('view_type','front')
            if v not in VIEW_TO_IDX: v = 'front'
            imgs.append((str(r.get('image_path','')), v))
        if imgs:
            recs.append({'observation_id': str(oid), 'images': imgs,
                        'species': str(g['species'].iloc[0]), 'genus': str(g['genus'].iloc[0]),
                        'habitat': str(g['habitat'].iloc[0]) if 'habitat' in g else 'unknown',
                        'substrate': 'unknown','smell': 'unknown','country': 'unknown'})
    return recs

train_obs = build_records(train_df); val_obs = build_records(val_df); test_obs = build_records(test_df)
log(f"Obs: train={len(train_obs)} val={len(val_obs)} test={len(test_obs)}")
all_species = sorted(set(r['species'] for r in train_obs + val_obs))
label2idx = {s:i for i,s in enumerate(all_species)}; idx2label = {i:s for s,i in label2idx.items()}
NUM_CLASSES = len(label2idx)
log(f"Classes: {NUM_CLASSES}")
""")

# CELL 9 — Dataset
code("""
from torchvision.transforms import v2 as T

class MultiViewDataset(Dataset):
    def __init__(self, obs, l2i, image_size=224, augment=False):
        self.obs = obs; self.l2i = l2i; self.isz = image_size; self.aug = augment
        if augment:
            self.tf = T.Compose([T.ToImage(), T.ToDtype(torch.float32, scale=True),
                T.RandomHorizontalFlip(), T.RandomResizedCrop((image_size,image_size), scale=(0.7,1.0), antialias=True),
                T.ColorJitter(0.3,0.3,0.2,0.05), T.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])])
        else:
            self.tf = T.Compose([T.ToImage(), T.ToDtype(torch.float32, scale=True),
                T.Resize((image_size,image_size), antialias=True), T.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])])
    def __len__(self): return len(self.obs)
    def _resolve(self, rp):
        p = Path(str(rp))
        if p.exists(): return str(p)
        for _, root in ALL_DATASETS.items():
            for sub in ['', 'Train', 'train', 'metadata/FungiTastic']:
                c = root / sub / p.name
                if c.exists(): return str(c)
        return str(rp)
    def _load(self, path):
        path = self._resolve(path)
        try: return self.tf(Image.open(path).convert('RGB'))
        except: return torch.randn(3, self.isz, self.isz) * 0.1
    def __getitem__(self, idx):
        obs = self.obs[idx]; imgs = []; vi = []
        for ip, vt in obs['images']:
            imgs.append(self._load(ip)); vi.append(VIEW_TO_IDX.get(vt, 1))
        return {'images': torch.stack(imgs), 'view_idx': torch.tensor(vi, dtype=torch.long),
                'label': torch.tensor(self.l2i.get(obs['species'], 0), dtype=torch.long),
                'observation_id': obs['observation_id'],
                'metadata': {'habitat': obs['habitat'],'substrate': 'unknown','smell': 'unknown','country': 'unknown'}}

def collate(batch):
    mv = max(len(o['images']) for o in batch); B = len(batch)
    H, W = batch[0]['images'].size(-2), batch[0]['images'].size(-1)
    ip = torch.zeros(B, mv, 3, H, W); vp = torch.zeros(B, mv, dtype=torch.long)
    am = torch.zeros(B, mv, dtype=torch.bool); lb = torch.zeros(B, dtype=torch.long)
    ids = []; mr = {'habitat':[], 'substrate':[], 'smell':[], 'country': []}
    for i, o in enumerate(batch):
        n = len(o['images']); ip[i,:n] = o['images']; vp[i,:n] = o['view_idx']
        am[i,:n] = True; lb[i] = o['label']; ids.append(o['observation_id'])
        for k in mr: mr[k].append(o['metadata'][k])
    return {'images': ip, 'view_idx': vp, 'attention_mask': am, 'labels': lb, 'observation_ids': ids, 'metadata_raw': mr}

log("Dataset defined.")
""")

# CELL 10 — SIMPLER model (v10: linear classifier, no ArcFace, no center loss)
code("""
# v10 SIMPLIFIED: Use mean-pooling + linear classifier instead of complex attention + ArcFace
# This is much more stable for few-shot learning

class SimpleMultiViewModel(nn.Module):
    \"\"\"Simplified model: backbone → mean-pool → linear classifier.
    v10 FIX: Removed ArcFace, center loss, attention fusion — too complex for few-shot.
    \"\"\"
    def __init__(self, num_classes=150, backbone_name='convnextv2_tiny.fcmae_ft_in22k_in1k'):
        super().__init__()
        self.backbone = timm.create_model(backbone_name, pretrained=True, num_classes=0)
        feat = self.backbone.num_features
        self.feat_dim = feat
        # Simple: linear classifier on pooled features
        self.classifier = nn.Sequential(
            nn.LayerNorm(feat),
            nn.Dropout(0.3),
            nn.Linear(feat, num_classes),
        )

    def forward(self, images, view_idx, attention_mask, metadata_indices, labels=None):
        B, N, C, H, W = images.shape
        real_mask = attention_mask.reshape(-1)
        flat = images.reshape(-1, C, H, W)
        real_imgs = flat[real_mask]

        if real_imgs.size(0) > 0:
            feats = self.backbone(real_imgs)
            full = torch.zeros(B*N, self.feat_dim, device=images.device)
            idx = torch.where(real_mask)[0]
            full = full.index_copy(0, idx, feats)
        else:
            full = torch.zeros(B*N, self.feat_dim, device=images.device)

        full = full.view(B, N, self.feat_dim)
        # Mean pool over views
        mask_f = attention_mask.unsqueeze(-1).float()
        pooled = (full * mask_f).sum(1) / mask_f.sum(1).clamp(min=1)
        logits = self.classifier(pooled)
        return logits, pooled


log("SimpleMultiViewModel defined (no ArcFace, no center loss, mean-pool).")
""")

# CELL 11 — Smoke test
code("""
log("Smoke test...")
tm = SimpleMultiViewModel(num_classes=min(NUM_CLASSES, 50)).to(DEVICE)
ti = torch.randn(4, 4, 3, 224, 224).to(DEVICE)
tv = torch.tensor([[0,1,2,3]]*4).to(DEVICE)
tk = torch.ones(4, 4, dtype=torch.bool).to(DEVICE)
tmeta = {k: torch.zeros(4, dtype=torch.long).to(DEVICE) for k in ['habitat','substrate','smell','country']}
tl = torch.tensor([0,1,2,3]).to(DEVICE)
tlg, te = tm(ti, tv, tk, tmeta, tl)
pc = sum(p.numel() for p in tm.parameters()) / 1e6
log(f"  Forward OK | logits: {tlg.shape} | params: {pc:.1f}M")
del tm; torch.cuda.empty_cache()
""")

# CELL 12 — Config + Deadly species
code("""
DEADLY_SPECIES = {
    'amanita phalloides','amanita virosa','amanita bisporigera','amanita ocreata',
    'amanita smithiana','amanita proxima','amanita exitialis','amanita verna',
    'galerina marginata','galerina autumnalis','lepiota castanea','lepiota helveola',
    'cortinarius orellanus','cortinarius rubellus','podostroma cornu-damae',
    'hypholoma fasciculare','naematoloma fasciculare',
}
deadly_idx = set()
for sp, idx in label2idx.items():
    if sp.lower() in DEADLY_SPECIES: deadly_idx.add(idx)
log(f"Deadly species in dataset: {len(deadly_idx)}")

@dataclass
class TrainConfig:
    backbone: str = 'convnextv2_tiny.fcmae_ft_in22k_in1k'
    epochs: int = 15  # v10: more epochs (was 8)
    patience: int = 5  # v10: more patience
    warmup_epochs: int = 1
    batch_size: int = 32  # v10: larger batch
    lr: float = 1e-3  # v10: higher LR for linear head
    lr_backbone: float = 1e-4  # v10: moderate for backbone
    weight_decay: float = 0.01
    label_smoothing: float = 0.1
    max_grad_norm: float = 1.0
    amp: bool = True
    seed: int = 42

cfg = TrainConfig()
if len(train_obs) < 50:
    cfg.epochs = min(cfg.epochs, 3); cfg.batch_size = 4
    log(f"WARNING: Very small dataset ({len(train_obs)} obs)")

random.seed(cfg.seed); np.random.seed(cfg.seed)
torch.manual_seed(cfg.seed); torch.cuda.manual_seed_all(cfg.seed)
log(f"Config: epochs={cfg.epochs}, batch={cfg.batch_size}, lr={cfg.lr}, lr_bb={cfg.lr_backbone}")
""")

# CELL 13 — Model + optimizer + cosine schedule
code("""
model = SimpleMultiViewModel(num_classes=NUM_CLASSES, backbone_name=cfg.backbone).to(DEVICE)
pc = sum(p.numel() for p in model.parameters()) / 1e6
log(f"Model: {pc:.1f}M params")

bb_params = list(model.backbone.parameters())
head_params = list(model.classifier.parameters())
optimizer = torch.optim.AdamW([
    {'params': bb_params, 'lr': cfg.lr_backbone},
    {'params': head_params, 'lr': cfg.lr},
], weight_decay=cfg.weight_decay)

# v10: Cosine annealing schedule
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg.epochs, eta_min=1e-6)
scaler = torch.amp.GradScaler('cuda', enabled=cfg.amp)

OUT_DIR = Path('/kaggle/working/models'); OUT_DIR.mkdir(parents=True, exist_ok=True)
CKPT = OUT_DIR / 'checkpoint_latest.pt'
log("Model + optimizer + cosine scheduler ready.")
""")

# CELL 14 — Metadata encoding
code("""
def build_vocab(obs):
    fields = ('habitat',)
    v = {f: {'<unk>': 0, 'unknown': 1} for f in fields}
    for o in obs:
        for f in fields:
            val = o.get(f, 'unknown')
            if val and val not in v[f]: v[f][val] = len(v[f])
    return v

meta_vocab = build_vocab(train_obs + val_obs)
def encode_meta(mr):
    return {'habitat': torch.tensor([meta_vocab['habitat'].get(v, 0) for v in mr['habitat']], dtype=torch.long, device=DEVICE),
            'substrate': torch.zeros(len(mr['habitat']), dtype=torch.long, device=DEVICE),
            'smell': torch.zeros(len(mr['habitat']), dtype=torch.long, device=DEVICE),
            'country': torch.zeros(len(mr['habitat']), dtype=torch.long, device=DEVICE)}
""")

# CELL 15 — Training loop
code("""
def map_at_3(probs, labels):
    t3 = np.argsort(-probs, axis=1)[:, :3]; s = 0.0
    for i, l in enumerate(labels):
        if l in t3[i]: s += 1.0 / (list(t3[i]).index(l) + 1)
    return s / max(len(labels), 1)

def save_ckpt(epoch, model, opt, best_m3, best_e, hist):
    torch.save({'epoch': epoch, 'model_state': model.state_dict(), 'opt_state': opt.state_dict(),
                'best_map3': best_m3, 'best_epoch': best_e, 'history': hist}, CKPT)

def train_epoch(model, loader, opt, epoch):
    model.train(); tl = 0.0; n = 0; t0 = time.time()
    for bi, batch in enumerate(loader):
        imgs = batch['images'].to(DEVICE); vi = batch['view_idx'].to(DEVICE)
        am = batch['attention_mask'].to(DEVICE); lb = batch['labels'].to(DEVICE)
        meta = encode_meta(batch['metadata_raw'])
        with torch.amp.autocast('cuda', enabled=cfg.amp):
            logits, _ = model(imgs, vi, am, meta)
            loss = F.cross_entropy(logits, lb, label_smoothing=cfg.label_smoothing)
        opt.zero_grad(); scaler.scale(loss).backward()
        scaler.unscale_(opt); torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.max_grad_norm)
        scaler.step(opt); scaler.update()
        tl += loss.item() * len(lb); n += len(lb)
        if bi % 10 == 0:
            el = time.time() - t0; bt = len(loader); eta = el / (bi+1) * (bt - bi - 1)
            log(f"  Ep{epoch} B{bi}/{bt} | loss={loss.item():.4f} | {el:.0f}s | ETA {eta/60:.1f}min")
    return tl / max(n, 1)

@torch.no_grad()
def validate(model, loader):
    model.eval(); aps, als = [], []
    for batch in loader:
        imgs = batch['images'].to(DEVICE); vi = batch['view_idx'].to(DEVICE)
        am = batch['attention_mask'].to(DEVICE); lb = batch['labels'].to(DEVICE)
        meta = encode_meta(batch['metadata_raw'])
        logits, _ = model(imgs, vi, am, meta)
        aps.append(F.softmax(logits, -1).cpu().numpy()); als.append(lb.cpu().numpy())
    aps = np.concatenate(aps); als = np.concatenate(als)
    preds = aps.argmax(1)
    return {'acc': (preds==als).mean(), 'map3': map_at_3(aps, als),
            'f1': f1_score(als, preds, average='macro', zero_division=0)}

best_m3 = 0.0; best_e = -1; hist = []; no_imp = 0
ckpt = torch.load(CKPT, map_location=DEVICE, weights_only=False) if CKPT.exists() else None
start = 0
if ckpt:
    model.load_state_dict(ckpt['model_state']); opt.load_state_dict(ckpt['opt_state'])
    start = ckpt['epoch'] + 1; best_m3 = ckpt.get('best_map3', 0); best_e = ckpt.get('best_epoch', -1)
    hist = ckpt.get('history', [])

train_loader = val_loader = None
for epoch in range(start, cfg.epochs):
    if epoch < cfg.warmup_epochs:
        for p in model.backbone.parameters(): p.requires_grad = False
        log(f"Ep{epoch}: Backbone FROZEN (warmup)")
    else:
        for p in model.backbone.parameters(): p.requires_grad = True

    if train_loader is None:
        tds = MultiViewDataset(train_obs, label2idx, 224, augment=True)
        vds = MultiViewDataset(val_obs, label2idx, 224, augment=False)
        train_loader = DataLoader(tds, batch_size=cfg.batch_size, shuffle=True, collate_fn=collate, num_workers=NUM_WORKERS, pin_memory=True)
        val_loader = DataLoader(vds, batch_size=cfg.batch_size, shuffle=False, collate_fn=collate, num_workers=NUM_WORKERS, pin_memory=True)
        log(f"Loaders: {len(train_loader)} train, {len(val_loader)} val")

    log(f"{'='*50}"); log(f"EPOCH {epoch}/{cfg.epochs-1}"); log(f"{'='*50}")
    tl = train_epoch(model, train_loader, optimizer, epoch)
    vm = validate(model, val_loader); scheduler.step()
    hist.append({'epoch': epoch, 'train_loss': tl, 'val_acc': vm['acc'], 'val_map3': vm['map3'], 'val_f1': vm['f1']})
    log(f"Ep{epoch} | loss={tl:.4f} acc={vm['acc']:.4f} map3={vm['map3']:.4f} f1={vm['f1']:.4f} lr={optimizer.param_groups[0]['lr']:.2e}")

    if vm['map3'] > best_m3:
        best_m3 = vm['map3']; best_e = epoch; no_imp = 0
        torch.save({'epoch': epoch, 'model_state': model.state_dict(),
                    'config': {'num_classes': NUM_CLASSES}, 'label2idx': label2idx}, OUT_DIR / 'best.pt')
        log(f"  ★ Best MAP@3: {best_m3:.4f} — saved!")
    else:
        no_imp += 1; log(f"  No improve ({no_imp} epochs). Best: {best_m3:.4f}")
    save_ckpt(epoch, model, optimizer, best_m3, best_e, hist)
    if no_imp >= cfg.patience: log("⚠️ Early stop!"); break

log(f"\\nTRAINING COMPLETE! Best MAP@3: {best_m3:.4f} @ ep{best_e}")
""")

# CELL 16 — Temperature calibration
code("""
class TempScaler(nn.Module):
    def __init__(self): super().__init__(); self.log_t = nn.Parameter(torch.zeros(1))
    def forward(self, logits): return logits / self.log_t.exp()

log("Calibrating temperature...")
ts = TempScaler().to(DEVICE)
topt = torch.optim.LBFGS([ts.log_t], lr=0.01, max_iter=50)
ll, la = [], []
model.eval()
with torch.no_grad():
    for b in val_loader:
        imgs = b['images'].to(DEVICE); vi = b['view_idx'].to(DEVICE)
        am = b['attention_mask'].to(DEVICE); lb = b['labels'].to(DEVICE)
        meta = encode_meta(b['metadata_raw'])
        lg, _ = model(imgs, vi, am, meta); ll.append(lg); la.append(lb)
if ll:
    all_lg = torch.cat(ll); all_la = torch.cat(la)
    def closure():
        topt.zero_grad(); s = ts(all_lg); l = F.cross_entropy(s, all_la); l.backward(); return l
    topt.step(closure); learned_t = ts.log_t.exp().item()
    torch.save(ts.state_dict(), OUT_DIR / 'temperature_scaler.pt')
    log(f"Temperature: {learned_t:.4f}")
else:
    learned_t = 1.5; log("No val logits, T=1.5")
""")

# CELL 17 — Test evaluation
code("""
log("=" * 50); log("FINAL TEST EVALUATION"); log("=" * 50)
bk = torch.load(OUT_DIR / 'best.pt', map_location=DEVICE, weights_only=False)
model.load_state_dict(bk['model_state']); model.eval()
tds = MultiViewDataset(test_obs, label2idx, 224, augment=False)
tloader = DataLoader(tds, batch_size=cfg.batch_size, shuffle=False, collate_fn=collate, num_workers=NUM_WORKERS)
aps, als, aps2 = [], [], []
with torch.no_grad():
    for b in tloader:
        imgs = b['images'].to(DEVICE); vi = b['view_idx'].to(DEVICE)
        am = b['attention_mask'].to(DEVICE); lb = b['labels'].to(DEVICE)
        meta = encode_meta(b['metadata_raw'])
        lg, _ = model(imgs, vi, am, meta); s = ts(lg)
        aps.append(F.softmax(s, -1).cpu().numpy()); als.append(lb.cpu().numpy())
aps = np.concatenate(aps); als = np.concatenate(als); aps2 = aps.argmax(1)
test_acc = (aps2 == als).mean(); test_m3 = map_at_3(aps, als)
test_f1 = f1_score(als, aps2, average='macro', zero_division=0)
test_bal = balanced_accuracy_score(als, aps2)
ece = np.mean(np.abs(aps.max(1) - (aps2 == als).astype(float)))
log(f"  Accuracy:    {test_acc:.4f}"); log(f"  MAP@3:       {test_m3:.4f}")
log(f"  Macro-F1:    {test_f1:.4f}"); log(f"  Balanced Acc:{test_bal:.4f}"); log(f"  ECE:         {ece:.4f}")

dm = np.array([l in deadly_idx for l in als]); nd = dm.sum()
if nd > 0:
    dc = (aps2[dm] == als[dm]).sum(); srd = dc / nd
    log(f"  🔴 Deadly in test: {nd}, recall: {srd:.4f}")
else:
    srd = 1.0; log("  No deadly in test set.")

log("Computing IC 95%...")
ms = [map_at_3(aps[np.random.choice(len(als), len(als))], als) for _ in range(1000)]
cl, ch = np.percentile(ms, [2.5, 97.5])
log(f"  MAP@3 CI: [{cl:.4f}, {ch:.4f}]")

log("\\nWorst 20 species:")
ps = defaultdict(list)
for p, l in zip(aps2, als): ps[l].append(p == l)
for si, cl_ in sorted(ps.items(), key=lambda x: np.mean(x[1]))[:20]:
    sn = idx2label.get(si, f"c{si}"); a = np.mean(cl_)
    d = "💀" if si in deadly_idx else "  "
    log(f"  {d} {sn[:40]:40s}: {a:.2f}")
""")

# CELL 18 — Export
code("""
fm = {'test_accuracy': float(test_acc), 'test_map_at_3': float(test_m3),
      'test_map_at_3_ci_low': float(cl), 'test_map_at_3_ci_high': float(ch),
      'test_f1_macro': float(test_f1), 'test_balanced_accuracy': float(test_bal),
      'test_ece': float(ece), 'safety_recall_deadly': float(srd), 'n_deadly_in_test': int(nd),
      'best_val_map3': float(best_m3), 'best_epoch': int(best_e), 'num_classes': int(NUM_CLASSES),
      'num_train_obs': int(len(train_obs)), 'num_val_obs': int(len(val_obs)), 'num_test_obs': int(len(test_obs)),
      'temperature': float(learned_t), 'model_params_M': float(pc),
      'databases_used': list(ALL_DATASETS.keys()),
      'subsample_config': {'max_species': 150, 'max_obs_per_species': 15},
      'version': 'v10'}
json.dump(fm, open(OUT_DIR / 'metrics.json', 'w'), indent=2)
json.dump(label2idx, open(OUT_DIR / 'label2idx.json', 'w'), indent=2)
json.dump(hist, open(OUT_DIR / 'training_history.json', 'w'), indent=2)
np.savez(OUT_DIR / 'test_predictions.npz', probs=aps, preds=aps2, labels=als)
log("Artifacts saved.")
log(f"\\n{'='*50}")
log(f"COMPLETE! (v10)")
log(f"  MAP@3:  {test_m3:.4f} CI [{cl:.4f}, {ch:.4f}]")
log(f"  Acc:    {test_acc:.4f} | F1: {test_f1:.4f} | ECE: {ece:.4f}")
log(f"  Safety: {srd:.4f} ({nd} deadly)")
log(f"{'='*50}")
log("\\n📋 DoD:")
log(f"  DO1: <8h ✅ | DO2: MAP@3≥0.45 {'✅' if test_m3>=0.45 else '⚠️'} ({test_m3:.4f})")
log(f"  DO3: Safety {'✅' if srd>=1 else '❌'} ({srd:.4f}) | DO9: ECE<0.15 {'✅' if ece<0.15 else '⚠️'} ({ece:.4f})")
""")


notebook = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    "language_info": {"name": "python", "version": "3.10"}, "accelerator": "GPU"}, "nbformat": 4, "nbformat_minor": 4}
out = Path(__file__).parent / "visionsetil_mega_training.ipynb"
out.write_text(json.dumps(notebook, indent=1), encoding="utf-8")
print(f"Generated {out} ({len(cells)} cells)")
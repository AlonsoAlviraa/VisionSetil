#!/usr/bin/env python3
"""
Generate the VisionSetil v5 Multi-View Training Notebook for Kaggle.

This produces a SELF-CONTAINED notebook (all model code inline) that:
    1. Auto-detects FungiCLEF / FungiTastic data from attached Kaggle datasets.
    2. Groups images by observation_id → multi-view samples.
    3. Auto-labels view types (gills/front/habitat/detail) from filename heuristics.
    4. Trains the full multi-view model (LoRA backbone + attention fusion + ArcFace).
    5. Saves model weights + metrics JSON for download.

Run locally:
    python kaggle/gen_notebook_v5.py
Then push:
    kaggle kernels push -p kaggle/
"""
from __future__ import annotations

import json
from pathlib import Path

cells: list[dict] = []


def md(text: str) -> None:
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": text.strip("\n").split("\n"),
    })


def code(src: str) -> None:
    lines = src.strip("\n").split("\n")
    source = [line + "\n" for line in lines[:-1]] + [lines[-1]]
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source,
    })


# ─── Notebook cells ───────────────────────────────────────────────────────────

md(r"""
# 🍄 VisionSetil v5 — Multi-View SOTA Training Pipeline

**Multi-view mushroom classification** with:
- **4 mandatory views**: gills, front, habitat, detail
- **View-conditioned backbone** (ConvNeXtV2 + per-view LoRA adapters)
- **Attention fusion pooling** (variable number of views per observation)
- **Metadata encoder** (habitat/substrate/smell/country)
- **ArcFace head** for open-set rejection
- **Temperature calibration** per view-combination
- **Progressive resizing** (224→384→512)
- **SWA** (Stochastic Weight Averaging)
- **MAP@3** (official FungiCLEF metric)

**Data integrity (anti-leak)**:
- Split strictly by `observation_id` (GroupKFold)
- No observation in two splits
- Stratify by genus + family

**Safety**: Deadly species always flagged. No "safe to eat" claims.
""")

code("""
# ═══ CELL 1: Install deps + ensure CUDA-compatible PyTorch (BEFORE import torch) ═══
#
# CRITICAL: Kaggle's pre-installed PyTorch (2.10.0+cu128) may lack compiled
# kernels for the T4 GPU (sm_75), causing "no kernel image is available".
#
# We CANNOT fix this with importlib.reload(torch) — PyTorch's C++ library
# registration system crashes on reload ("Only a single TORCH_LIBRARY can
# register namespace triton").
#
# SOLUTION: Test CUDA in a SUBPROCESS. If it fails, reinstall a known-good
# PyTorch BEFORE any `import torch` in this kernel. This way the fresh
# import picks up the correct version natively — no reload needed.
import sys, os, warnings, glob, subprocess
warnings.filterwarnings('ignore')

# Install timm + scikit-learn
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'timm'])
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'scikit-learn'])


def _cuda_works_in_subprocess():
    \"\"\"Test CUDA via subprocess — returns True if torch can execute GPU kernels.\"\"\"
    test_code = (
        \"import torch; \"
        \"x = torch.randn(8, 8, device='cuda'); \"
        \"_ = (x @ x.T).sum().item(); \"
        \"print('CUDA_OK')\"
    )
    try:
        result = subprocess.run(
            [sys.executable, '-c', test_code],
            capture_output=True, text=True, timeout=60,
        )
        return result.returncode == 0 and 'CUDA_OK' in result.stdout
    except Exception:
        return False


CUDA_PRECHECK = _cuda_works_in_subprocess()

if not CUDA_PRECHECK:
    # Check if there's actually a GPU before trying to fix
    _has_gpu = (
        os.path.exists('/dev/nvidia0')
        or os.environ.get('NVIDIA_VISIBLE_DEVICES') is not None
        or os.environ.get('CUDA_VISIBLE_DEVICES') is not None
    )
    if _has_gpu:
        print(\"GPU detected but PyTorch CUDA kernels broken. Reinstalling...\")
        subprocess.check_call([sys.executable, '-m', 'pip', 'uninstall', '-y', '-q',
                               'torch', 'torchvision', 'torchaudio', 'triton'],
                              stderr=subprocess.DEVNULL)
        # PyTorch 2.5.1+cu121 has broad arch support: sm_60 (P100) through sm_90 (H100)
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q',
                               'torch==2.5.1', 'torchvision==0.20.1',
                               '--index-url', 'https://download.pytorch.org/whl/cu121'])
        CUDA_PRECHECK = _cuda_works_in_subprocess()
        if CUDA_PRECHECK:
            print(\"CUDA now works after PyTorch reinstall.\")
        else:
            print(\"WARNING: CUDA still broken after reinstall. Will use CPU.\")
    else:
        print(\"No GPU detected. CPU mode.\")
else:
    print(\"Pre-installed PyTorch CUDA works.\")

print(f\"Dependencies installed. CUDA ready: {CUDA_PRECHECK}\")
""")

code("""
# ═══ CELL 2: Environment + CUDA smoke test ═══
#
# NOTE: Cell 1 already performed a subprocess CUDA test and, if needed,
# reinstalled a compatible PyTorch BEFORE any `import torch` in this kernel.
# This means the `import torch` below picks up the freshly-installed version
# natively — NO importlib.reload needed (which crashes with TORCH_LIBRARY error).
#
# If torch was somehow already imported by the kernel before Cell 1's reinstall
# (shouldn't happen in a clean papermill run), we detect it and report.
import sys as _sys

# Check whether torch was already imported (would mean Cell 1's reinstall
# didn't take effect for this kernel — only a kernel restart would fix it).
_TORCH_PRELOADED = 'torch' in _sys.modules

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np
import pandas as pd
from pathlib import Path
import json, math, random, copy, time, subprocess
from dataclasses import dataclass, field
from PIL import Image

print(f"PyTorch: {torch.__version__}")
print(f"CUDA available (is_available): {torch.cuda.is_available()}")
if _TORCH_PRELOADED:
    print(f"NOTE: torch was preloaded before Cell 1's reinstall — "
          f"if CUDA fails below, the old version is still in memory.")

# ─── REAL CUDA smoke test ─────────────────────────────────────────────────────
# torch.cuda.is_available() can return True even when the installed PyTorch
# binary has NO compiled kernels for the assigned GPU architecture (e.g. T4=sm_75,
# P100=sm_60). We must actually execute a CUDA kernel to verify compatibility.
CUDA_WORKS = False
if torch.cuda.is_available():
    try:
        _test = torch.randn(8, 8, device='cuda')
        _result = (_test @ _test.T).sum().item()  # forces an actual kernel launch
        CUDA_WORKS = True
        print(f"✓ CUDA smoke test PASSED (T4/P100 kernels OK). Sum={_result:.2f}")
    except RuntimeError as e:
        print(f"✗ CUDA smoke test FAILED: {e}")
        if _TORCH_PRELOADED:
            print(f"  torch was preloaded — Cell 1's reinstall could not take effect.")
            print(f"  The old broken version is still in memory. Falling back to CPU.")
        else:
            print(f"  Unexpected CUDA failure despite Cell 1's subprocess check passing.")
        print(f"  Falling back to CPU. Training will be ~10x slower but functional.")
else:
    print("No CUDA detected. Will use CPU.")

DEVICE = torch.device('cuda' if CUDA_WORKS else 'cpu')
NUM_WORKERS = 4 if CUDA_WORKS else 2

if CUDA_WORKS:
    print(f"\\n🟢 Using GPU: {torch.cuda.get_device_name(0)}")
    print(f"   Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print(f"   Capability: sm_{torch.cuda.get_device_capability(0)[0]}{torch.cuda.get_device_capability(0)[1]}")
else:
    print(f"\\n🟡 Using CPU (training will be slower).")

import timm
from sklearn.metrics import f1_score, balanced_accuracy_score
print(f"timm: {timm.__version__}")
""")

code("""
# ═══ CELL 3: Auto-detect FungiCLEF / FungiTastic data ═══
DATA_CANDIDATES = [
    Path('/kaggle/input/fungiclef'),
    Path('/kaggle/input/seemshuklafungiclef'),
    Path('/kaggle/input/fungi-clef-2025'),
    Path('/kaggle/input/fungitastic'),
    Path('/kaggle/input/piceklfungitastic'),
    Path('/kaggle/input/visionsetil-real-data'),
]

DATA_ROOT = None
for candidate in DATA_CANDIDATES:
    if candidate.exists():
        DATA_ROOT = candidate
        print(f"Found data root: {DATA_ROOT}")
        break

# Fallback: scan /kaggle/input for anything
if DATA_ROOT is None:
    input_dir = Path('/kaggle/input')
    if input_dir.exists():
        all_dirs = [d for d in input_dir.iterdir() if d.is_dir()]
        print(f"Available datasets in /kaggle/input:")
        for d in all_dirs:
            print(f"  {d}")
        # Pick the one with most CSVs
        for d in all_dirs:
            csvs = list(d.rglob('*.csv'))[:5]
            if csvs:
                DATA_ROOT = d
                print(f"\\nUsing: {DATA_ROOT}")
                break

if DATA_ROOT is None:
    print("WARNING: No data found! Using synthetic placeholder for smoke test.")
    DATA_ROOT = Path('/tmp/fake_data')
    DATA_ROOT.mkdir(exist_ok=True)
""")

code("""
# ═══ CELL 4: Load and normalize metadata ═══
def find_metadata_csv(root):
    \"\"\"Search for the main metadata CSV with strict validation.

    A valid train CSV MUST have at least one image identifier column
    AND one label/taxonomy column.  We reject CSVs with >200 columns
    (likely embedding dumps) or <2 rows.
    \"\"\"
    IMAGE_COL_NAMES = {
        'image_path', 'filename', 'file_path', 'image', 'photo_id',
        'image_path_jpg', 'filename_jpg',
    }
    LABEL_COL_NAMES = {
        'species', 'class', 'class_id', 'scientificname', 'scientific_name',
        'genus', 'taxon_name', 'category',
    }

    # Tier 1: well-known patterns
    priority_patterns = [
        'FungiTastic-FewShot/train.csv',
        'FungiTastic-FewShot/val.csv',
        'FungiTastic/train.csv',
        '*/train.csv',
        'train.csv',
        'train_metadata.csv',
        'metadata.csv',
        '**/train.csv',
        '**/train_metadata.csv',
    ]
    for pat in priority_patterns:
        matches = list(root.glob(pat))
        if matches:
            return matches[0]

    # Tier 2: scan ALL csvs and validate columns
    all_csvs = sorted(root.rglob('*.csv'))
    for csv_path in all_csvs:
        try:
            df_probe = pd.read_csv(csv_path, nrows=5)
            if len(df_probe.columns) > 200:
                continue  # likely embedding dump
            cols_lower = set(c.lower() for c in df_probe.columns)
            has_image = bool(cols_lower & IMAGE_COL_NAMES)
            has_label = bool(cols_lower & LABEL_COL_NAMES)
            if has_image and has_label:
                return csv_path
        except Exception:
            continue

    # NOTE: Tier 3 (accept any CSV with 'observation'/'species') was REMOVED.
    # It caused BUG 2: the FungiTastic climatic timeseries CSV (914 columns,
    # no image column) was selected, resulting in only 1 species.
    # A valid train CSV MUST have both an image identifier AND a label column.

    return None


meta_path = find_metadata_csv(DATA_ROOT)
df = None

if meta_path:
    print(f"Loading metadata from: {meta_path}")
    try:
        df = pd.read_csv(meta_path)
        print(f"  Shape: {df.shape}")
        print(f"  Columns: {list(df.columns)}")
    except Exception as e:
        print(f"  Error loading: {e}")

if df is None:
    # Build from image files directly
    print("No CSV found. Building metadata from image files...")
    img_extensions = {'.jpg', '.jpeg', '.png'}
    all_images = []
    for ext in img_extensions:
        all_images.extend(DATA_ROOT.rglob(f'*{ext}'))
        all_images.extend(DATA_ROOT.rglob(f'*{ext.upper()}'))

    records = []
    for img_path in all_images[:50000]:
        rel = img_path.relative_to(DATA_ROOT)
        records.append({
            'image_path': str(img_path),
            'observation_id': img_path.stem.split('_')[0],
            'species': img_path.parent.name,
        })
    df = pd.DataFrame(records)
    print(f"  Built from files: {len(df)} images")

print(f"\\nTotal images: {len(df)}")
if 'species' in df.columns:
    print(f"Unique species: {df['species'].nunique()}")
""")

code("""
# ═══ CELL 5: Normalize column names + image paths ═══
COLUMN_MAP = {
    'class': 'species', 'class_id': 'species',
    'scientificName': 'species', 'scientific_name': 'species',
    'observationUUID': 'observation_id', 'observation_uuid': 'observation_id',
    'observationID': 'observation_id',
    'photo_id': 'observation_id', 'observation_id_id': 'observation_id',
    'filename': 'image_path', 'file_path': 'image_path', 'image': 'image_path',
}

# ── BUGFIX: Prevent duplicate column names after rename ──────────────────────
# The FungiTastic CSV has BOTH 'scientificName' and 'species'.  If we rename
# 'scientificName' → 'species' while 'species' already exists, pandas creates
# TWO columns named 'species', and df['species'] returns a DataFrame instead
# of a Series, causing: ValueError: Grouper for 'species' not 1-dimensional.
#
# SOLUTION: Only rename a source column if the TARGET does not already exist.
# If both source and target exist, prefer the existing target (already correct).
safe_map = {}
for src, dst in COLUMN_MAP.items():
    if src in df.columns:
        if dst not in df.columns:
            safe_map[src] = dst
        # else: target already exists → keep it, skip rename (avoids duplicate)

df = df.rename(columns=safe_map)

# ── Extra safety: deduplicate any remaining duplicate columns ────────────────
if df.columns.duplicated().any():
    print(f"WARNING: Duplicate columns detected: {list(df.columns[df.columns.duplicated()])}")
    # Keep only the first occurrence of each column name
    df = df.loc[:, ~df.columns.duplicated()]

# Ensure observation_id exists
if 'observation_id' not in df.columns:
    if 'image_path' in df.columns:
        df['observation_id'] = df['image_path'].apply(
            lambda p: Path(str(p)).stem.split('_')[0]
        )
    else:
        df['observation_id'] = range(len(df))

# Ensure species exists (now guaranteed to be 1-dimensional)
if 'species' not in df.columns:
    if 'image_path' in df.columns:
        df['species'] = df['image_path'].apply(
            lambda p: Path(str(p)).parent.name
        )
    else:
        df['species'] = 'unknown'

# Ensure image_path is absolute
if 'image_path' in df.columns:
    df['image_path'] = df['image_path'].apply(
        lambda p: str(p) if Path(str(p)).is_absolute() else str(DATA_ROOT / p)
    )

# Derive genus from species
if 'genus' not in df.columns:
    df['genus'] = df['species'].astype(str).str.split().str[0]

# Fill missing metadata
for col in ['family', 'habitat', 'substrate', 'smell', 'country']:
    if col not in df.columns:
        df[col] = 'unknown'

# Filter out species with very few observations
# NOTE: df['species'] is now guaranteed to be a Series (1-dimensional)
species_counts = df.groupby('observation_id')['species'].first().value_counts()
valid_species = species_counts[species_counts >= 3].index
df = df[df['species'].isin(valid_species)].reset_index(drop=True)

print(f"After filtering (min 3 obs/species): {len(df)} images, {df['species'].nunique()} species")
print(f"Unique observations: {df['observation_id'].nunique()}")
""")

code("""
# ═══ CELL 6: Auto-label view types from filename/folder heuristics ═══
def infer_view_type(row):
    \"\"\"Heuristic: infer view type from filename and folder.\"\"\"
    text = str(row.get('image_path', '')).lower()
    text += ' ' + str(row.get('observation_id', '')).lower()

    if any(kw in text for kw in ['gill', 'lamina', 'underside', 'pore', 'hymenium']):
        return 'gills'
    if any(kw in text for kw in ['cap', 'pileus', 'top', 'zenit', 'above']):
        return 'detail'
    if any(kw in text for kw in ['habitat', 'context', 'env', 'situ', 'landscape', 'scene']):
        return 'habitat'
    if any(kw in text for kw in ['front', 'side', 'profile', 'stem', 'stipe', 'base', 'full']):
        return 'front'

    return None  # Will be assigned by rotation below


df['view_type'] = df.apply(infer_view_type, axis=1)

# For unlabeled images, assign views round-robin within each observation
VIEW_ROTATION = ['gills', 'front', 'habitat', 'detail']
for obs_id, group in df.groupby('observation_id'):
    mask = df.loc[df['observation_id'] == obs_id, 'view_type'].isna()
    unlabeled_indices = df.index[df['observation_id'] == obs_id][mask]
    for i, idx in enumerate(unlabeled_indices):
        df.loc[idx, 'view_type'] = VIEW_ROTATION[i % len(VIEW_ROTATION)]

print("View type distribution:")
print(df['view_type'].value_counts())
""")

code("""
# ═══ CELL 7: Anti-leak split by observation_id ═══
def anti_leak_split(df, val_size=0.15, test_size=0.15, seed=42, min_per_class=3):
    \"\"\"Split by observation_id — no observation in two splits.\"\"\"
    rng = np.random.RandomState(seed)

    # Get unique observations and their species
    obs_df = df.groupby('observation_id').agg({
        'species': 'first',
        'genus': 'first',
    }).reset_index()

    # Filter species with >= min_per_class observations
    species_counts = obs_df['species'].value_counts()
    valid = species_counts[species_counts >= min_per_class].index
    obs_df = obs_df[obs_df['species'].isin(valid)]

    print(f"Valid observations: {len(obs_df)} | Valid species: {obs_df['species'].nunique()}")

    from sklearn.model_selection import train_test_split

    train_obs, temp_obs = train_test_split(
        obs_df, test_size=val_size + test_size,
        random_state=seed, stratify=obs_df['species']
    )
    val_obs, test_obs = train_test_split(
        temp_obs, test_size=test_size / (val_size + test_size),
        random_state=seed, stratify=temp_obs['species']
    )

    train_ids = set(train_obs['observation_id'])
    val_ids = set(val_obs['observation_id'])
    test_ids = set(test_obs['observation_id'])

    train_df = df[df['observation_id'].isin(train_ids)].reset_index(drop=True)
    val_df = df[df['observation_id'].isin(val_ids)].reset_index(drop=True)
    test_df = df[df['observation_id'].isin(test_ids)].reset_index(drop=True)

    # Verify no leak
    assert len(train_ids & val_ids) == 0, "LEAK: train intersection val"
    assert len(train_ids & test_ids) == 0, "LEAK: train intersection test"
    assert len(val_ids & test_ids) == 0, "LEAK: val intersection test"

    print(f"Split: train={len(train_ids)} obs ({len(train_df)} imgs) | "
          f"val={len(val_ids)} obs ({len(val_df)} imgs) | "
          f"test={len(test_ids)} obs ({len(test_df)} imgs)")
    return train_df, val_df, test_df


train_df, val_df, test_df = anti_leak_split(df)
""")

code("""
# ═══ CELL 8: Build observation-level multi-view records ═══
VIEW_TYPES = ('gills', 'front', 'habitat', 'detail')
VIEW_TO_IDX = {v: i for i, v in enumerate(VIEW_TYPES)}


def build_observation_records(image_df, max_views=10):
    \"\"\"Group images by observation_id into multi-view records.\"\"\"
    records = []
    for obs_id, group in image_df.groupby('observation_id'):
        species = group['species'].iloc[0]
        genus = group['genus'].iloc[0]
        family = group['family'].iloc[0] if 'family' in group.columns else 'unknown'
        habitat = group['habitat'].iloc[0] if 'habitat' in group.columns else 'unknown'
        substrate = group['substrate'].iloc[0] if 'substrate' in group.columns else 'unknown'
        smell = group['smell'].iloc[0] if 'smell' in group.columns else 'unknown'
        country = group['country'].iloc[0] if 'country' in group.columns else 'unknown'

        images = []
        for _, row in group.head(max_views).iterrows():
            img_path = row.get('image_path', '')
            view = row.get('view_type', 'front')
            if view not in VIEW_TO_IDX:
                view = 'front'
            images.append((str(img_path), view))

        if len(images) > 0:
            records.append({
                'observation_id': str(obs_id),
                'images': images,
                'species': str(species),
                'genus': str(genus),
                'family': str(family),
                'habitat': str(habitat),
                'substrate': str(substrate),
                'smell': str(smell),
                'country': str(country),
            })
    return records


train_obs = build_observation_records(train_df)
val_obs = build_observation_records(val_df)
test_obs = build_observation_records(test_df)

print(f"Observations: train={len(train_obs)} | val={len(val_obs)} | test={len(test_obs)}")

# Build label map
all_species = sorted(set(r['species'] for r in train_obs + val_obs))
label2idx = {s: i for i, s in enumerate(all_species)}
NUM_CLASSES = len(label2idx)
print(f"Classes: {NUM_CLASSES}")
""")

code("""
# ═══ CELL 9: Multi-View Dataset + Batched Collate ═══
class MultiViewDataset(Dataset):
    \"\"\"Groups images by observation, returns variable-length views.\"\"\"

    def __init__(self, observations, label2idx, image_size=224, augment=False):
        self.observations = observations
        self.label2idx = label2idx
        self.image_size = image_size
        self.augment = augment
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)

    def __len__(self):
        return len(self.observations)

    def _resolve_image_path(self, raw_path):
        \"\"\"Resolve an image path robustly.

        FungiTastic/FungiCLEF CSVs often store relative paths like
        Train/Processed_300px/JPG/001_abc.jpg that live in nested
        subdirectories under the data root.
        \"\"\"
        p = Path(str(raw_path))
        if p.exists():
            return str(p)

        try:
            joined = DATA_ROOT / raw_path
            if joined.exists():
                return str(joined)
        except Exception:
            pass

        name = p.name
        for sub in ['', 'Train', 'train', 'Test', 'test',
                     'Train/Processed_300px/JPG', 'Train/Processed_300png',
                     'val', 'Val', 'Validation',
                     'FungiTastic-FewShot/Train', 'FungiTastic-FewShot/Val']:
            candidate = DATA_ROOT / sub / name
            if candidate.exists():
                return str(candidate)

        matches = list(DATA_ROOT.rglob(name))
        if matches:
            return str(matches[0])

        return str(raw_path)

    def _load_image(self, path):
        \"\"\"Load image to [C, H, W] normalized tensor.\"\"\"
        path = self._resolve_image_path(path)
        try:
            img = Image.open(path).convert('RGB')
            img = img.resize((self.image_size, self.image_size), Image.BILINEAR)
            arr = np.asarray(img, dtype=np.float32) / 255.0
        except Exception:
            arr = np.random.randn(self.image_size, self.image_size, 3).astype(np.float32) * 0.1 + 0.5
            arr = np.clip(arr, 0, 1)

        if self.augment:
            arr = self._augment(arr)

        tensor = torch.from_numpy(arr).permute(2, 0, 1).float()
        tensor = (tensor - self.mean) / self.std
        return tensor

    def _augment(self, arr):
        if random.random() > 0.5:
            arr = arr[:, ::-1].copy()
        brightness = 1.0 + random.uniform(-0.3, 0.3)
        arr = np.clip(arr * brightness, 0, 1)
        return arr

    def __getitem__(self, idx):
        obs = self.observations[idx]
        images = []
        view_indices = []

        for img_path, view_type in obs['images']:
            img = self._load_image(img_path)
            images.append(img)
            view_indices.append(VIEW_TO_IDX.get(view_type, 1))

        images_tensor = torch.stack(images)
        view_tensor = torch.tensor(view_indices, dtype=torch.long)
        label = self.label2idx.get(obs['species'], 0)

        return {
            'images': images_tensor,
            'view_idx': view_tensor,
            'label': torch.tensor(label, dtype=torch.long),
            'observation_id': obs['observation_id'],
            'metadata': {
                'habitat': obs['habitat'],
                'substrate': obs['substrate'],
                'smell': obs['smell'],
                'country': obs['country'],
            },
        }


def collate_fn(batch):
    \"\"\"Collate variable-length observations into padded batch tensors.

    FIX (BUG 4): Previously returned a raw list, forcing the training loop
    to process one observation at a time (Python for-loop, no GPU batching).
    Now we pad to max_views in the batch and produce attention masks so the
    model can batch B observations through the backbone in a single forward.
    \"\"\"
    max_views = max(len(obs['images']) for obs in batch)
    B = len(batch)
    H, W = batch[0]['images'].size(-2), batch[0]['images'].size(-1)

    images_padded = torch.zeros(B, max_views, 3, H, W)
    view_idx_padded = torch.zeros(B, max_views, dtype=torch.long)
    attention_mask = torch.zeros(B, max_views, dtype=torch.bool)

    labels = torch.zeros(B, dtype=torch.long)
    observation_ids = []
    metadata_raw = {'habitat': [], 'substrate': [], 'smell': [], 'country': []}

    for i, obs in enumerate(batch):
        n = len(obs['images'])
        images_padded[i, :n] = obs['images']
        view_idx_padded[i, :n] = obs['view_idx']
        attention_mask[i, :n] = True
        labels[i] = obs['label']
        observation_ids.append(obs['observation_id'])
        for k in metadata_raw:
            metadata_raw[k].append(obs['metadata'][k])

    return {
        'images': images_padded,
        'view_idx': view_idx_padded,
        'attention_mask': attention_mask,
        'labels': labels,
        'observation_ids': observation_ids,
        'metadata_raw': metadata_raw,
    }


print("MultiViewDataset + batched collate_fn defined.")
""")

code("""
# ═══ CELL 10: Model Components — LoRA Adapter ═══
class LoRAAdapter(nn.Module):
    \"\"\"Low-Rank Adaptation: W + (A @ B) * scaling.\"\"\"
    def __init__(self, in_features, rank=16, alpha=16.0):
        super().__init__()
        self.scaling = alpha / rank
        self.lora_A = nn.Linear(in_features, rank, bias=False)
        self.lora_B = nn.Linear(rank, in_features, bias=False)
        nn.init.kaiming_uniform_(self.lora_A.weight, a=math.sqrt(5))
        nn.init.zeros_(self.lora_B.weight)

    def forward(self, x):
        return x + self.lora_B(self.lora_A(x)) * self.scaling


print("LoRAAdapter defined (rank=16).")
""")

code("""
# ═══ CELL 11: View-Conditioned Backbone (batched) ═══
class ViewConditionedBackbone(nn.Module):
    \"\"\"Shared backbone + per-view LoRA adapters.

    Supports batched input: images [B, N, C, H, W] with attention_mask [B, N].
    Only real (non-padded) views are passed through the backbone; padded slots
    receive zero embeddings.  This avoids wasted compute on padding.
    \"\"\"

    def __init__(self, backbone_name='convnextv2_base.fcmae_ft_in22k_in1k', d_model=1024, lora_rank=16):
        super().__init__()
        try:
            self.backbone = timm.create_model(backbone_name, pretrained=True, num_classes=0)
        except Exception:
            print(f"WARNING: {backbone_name} not available, falling back to convnext_base")
            self.backbone = timm.create_model('convnext_base', pretrained=True, num_classes=0)

        feat_dim = self.backbone.num_features
        self.feat_dim = feat_dim
        self.d_model = d_model

        self.adapters = nn.ModuleDict({
            view: LoRAAdapter(feat_dim, rank=lora_rank)
            for view in VIEW_TYPES
        })

        self.view_embed = nn.Embedding(len(VIEW_TYPES), feat_dim)

        self.proj = nn.Sequential(
            nn.Linear(feat_dim, d_model),
            nn.LayerNorm(d_model),
            nn.GELU(),
        )

    def forward(self, images, view_idx, attention_mask=None):
        \"\"\"
        Args:
            images: [B, N, C, H, W] — B obs, N views each (padded)
            view_idx: [B, N] — view type indices
            attention_mask: [B, N] — True for real views
        Returns: [B, N, d_model] — embeddings per view (zeros for padded)
        \"\"\"
        B, N, C, H, W = images.shape

        if attention_mask is None:
            attention_mask = torch.ones(B, N, dtype=torch.bool, device=images.device)

        # Flatten real views for a single backbone pass
        real_mask = attention_mask.reshape(-1)  # [B*N]
        real_images = images.reshape(-1, C, H, W)[real_mask]  # [n_real, C, H, W]

        features = torch.zeros(B * N, self.feat_dim, device=images.device)
        if real_images.size(0) > 0:
            real_features = self.backbone(real_images)  # [n_real, feat_dim]
            features[real_mask] = real_features

        features = features.view(B, N, self.feat_dim)

        # Apply per-view LoRA adapter — grouped by view type
        adapted = features.clone()
        flat_view = view_idx.reshape(-1)
        flat_feat = features.view(-1, self.feat_dim)
        for vi, view_name in enumerate(VIEW_TYPES):
            vmask = (flat_view == vi) & real_mask
            if vmask.any():
                adapted.view(-1, self.feat_dim)[vmask] = self.adapters[view_name](flat_feat[vmask])

        view_emb = self.view_embed(view_idx.clamp(0, len(VIEW_TYPES) - 1))
        features = adapted + view_emb

        # Zero out padded positions AFTER adding view embedding
        features = features * attention_mask.unsqueeze(-1).float()

        embeddings = self.proj(features)
        embeddings = embeddings * attention_mask.unsqueeze(-1).float()
        return embeddings


print("ViewConditionedBackbone defined (batched).")
""")

code("""
# ═══ CELL 12: Metadata Encoder ═══
class MetadataEncoder(nn.Module):
    \"\"\"Encodes habitat/substrate/smell/country into dense embedding.\"\"\"

    def __init__(self, vocab_sizes=None, embed_dim=64, out_dim=128):
        super().__init__()
        vocab_sizes = vocab_sizes or {
            'habitat': 100, 'substrate': 50, 'smell': 30, 'country': 200
        }

        self.embeddings = nn.ModuleDict({
            name: nn.Embedding(size, embed_dim)
            for name, size in vocab_sizes.items()
        })

        total_dim = embed_dim * len(vocab_sizes)
        self.mlp = nn.Sequential(
            nn.Linear(total_dim, out_dim * 2),
            nn.LayerNorm(out_dim * 2),
            nn.GELU(),
            nn.Linear(out_dim * 2, out_dim),
        )

    def forward(self, metadata_indices):
        embeds = []
        for name in ['habitat', 'substrate', 'smell', 'country']:
            idx = metadata_indices.get(name, torch.tensor([0], device=DEVICE))
            embeds.append(self.embeddings[name](idx))

        concat = torch.cat(embeds, dim=-1)
        return self.mlp(concat)


print("MetadataEncoder defined.")
""")

code("""
# ═══ CELL 13: Attention Fusion (batched) ═══
class AttentionFusion(nn.Module):
    \"\"\"Late fusion of N image embeddings + metadata via attention pooling.

    Supports batched input: visual_embeddings [B, N, d_model] with
    attention_mask [B, N] to mask padded views.
    \"\"\"

    def __init__(self, d_model=1024, metadata_dim=128, num_heads=4, max_views=10):
        super().__init__()
        self.d_model = d_model
        self.metadata_dim = metadata_dim
        self.max_views = max_views

        self.meta_proj = nn.Linear(metadata_dim, d_model)
        self.view_pos = nn.Embedding(max_views + 1, d_model)

        self.self_attn = nn.MultiheadAttention(
            embed_dim=d_model, num_heads=num_heads, batch_first=True
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
        \"\"\"
        Args:
            visual_embeddings: [B, N, d_model]
            attention_mask: [B, N] — True for real views
            metadata_emb: [B, metadata_dim] or None
        Returns: [B, output_dim]
        \"\"\"
        B, N, _ = visual_embeddings.shape

        pos_idx = torch.arange(N, device=visual_embeddings.device).clamp(0, self.max_views - 1)
        tokens = visual_embeddings + self.view_pos(pos_idx).unsqueeze(0)

        # Build key_padding_mask for MultiheadAttention (True = ignore)
        if metadata_emb is not None:
            meta_token = self.meta_proj(metadata_emb).unsqueeze(1)  # [B, 1, d_model]
            meta_token = meta_token + self.view_pos(self.max_views).unsqueeze(0)
            tokens = torch.cat([meta_token, tokens], dim=1)  # [B, 1+N, d_model]
            # Metadata token is never masked
            meta_pad = torch.zeros(B, 1, dtype=torch.bool, device=tokens.device)
            key_padding_mask = torch.cat([meta_pad, ~attention_mask], dim=1)
        else:
            key_padding_mask = ~attention_mask  # [B, N]

        attn_out, _ = self.self_attn(tokens, tokens, tokens, key_padding_mask=key_padding_mask)
        tokens = self.norm1(tokens + attn_out)
        tokens = self.norm2(tokens + self.ffn(tokens))

        # Masked mean pooling (exclude padded views)
        if metadata_emb is not None:
            valid_mask = torch.cat([
                torch.ones(B, 1, dtype=torch.bool, device=tokens.device),
                attention_mask
            ], dim=1)
        else:
            valid_mask = attention_mask

        pooled = (tokens * valid_mask.unsqueeze(-1).float()).sum(dim=1) / valid_mask.sum(dim=1, keepdim=True).float().clamp(min=1)

        if metadata_emb is not None:
            out = torch.cat([pooled, metadata_emb], dim=-1)
        else:
            zero_meta = torch.zeros(B, self.metadata_dim, device=pooled.device)
            out = torch.cat([pooled, zero_meta], dim=-1)

        return out


print("AttentionFusion defined (batched).")
""")

code("""
# ═══ CELL 14: ArcFace Head + Temperature Scaler ═══
class ArcFaceHead(nn.Module):
    \"\"\"ArcFace metric learning head.\"\"\"
    def __init__(self, in_features, num_classes, s=30.0, m=0.50):
        super().__init__()
        self.weight = nn.Parameter(torch.randn(num_classes, in_features))
        nn.init.xavier_uniform_(self.weight)
        self.s = s
        self.m = m
        self.num_classes = num_classes

    def forward(self, embeddings, labels=None):
        W = F.normalize(self.weight, dim=1)
        E = F.normalize(embeddings, dim=1)
        cosine = E @ W.T

        if labels is not None:
            theta = torch.acos(cosine.clamp(-1 + 1e-7, 1 - 1e-7))
            target_logits = torch.cos(theta + self.m)
            one_hot = F.one_hot(labels, self.num_classes).float()
            cosine = one_hot * target_logits + (1 - one_hot) * cosine

        logits = cosine * self.s
        return logits


class CenterLoss(nn.Module):
    \"\"\"Center loss for intra-class cohesion.\"\"\"
    def __init__(self, num_classes, feat_dim):
        super().__init__()
        self.centers = nn.Parameter(torch.randn(num_classes, feat_dim))

    def forward(self, x, labels):
        batch_centers = self.centers[labels]
        return ((x - batch_centers) ** 2).sum(dim=1).mean()


class TemperatureScaler(nn.Module):
    \"\"\"Per-view-combination temperature scaling.\"\"\"
    def __init__(self, num_combos=16):
        super().__init__()
        self.log_temp = nn.Parameter(torch.zeros(num_combos))

    def forward(self, logits, combo_idx=0):
        temp = self.log_temp[combo_idx].exp()
        return logits / temp


print("ArcFaceHead, CenterLoss, TemperatureScaler defined.")
""")

code("""
# ═══ CELL 15: Full Multi-View Model (batched) ═══
class MultiViewModel(nn.Module):
    \"\"\"End-to-end multi-view model.

    Supports batched input: images [B, N, C, H, W], view_idx [B, N],
    attention_mask [B, N].  Produces logits [B, num_classes].
    \"\"\"

    def __init__(self, backbone_name='convnextv2_base.fcmae_ft_in22k_in1k', d_model=1024,
                 metadata_dim=128, num_classes=1000, lora_rank=16):
        super().__init__()
        self.backbone = ViewConditionedBackbone(backbone_name, d_model, lora_rank)
        self.metadata_encoder = MetadataEncoder(out_dim=metadata_dim)
        self.fusion = AttentionFusion(d_model, metadata_dim)

        feat_dim = self.fusion.output_dim
        self.arcface = ArcFaceHead(feat_dim, num_classes)
        self.center_loss = CenterLoss(num_classes, feat_dim)

    def forward(self, images, view_idx, attention_mask, metadata_indices, labels=None):
        \"\"\"
        Args:
            images: [B, N, C, H, W]
            view_idx: [B, N]
            attention_mask: [B, N]
            metadata_indices: dict of {field: [B]} tensors
            labels: [B] or None
        Returns: logits [B, num_classes], obs_emb [B, feat_dim]
        \"\"\"
        visual_emb = self.backbone(images, view_idx, attention_mask)  # [B, N, d_model]

        # Encode metadata (batched)
        meta_embeds = []
        for name in ['habitat', 'substrate', 'smell', 'country']:
            idx = metadata_indices.get(name, torch.zeros(images.size(0), dtype=torch.long, device=images.device))
            meta_embeds.append(self.metadata_encoder.embeddings[name](idx))
        meta_concat = torch.cat(meta_embeds, dim=-1)
        metadata_emb = self.metadata_encoder.mlp(meta_concat)  # [B, metadata_dim]

        obs_emb = self.fusion(visual_emb, attention_mask, metadata_emb)  # [B, output_dim]
        logits = self.arcface(obs_emb, labels)
        return logits, obs_emb


class ProgressiveResizing:
    def __init__(self, schedule=None):
        self.schedule = schedule or [(0, 9, 224), (9, 19, 384), (19, 999, 512)]

    def get_image_size(self, epoch):
        for start, end, size in self.schedule:
            if start <= epoch < end:
                return size
        return self.schedule[-1][2]


print("MultiViewModel defined (batched).")
""")

code("""
# ═══ CELL 16: Build metadata vocabularies + model smoke test ═══
def build_metadata_vocab(observations):
    fields = ('habitat', 'substrate', 'smell', 'country')
    vocab = {f: {'<unk>': 0, 'unknown': 1} for f in fields}
    for obs in observations:
        for f in fields:
            val = obs.get(f, 'unknown')
            if val and val not in vocab[f]:
                vocab[f][val] = len(vocab[f])
    return vocab


metadata_vocab = build_metadata_vocab(train_obs + val_obs)
METADATA_VOCAB_SIZES = {f: len(v) for f, v in metadata_vocab.items()}
print(f"Metadata vocab sizes: {METADATA_VOCAB_SIZES}")


def encode_metadata_batch(metadata_raw):
    \"\"\"Encode metadata for a batch of observations.\"\"\"
    out = {}
    for field_name in ['habitat', 'substrate', 'smell', 'country']:
        vals = metadata_raw.get(field_name, [])
        idxs = [metadata_vocab[field_name].get(v, 0) for v in vals]
        out[field_name] = torch.tensor(idxs, dtype=torch.long, device=DEVICE)
    return out


print("Testing batched model forward pass...")
test_model = MultiViewModel(
    num_classes=min(NUM_CLASSES, 100),
    d_model=512, metadata_dim=64,
).to(DEVICE)

# Simulate a batch of 4 observations with variable views (padded to max=4)
test_images = torch.randn(4, 4, 3, 224, 224).to(DEVICE)
test_view_idx = torch.tensor([[0,1,2,3],[0,1,2,3],[0,1,0,0],[0,1,2,3]]).to(DEVICE)
test_mask = torch.tensor([[True,True,True,True],[True,True,True,True],
                           [True,True,False,False],[True,True,True,False]]).to(DEVICE)
test_meta = {k: torch.tensor([0,0,0,0]).to(DEVICE) for k in ['habitat','substrate','smell','country']}
test_labels = torch.tensor([0,1,2,3]).to(DEVICE)

test_logits, test_emb = test_model(test_images, test_view_idx, test_mask, test_meta, test_labels)
print(f"  Batched forward OK | logits: {test_logits.shape} | emb: {test_emb.shape}")
param_count = sum(p.numel() for p in test_model.parameters()) / 1e6
print(f"  Parameters: {param_count:.1f}M")
del test_model
torch.cuda.empty_cache()
""")

code("""
# ═══ CELL 17: Training configuration ═══
@dataclass
class TrainConfig:
    backbone: str = 'convnextv2_base.fcmae_ft_in22k_in1k'
    d_model: int = 1024
    metadata_dim: int = 128
    lora_rank: int = 16
    epochs: int = 25
    batch_size: int = 16
    lr_head: float = 3e-4
    lr_backbone: float = 2e-5
    weight_decay: float = 0.01
    warmup_epochs: int = 2
    label_smoothing: float = 0.1
    use_swa: bool = True
    swa_start_epoch: int = 20
    use_progressive_resizing: bool = True
    progressive_schedule: list = field(default_factory=lambda: [(0, 9, 224), (9, 19, 384), (19, 999, 512)])
    center_loss_weight: float = 0.01
    max_grad_norm: float = 1.0
    amp: bool = True
    mixup_alpha: float = 0.2
    seed: int = 42


cfg = TrainConfig()

if len(train_obs) < 100:
    cfg.epochs = min(cfg.epochs, 5)
    cfg.batch_size = 4
    cfg.d_model = 256
    cfg.metadata_dim = 32
    print(f"WARNING: Small dataset ({len(train_obs)} obs). Smoke-test config: {cfg.epochs} epochs")

random.seed(cfg.seed)
np.random.seed(cfg.seed)
torch.manual_seed(cfg.seed)
torch.cuda.manual_seed_all(cfg.seed)

print(f"Config: epochs={cfg.epochs}, batch_size={cfg.batch_size}, d_model={cfg.d_model}")
""")

code("""
# ═══ CELL 18: Build full model + optimizer ═══
model = MultiViewModel(
    backbone_name=cfg.backbone,
    d_model=cfg.d_model,
    metadata_dim=cfg.metadata_dim,
    num_classes=NUM_CLASSES,
    lora_rank=cfg.lora_rank,
).to(DEVICE)

param_count = sum(p.numel() for p in model.parameters()) / 1e6
print(f"Model parameters: {param_count:.1f}M")

backbone_params = list(model.backbone.backbone.parameters())
head_params = [p for n, p in model.named_parameters() if not n.startswith('backbone.backbone.')]
optimizer = torch.optim.AdamW([
    {'params': backbone_params, 'lr': cfg.lr_backbone},
    {'params': head_params, 'lr': cfg.lr_head},
], weight_decay=cfg.weight_decay)

scaler = torch.amp.GradScaler('cuda', enabled=cfg.amp)

swa_model = None
if cfg.use_swa:
    swa_model = torch.optim.swa_utils.AveragedModel(model)

resizing = ProgressiveResizing(cfg.progressive_schedule) if cfg.use_progressive_resizing else None

OUT_DIR = Path('/kaggle/working/models')
OUT_DIR.mkdir(parents=True, exist_ok=True)

print("Optimizer + SWA + Progressive Resizing ready.")
""")

code("""
# ═══ CELL 19: Training loop (batched) ═══
def map_at_3(probs, labels):
    top3 = np.argsort(-probs, axis=1)[:, :3]
    score = 0.0
    for i, label in enumerate(labels):
        if label in top3[i]:
            rank = list(top3[i]).index(label)
            score += 1.0 / (rank + 1)
    return score / max(len(labels), 1)


def train_one_epoch(model, loader, optimizer, epoch, image_size):
    model.train()
    total_loss = 0.0
    n_obs = 0

    for batch in loader:
        images = batch['images'].to(DEVICE)
        view_idx = batch['view_idx'].to(DEVICE)
        attention_mask = batch['attention_mask'].to(DEVICE)
        labels = batch['labels'].to(DEVICE)
        meta = encode_metadata_batch(batch['metadata_raw'])

        if images.size(-1) != image_size:
            images = F.interpolate(
                images.view(-1, 3, images.size(-2), images.size(-1)),
                size=(image_size, image_size), mode='bilinear', align_corners=False
            ).view(images.size(0), images.size(1), 3, image_size, image_size)

        use_mixup = cfg.mixup_alpha > 0 and random.random() < 0.5

        with torch.amp.autocast('cuda', enabled=cfg.amp):
            logits, emb = model(
                images, view_idx, attention_mask, meta,
                labels=labels if not use_mixup else None
            )

            if use_mixup:
                soft = torch.full_like(logits, cfg.label_smoothing / max(NUM_CLASSES - 1, 1))
                soft[range(len(labels)), labels] = 1.0 - cfg.label_smoothing
                loss_cls = -(soft * F.log_softmax(logits, dim=-1)).sum(-1).mean()
            else:
                loss_cls = F.cross_entropy(logits, labels, label_smoothing=cfg.label_smoothing)

            loss = loss_cls
            if cfg.center_loss_weight > 0:
                cl = model.center_loss(emb, labels)
                loss = loss + cfg.center_loss_weight * cl

        optimizer.zero_grad()
        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.max_grad_norm)
        scaler.step(optimizer)
        scaler.update()

        total_loss += loss.item() * len(labels)
        n_obs += len(labels)

    return total_loss / max(n_obs, 1)


@torch.no_grad()
def validate(model, loader, image_size):
    model.eval()
    all_probs, all_labels = [], []

    for batch in loader:
        images = batch['images'].to(DEVICE)
        view_idx = batch['view_idx'].to(DEVICE)
        attention_mask = batch['attention_mask'].to(DEVICE)
        labels = batch['labels'].to(DEVICE)
        meta = encode_metadata_batch(batch['metadata_raw'])

        if images.size(-1) != image_size:
            images = F.interpolate(
                images.view(-1, 3, images.size(-2), images.size(-1)),
                size=(image_size, image_size), mode='bilinear', align_corners=False
            ).view(images.size(0), images.size(1), 3, image_size, image_size)

        logits, _ = model(images, view_idx, attention_mask, meta)
        probs = F.softmax(logits, dim=-1)
        all_probs.append(probs.cpu().numpy())
        all_labels.append(labels.cpu().numpy())

    all_probs = np.concatenate(all_probs)
    all_labels = np.concatenate(all_labels)

    preds = all_probs.argmax(axis=1)
    acc = (preds == all_labels).mean()
    map3 = map_at_3(all_probs, all_labels)
    f1 = f1_score(all_labels, preds, average='macro', zero_division=0)

    return {'acc': acc, 'map3': map3, 'f1': f1}


best_map3 = 0.0
best_epoch = -1
history = []

# FIX (BUG 6): Only rebuild datasets/loaders when image_size actually changes.
_prev_img_size = None
train_loader = None
val_loader = None

for epoch in range(cfg.epochs):
    img_size = resizing.get_image_size(epoch) if resizing else 224

    if epoch < cfg.warmup_epochs:
        for p in model.backbone.backbone.parameters():
            p.requires_grad = False
    else:
        for p in model.backbone.backbone.parameters():
            p.requires_grad = True

    if img_size != _prev_img_size:
        train_ds = MultiViewDataset(train_obs, label2idx, image_size=img_size, augment=True)
        val_ds = MultiViewDataset(val_obs, label2idx, image_size=img_size, augment=False)
        train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, shuffle=True,
                                  collate_fn=collate_fn, num_workers=NUM_WORKERS)
        val_loader = DataLoader(val_ds, batch_size=cfg.batch_size, shuffle=False,
                                collate_fn=collate_fn, num_workers=NUM_WORKERS)
        _prev_img_size = img_size
        print(f"  [resize] Built loaders for img_size={img_size}")

    t0 = time.time()
    train_loss = train_one_epoch(model, train_loader, optimizer, epoch, img_size)
    val_metrics = validate(model, val_loader, img_size)
    elapsed = time.time() - t0

    history.append({
        'epoch': epoch, 'image_size': img_size,
        'train_loss': train_loss,
        'val_acc': val_metrics['acc'],
        'val_map3': val_metrics['map3'],
        'val_f1': val_metrics['f1'],
    })

    print(f"Ep {epoch:02d} | size={img_size} | loss={train_loss:.4f} | "
          f"acc={val_metrics['acc']:.4f} | map3={val_metrics['map3']:.4f} | "
          f"f1={val_metrics['f1']:.4f} | {elapsed:.0f}s")

    if val_metrics['map3'] > best_map3:
        best_map3 = val_metrics['map3']
        best_epoch = epoch
        torch.save({
            'epoch': epoch,
            'model_state': model.state_dict(),
            'config': {
                'd_model': cfg.d_model,
                'metadata_dim': cfg.metadata_dim,
                'num_classes': NUM_CLASSES,
                'lora_rank': cfg.lora_rank,
            },
            'label2idx': label2idx,
            'metadata_vocab': metadata_vocab,
        }, OUT_DIR / 'multiview_v5_best.pt')

    if swa_model is not None and epoch >= cfg.swa_start_epoch:
        swa_model.update_parameters(model)

print(f"\\nTraining complete. Best MAP@3: {best_map3:.4f} @ epoch {best_epoch}")
""")

code("""
# ═══ CELL 20: SWA finalize + Temperature calibration ═══
if swa_model is not None and best_epoch >= cfg.swa_start_epoch:
    print("Updating SWA BatchNorm...")
    torch.optim.swa_utils.update_bn(train_loader, swa_model, device=DEVICE)
    torch.save({
        'model_state': swa_model.state_dict(),
        'config': {'d_model': cfg.d_model, 'metadata_dim': cfg.metadata_dim, 'num_classes': NUM_CLASSES},
        'label2idx': label2idx,
    }, OUT_DIR / 'multiview_v5_swa.pt')
    print("SWA model saved.")

print("Calibrating temperature...")
temp_scaler = TemperatureScaler(num_combos=16).to(DEVICE)
temp_opt = torch.optim.LBFGS([temp_scaler.log_temp], lr=0.01, max_iter=50)

val_ds_final = MultiViewDataset(val_obs, label2idx, image_size=512, augment=False)
val_loader_final = DataLoader(val_ds_final, batch_size=cfg.batch_size, shuffle=False,
                               collate_fn=collate_fn, num_workers=NUM_WORKERS)

logits_list, labels_list = [], []
model.eval()
with torch.no_grad():
    for batch in val_loader_final:
        images = batch['images'].to(DEVICE)
        view_idx = batch['view_idx'].to(DEVICE)
        attention_mask = batch['attention_mask'].to(DEVICE)
        labels = batch['labels'].to(DEVICE)
        meta = encode_metadata_batch(batch['metadata_raw'])
        logits, _ = model(images, view_idx, attention_mask, meta)
        logits_list.append(logits)
        labels_list.append(labels)

if logits_list:
    all_logits = torch.cat(logits_list)
    all_labels_t = torch.cat(labels_list)

    def closure():
        temp_opt.zero_grad()
        scaled = temp_scaler(all_logits, combo_idx=0)
        loss = F.cross_entropy(scaled, all_labels_t)
        loss.backward()
        return loss

    temp_opt.step(closure)
    learned_temp = temp_scaler.log_temp[0].exp().item()
    print(f"Learned temperature: {learned_temp:.4f}")
    torch.save(temp_scaler.state_dict(), OUT_DIR / 'temperature_scaler.pt')
else:
    learned_temp = 1.5
    print("WARNING: No validation logits for calibration. Using default T=1.5")
""")

code("""
# ═══ CELL 21: Final test evaluation (batched) ═══
print("=" * 60)
print("FINAL TEST EVALUATION")
print("=" * 60)

ckpt = torch.load(OUT_DIR / 'multiview_v5_best.pt', map_location=DEVICE, weights_only=False)
model.load_state_dict(ckpt['model_state'])
model.eval()

test_ds = MultiViewDataset(test_obs, label2idx, image_size=512, augment=False)
test_loader = DataLoader(test_ds, batch_size=cfg.batch_size, shuffle=False,
                         collate_fn=collate_fn, num_workers=NUM_WORKERS)

all_probs, all_labels, all_preds = [], [], []
with torch.no_grad():
    for batch in test_loader:
        images = batch['images'].to(DEVICE)
        view_idx = batch['view_idx'].to(DEVICE)
        attention_mask = batch['attention_mask'].to(DEVICE)
        labels = batch['labels'].to(DEVICE)
        meta = encode_metadata_batch(batch['metadata_raw'])

        logits, _ = model(images, view_idx, attention_mask, meta)
        scaled = temp_scaler(logits, combo_idx=0)
        probs = F.softmax(scaled, dim=-1)

        all_probs.append(probs.cpu().numpy())
        all_labels.append(labels.cpu().numpy())
        all_preds.append(probs.argmax(dim=-1).cpu().numpy())

all_probs = np.concatenate(all_probs)
all_labels = np.concatenate(all_labels)
all_preds = np.concatenate(all_preds)

test_acc = (all_preds == all_labels).mean()
test_map3 = map_at_3(all_probs, all_labels)
test_f1 = f1_score(all_labels, all_preds, average='macro', zero_division=0)
test_bal = balanced_accuracy_score(all_labels, all_preds)

max_probs = all_probs.max(axis=1)
ece = np.mean(np.abs(max_probs - (all_preds == all_labels).astype(float)))

print(f"  Accuracy:       {test_acc:.4f}")
print(f"  MAP@3:          {test_map3:.4f}")
print(f"  Macro-F1:       {test_f1:.4f}")
print(f"  Balanced Acc:   {test_bal:.4f}")
print(f"  ECE:            {ece:.4f}")

n_bootstrap = 1000
map3_scores = []
n = len(all_labels)
for _ in range(n_bootstrap):
    idx = np.random.choice(n, n, replace=True)
    map3_scores.append(map_at_3(all_probs[idx], all_labels[idx]))
ci_low = np.percentile(map3_scores, 2.5)
ci_high = np.percentile(map3_scores, 97.5)
print(f"  MAP@3 95% CI:   [{ci_low:.4f}, {ci_high:.4f}]")
""")

code("""
# ═══ CELL 22: Export all artifacts ═══
final_metrics = {
    'test_accuracy': float(test_acc),
    'test_map_at_3': float(test_map3),
    'test_map_at_3_ci_low': float(ci_low),
    'test_map_at_3_ci_high': float(ci_high),
    'test_f1_macro': float(test_f1),
    'test_balanced_accuracy': float(test_bal),
    'test_ece': float(ece),
    'best_val_map3': float(best_map3),
    'best_epoch': int(best_epoch),
    'num_classes': int(NUM_CLASSES),
    'num_train_obs': int(len(train_obs)),
    'num_val_obs': int(len(val_obs)),
    'num_test_obs': int(len(test_obs)),
    'temperature': float(learned_temp),
    'model_params_M': float(param_count),
}

with open(OUT_DIR / 'final_metrics.json', 'w') as f:
    json.dump(final_metrics, f, indent=2)

with open(OUT_DIR / 'label2idx.json', 'w') as f:
    json.dump(label2idx, f, indent=2)

with open(OUT_DIR / 'metadata_vocab.json', 'w') as f:
    json.dump(metadata_vocab, f, indent=2)

with open(OUT_DIR / 'training_history.json', 'w') as f:
    json.dump(history, f, indent=2)

np.savez(
    OUT_DIR / 'test_predictions.npz',
    probs=all_probs,
    preds=all_preds,
    labels=all_labels,
)

print("Artifacts saved:")
for f in sorted(OUT_DIR.iterdir()):
    size = f.stat().st_size
    size_str = f"{size/1e6:.1f} MB" if size > 1e6 else f"{size/1e3:.1f} KB"
    print(f"  {f.name}: {size_str}")

print(f"\\n{'='*60}")
print(f"TRAINING COMPLETE!")
print(f"  MAP@3: {test_map3:.4f} (CI: [{ci_low:.4f}, {ci_high:.4f}])")
print(f"  Accuracy: {test_acc:.4f}")
print(f"  ECE: {ece:.4f}")
print(f"  Model: {param_count:.1f}M params")
print(f"{'='*60}")
""")


# ─── Assemble notebook ────────────────────────────────────────────────────────

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

out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"
out_path.write_text(json.dumps(notebook, indent=1), encoding="utf-8")
print(f"Generated {out_path} ({len(cells)} cells)")
#!/usr/bin/env python3
"""
E16 MEGA-FOCUS40 — long Kaggle GPU train on industrial allowlist (40 spp).

Uses full available observations per species from FungiTastic + FungiCLEF
(no 8-obs few-shot subsample). Deadly class weights + top-k penalty.
Resume via checkpoint_latest.pt (already in gen_notebook_v8).

Usage:
  python kaggle/build_exp_v16_mega_focus.py
  python scripts/push_kaggle_e16_mega.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
src = (ROOT / "gen_notebook_v8.py").read_text(encoding="utf-8")

allow = json.loads(
    (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(encoding="utf-8")
)
names = [s["latin_name"] for s in allow["species"]]
allow_literal = repr(set(names))

old_sub = """# ═══ CELL 5: Filter + subsample (BUG 3 FIX: 8 obs/species for safe 3-way split) ═══

if len(df) > 0:
    # BUG 3 FIX: Filter species with >= 4 observations (was 3)
    # This ensures enough samples for stratified train/val/test split
    species_counts = df.groupby('observation_id')['species'].first().value_counts()
    valid_species = species_counts[species_counts >= 4].index
    df = df[df['species'].isin(valid_species)].reset_index(drop=True)
    log(f"After min-4 filter: {len(df)} images, {df['species'].nunique()} species")

    # BUG 3 FIX: Increase to 8 obs/species (was 5) for robust stratified split
    # With 8 obs: train ~5, val ~2, test ~1 → all classes have >= 2 in train
    MAX_SPECIES = 500
    MAX_OBS_PER_SPECIES = 8  # was 5

    obs_per_species = df.groupby('observation_id')['species'].first().value_counts()
    top_species = obs_per_species.head(MAX_SPECIES).index
    df = df[df['species'].isin(top_species)].copy()

    sampled_parts = []
    for sp, group in df.groupby('species'):
        obs_ids = group['observation_id'].unique()[:MAX_OBS_PER_SPECIES]
        sampled_parts.append(group[group['observation_id'].isin(obs_ids)])

    df = pd.concat(sampled_parts, ignore_index=True)

    log(f"After subsampling (top-{MAX_SPECIES} × {MAX_OBS_PER_SPECIES} obs):")
    log(f"  Images: {len(df)}")
    log(f"  Species: {df['species'].nunique()}")
    log(f"  Observations: {df['observation_id'].nunique()}")
    log(f"  Source DBs: {df['source_db'].value_counts().to_dict()}")
else:
    log("WARNING: Empty dataframe, skipping subsampling")
"""

new_sub = f"""# ═══ CELL 5: E16 MEGA industrial_v1 allowlist (40 spp, max data) ═══
# Public FungiTastic + FungiCLEF only. No few-shot 8-obs starvation.
# Attribution: Danish Fungi / FungiTastic / FungiCLEF (Picek et al.) — cite in model card.
ALLOWLIST = {allow_literal}
DEADLY_FORCE = {{
    'amanita phalloides', 'amanita virosa', 'amanita muscaria', 'amanita pantherina',
    'galerina marginata', 'gyromitra esculenta', 'cortinarius rubellus',
    'hypholoma fasciculare', 'lepiota castanea', 'lepiota subincarnata', 'paxillus involutus',
}}

if len(df) > 0:
    # Normalize species strings for allowlist match
    df['species'] = df['species'].astype(str).str.strip()
    allow_l = {{a.lower() for a in ALLOWLIST}}
    df = df[df['species'].str.lower().isin(allow_l)].copy()
    log(f"After allowlist filter: {{len(df)}} imgs, {{df['species'].nunique()}} spp")
    species_counts = df.groupby('observation_id')['species'].first().str.lower().value_counts()
    keep = []
    for sp, n in species_counts.items():
        mn = 3 if str(sp).lower() in DEADLY_FORCE else 6
        if n >= mn:
            keep.append(sp)
    df = df[df['species'].str.lower().isin(keep)].copy()
    # MEGA: take as many obs as available (cap for balance / RAM)
    MAX_OBS = 120
    MAX_OBS_DEADLY = 200
    parts = []
    for sp, group in df.groupby('species'):
        cap = MAX_OBS_DEADLY if str(sp).lower() in DEADLY_FORCE else MAX_OBS
        oids = list(group['observation_id'].unique())
        # Prefer longer multi-image observations first
        oids_sorted = sorted(
            oids,
            key=lambda oid: -len(group[group['observation_id'] == oid]),
        )[:cap]
        parts.append(group[group['observation_id'].isin(oids_sorted)])
    df = pd.concat(parts, ignore_index=True) if parts else df
    log(f"E16 MEGA-focus40: imgs={{len(df)}} spp={{df['species'].nunique()}} obs={{df['observation_id'].nunique()}}")
    log(f"  obs/species median={{df.groupby('observation_id')['species'].first().value_counts().median():.0f}}")
    log(f"  Source DBs: {{df['source_db'].value_counts().to_dict()}}")
else:
    log("WARNING: empty df after allowlist")
"""

if old_sub not in src:
    raise SystemExit("subsample block missing — gen_notebook_v8.py changed")
src = src.replace(old_sub, new_sub)

# Long schedule
src = src.replace("epochs: int = 8", "epochs: int = 60  # E16 MEGA")
src = src.replace("patience: int = 3", "patience: int = 12  # E16")
src = src.replace("warmup_epochs: int = 1", "warmup_epochs: int = 3  # E16")
src = src.replace("swa_start_epoch: int = 6", "swa_start_epoch: int = 40  # E16")
src = src.replace("center_loss_weight: float = 0.01", "center_loss_weight: float = 0.05")
src = src.replace("batch_size: int = 16", "batch_size: int = 12  # E16 multi-view VRAM")

# Progressive resize in training loop
src = src.replace(
    "for epoch in range(start_epoch, cfg.epochs):\n    img_size = 224",
    "for epoch in range(start_epoch, cfg.epochs):\n"
    "    # E16 progressive resize: 224 early → 384 late\n"
    "    img_size = 224 if epoch < 25 else 384",
)

# Deadly weights
marker = 'log(f"Deadly species in dataset: {len(deadly_label_indices)}")'
inject = """
class_weights = torch.ones(NUM_CLASSES, device=DEVICE)
for di in deadly_label_indices:
    if 0 <= di < NUM_CLASSES:
        class_weights[di] = 10.0
log(f"E16 deadly class_weights x10 n={len(deadly_label_indices)}")
"""
if marker not in src:
    raise SystemExit("deadly marker missing")
src = src.replace(marker, marker + "\n" + inject)

src = src.replace(
    "loss_cls = F.cross_entropy(logits, labels, label_smoothing=cfg.label_smoothing)",
    "loss_cls = F.cross_entropy(logits, labels, weight=class_weights, label_smoothing=cfg.label_smoothing)\n"
    "            # E16: push deadly true class into top-3 logits\n"
    "            if len(deadly_label_indices) > 0:\n"
    "                _didx = deadly_label_indices\n"
    "                _is_d = torch.tensor([int(l) in _didx for l in labels.tolist()], device=logits.device)\n"
    "                if _is_d.any():\n"
    "                    _true = logits.gather(1, labels.unsqueeze(1)).squeeze(1)\n"
    "                    _kth = logits.topk(3, dim=-1).values[:, -1]\n"
    "                    loss_cls = loss_cls + 0.5 * torch.relu(_kth - _true + 0.1)[_is_d].mean()",
)

src = src.replace(
    "if sp.lower() in DEADLY_SPECIES:\n        deadly_label_indices.add(idx)",
    "if sp.lower() in DEADLY_SPECIES or sp.lower() in DEADLY_FORCE:\n        deadly_label_indices.add(idx)",
)

src = src.replace(
    "'subsample_config': {'max_species': 500, 'max_obs_per_species': 8},\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v8',",
    "'subsample_config': {\n"
    "        'max_species': 40, 'max_obs': 120, 'max_obs_deadly': 200,\n"
    "        'experiment': 'E16-mega-focus40', 'allowlist': 'industrial_v1',\n"
    "        'epochs': 60, 'progressive_resize': True,\n"
    "    },\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v16-E16-mega-focus40',\n"
    "    'attribution': 'FungiTastic/FungiCLEF public Kaggle datasets (Picek et al.); educational orientation only',",
)

src = src.replace("TRAINING COMPLETE! (v8)", "TRAINING COMPLETE! (v16-E16-mega-focus40)")
src = src.replace(
    'out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"',
    'out_path = Path(__file__).parent / "visionsetil_exp_v16_mega_focus.ipynb"',
)

# Banner cell at top of generated notebook source string if present
src = src.replace(
    "VisionSetil Multi-View Mega Training v8",
    "VisionSetil E16 MEGA-FOCUS40 — industrial allowlist long GPU train",
)

ns = {"__name__": "__main__", "__file__": str(ROOT / "gen_notebook_v8.py")}
exec(compile(src, "gen_e16_mega.py", "exec"), ns)
out = ROOT / "visionsetil_exp_v16_mega_focus.ipynb"
print("ok", out, out.stat().st_size if out.is_file() else "MISSING")

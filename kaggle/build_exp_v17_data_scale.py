#!/usr/bin/env python3
"""
E17 DATA-SCALE — expand public training data + stronger deadly learning.

Adds:
  - 3rd Kaggle source: FungiCLEF 2022 train (fdfyaytkt/2022-data-fungiclef-train)
  - Higher per-species caps (200 / 400 deadly)
  - Prefer multi-image observations
  - Deadly CE×12 + top-k penalty 0.75
  - Early-stop dual: MAP@3 primary, deadly@3 can reset patience
  - Fixed 224 (P100-safe; progressive 384 not reached usefully in E16)

Gmail policy: public data only (Picek: already online; iNat via GBIF later).

Usage:
  python kaggle/build_exp_v17_data_scale.py
  python scripts/push_kaggle_e17.py
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

# ── 1) Detect 3rd dataset (FungiCLEF 2022 train) ────────────────────────────
old_detect_paths = """    FUNGICLEF_PATHS = [
        '/kaggle/input/datasets/seemshukla/fungiclef',
        '/kaggle/input/datasets/seemshukla',
        '/kaggle/input/fungiclef',
        '/kaggle/input/seemshukla',
    ]
"""

new_detect_paths = """    FUNGICLEF_PATHS = [
        '/kaggle/input/datasets/seemshukla/fungiclef',
        '/kaggle/input/datasets/seemshukla',
        '/kaggle/input/fungiclef',
        '/kaggle/input/seemshukla',
    ]
    # E17: historical FungiCLEF 2022 train dump (extra obs for allowlist)
    FUNGICLEF2022_PATHS = [
        '/kaggle/input/datasets/fdfyaytkt/2022-data-fungiclef-train',
        '/kaggle/input/2022-data-fungiclef-train',
        '/kaggle/input/datasets/fdfyaytkt',
        '/kaggle/input/fdfyaytkt',
    ]
"""

if old_detect_paths not in src:
    raise SystemExit("FUNGICLEF_PATHS block missing")
src = src.replace(old_detect_paths, new_detect_paths)

old_fc_detect = """    # Try FungiCLEF
    for p in FUNGICLEF_PATHS:
        if Path(p).exists():
            datasets['fungiclef'] = Path(p)
            log(f"  ✓ Found FungiCLEF: {p}")
            break
"""

new_fc_detect = """    # Try FungiCLEF (2025 pack)
    for p in FUNGICLEF_PATHS:
        if Path(p).exists():
            datasets['fungiclef'] = Path(p)
            log(f"  ✓ Found FungiCLEF: {p}")
            break

    # E17: FungiCLEF 2022 train (additional public source)
    for p in FUNGICLEF2022_PATHS:
        if Path(p).exists():
            datasets['fungiclef2022'] = Path(p)
            log(f"  ✓ Found FungiCLEF2022: {p}")
            break
"""

if old_fc_detect not in src:
    raise SystemExit("FungiCLEF detect block missing")
src = src.replace(old_fc_detect, new_fc_detect)

# Fallback name matching for fungiclef2022
src = src.replace(
    "elif 'fungiclef' in combined or 'seemshukla' in combined:\n"
    "                datasets['fungiclef'] = d\n"
    "                log(f\"  ✓ Found FungiCLEF: {d}\")",
    "elif 'fungiclef' in combined or 'seemshukla' in combined:\n"
    "                datasets['fungiclef'] = d\n"
    "                log(f\"  ✓ Found FungiCLEF: {d}\")\n"
    "            elif ('2022' in combined and 'fungi' in combined) or 'fdfyaytkt' in combined:\n"
    "                datasets['fungiclef2022'] = d\n"
    "                log(f\"  ✓ Found FungiCLEF2022: {d}\")",
)

src = src.replace(
    "elif 'fungiclef' in name or 'seemshukla' in name:\n"
    "                        datasets['fungiclef'] = d\n"
    "                        log(f\"  ✓ Found FungiCLEF (nested): {d}\")",
    "elif 'fungiclef' in name or 'seemshukla' in name:\n"
    "                        datasets['fungiclef'] = d\n"
    "                        log(f\"  ✓ Found FungiCLEF (nested): {d}\")\n"
    "                    elif '2022' in name or 'fdfyaytkt' in name:\n"
    "                        datasets['fungiclef2022'] = d\n"
    "                        log(f\"  ✓ Found FungiCLEF2022 (nested): {d}\")",
)

# ── 2) Allowlist filter with higher caps ─────────────────────────────────────
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

new_sub = f"""# ═══ CELL 5: E17 DATA-SCALE industrial allowlist (40 spp, 3 public sources) ═══
# Gmail: Picek — use public data; iNat — GBIF/CC path later. No private packs.
ALLOWLIST = {allow_literal}
DEADLY_FORCE = {{
    'amanita phalloides', 'amanita virosa', 'amanita muscaria', 'amanita pantherina',
    'galerina marginata', 'gyromitra esculenta', 'cortinarius rubellus',
    'hypholoma fasciculare', 'lepiota castanea', 'lepiota subincarnata', 'paxillus involutus',
}}

if len(df) > 0:
    df['species'] = df['species'].astype(str).str.strip()
    allow_l = {{a.lower() for a in ALLOWLIST}}
    df = df[df['species'].str.lower().isin(allow_l)].copy()
    log(f"After allowlist filter: {{len(df)}} imgs, {{df['species'].nunique()}} spp")
    log(f"  Sources pre-cap: {{df['source_db'].value_counts().to_dict()}}")

    species_counts = df.groupby('observation_id')['species'].first().str.lower().value_counts()
    keep = []
    for sp, n in species_counts.items():
        mn = 3 if str(sp).lower() in DEADLY_FORCE else 4
        if n >= mn:
            keep.append(sp)
    df = df[df['species'].str.lower().isin(keep)].copy()

    # E17: higher caps; prefer multi-image observations first
    MAX_OBS = 200
    MAX_OBS_DEADLY = 400
    parts = []
    for sp, group in df.groupby('species'):
        cap = MAX_OBS_DEADLY if str(sp).lower() in DEADLY_FORCE else MAX_OBS
        oids = list(group['observation_id'].unique())
        oids_sorted = sorted(
            oids,
            key=lambda oid: (-len(group[group['observation_id'] == oid]), str(oid)),
        )[:cap]
        parts.append(group[group['observation_id'].isin(oids_sorted)])
    df = pd.concat(parts, ignore_index=True) if parts else df
    # Dedup identical image paths if any
    if 'image_path' in df.columns:
        before = len(df)
        df = df.drop_duplicates(subset=['image_path'], keep='first')
        log(f"  Dedup image_path: {{before}} → {{len(df)}}")
    log(f"E17 data-scale: imgs={{len(df)}} spp={{df['species'].nunique()}} obs={{df['observation_id'].nunique()}}")
    log(f"  obs/species median={{df.groupby('observation_id')['species'].first().value_counts().median():.0f}}")
    log(f"  Source DBs: {{df['source_db'].value_counts().to_dict()}}")
else:
    log("WARNING: empty df after allowlist")
"""

if old_sub not in src:
    raise SystemExit("subsample block missing")
src = src.replace(old_sub, new_sub)

# ── 3) Train hyperparams ─────────────────────────────────────────────────────
src = src.replace("epochs: int = 8", "epochs: int = 40  # E17")
src = src.replace("patience: int = 3", "patience: int = 10  # E17 dual early-stop")
src = src.replace("warmup_epochs: int = 1", "warmup_epochs: int = 2  # E17")
src = src.replace("swa_start_epoch: int = 6", "swa_start_epoch: int = 28  # E17")
src = src.replace("center_loss_weight: float = 0.01", "center_loss_weight: float = 0.05")
src = src.replace("batch_size: int = 16", "batch_size: int = 10  # E17 multi-view VRAM")

# Fixed 224 (E16 progressive never paid off before early stop)
src = src.replace(
    "for epoch in range(start_epoch, cfg.epochs):\n    img_size = 224",
    "for epoch in range(start_epoch, cfg.epochs):\n"
    "    # E17: fixed 224 (P100-safe; E16 progressive never reached usefully)\n"
    "    img_size = 224",
)

# Deadly weights x12
marker = 'log(f"Deadly species in dataset: {len(deadly_label_indices)}")'
inject = """
class_weights = torch.ones(NUM_CLASSES, device=DEVICE)
for di in deadly_label_indices:
    if 0 <= di < NUM_CLASSES:
        class_weights[di] = 12.0
log(f"E17 deadly class_weights x12 n={len(deadly_label_indices)}")
"""
if marker not in src:
    raise SystemExit("deadly marker missing")
src = src.replace(marker, marker + "\n" + inject)

src = src.replace(
    "loss_cls = F.cross_entropy(logits, labels, label_smoothing=cfg.label_smoothing)",
    "loss_cls = F.cross_entropy(logits, labels, weight=class_weights, label_smoothing=cfg.label_smoothing)\n"
    "            # E17: stronger push deadly true class into top-3\n"
    "            if len(deadly_label_indices) > 0:\n"
    "                _didx = deadly_label_indices\n"
    "                _is_d = torch.tensor([int(l) in _didx for l in labels.tolist()], device=logits.device)\n"
    "                if _is_d.any():\n"
    "                    _true = logits.gather(1, labels.unsqueeze(1)).squeeze(1)\n"
    "                    _kth = logits.topk(3, dim=-1).values[:, -1]\n"
    "                    loss_cls = loss_cls + 0.75 * torch.relu(_kth - _true + 0.1)[_is_d].mean()",
)

src = src.replace(
    "if sp.lower() in DEADLY_SPECIES:\n        deadly_label_indices.add(idx)",
    "if sp.lower() in DEADLY_SPECIES or sp.lower() in DEADLY_FORCE:\n        deadly_label_indices.add(idx)",
)

# Dual early-stop: track best_deadly and soft-reset patience
old_early = """best_map3 = 0.0
best_epoch = -1
history = []
epochs_no_improve = 0
"""
new_early = """best_map3 = 0.0
best_deadly = 0.0
best_epoch = -1
history = []
epochs_no_improve = 0
"""
if old_early not in src:
    raise SystemExit("best_map3 init missing")
src = src.replace(old_early, new_early)

# Enhance validate to also return deadly recall when possible - inject after validate function
old_val_return = """    map3 = map_at_3(all_probs, all_labels)
    f1 = f1_score(all_labels, preds, average='macro', zero_division=0)
    return {'acc': acc, 'map3': map3, 'f1': f1}
"""
new_val_return = """    map3 = map_at_3(all_probs, all_labels)
    f1 = f1_score(all_labels, preds, average='macro', zero_division=0)
    # E17: deadly@3 on val (safety metric)
    deadly_rec = 0.0
    if len(deadly_label_indices) > 0:
        top3 = np.argsort(-all_probs, axis=1)[:, :3]
        dmask = np.array([int(l) in deadly_label_indices for l in all_labels])
        if dmask.any():
            hits = 0
            for i, lab in enumerate(all_labels):
                if dmask[i] and lab in top3[i]:
                    hits += 1
            deadly_rec = hits / max(int(dmask.sum()), 1)
    return {'acc': acc, 'map3': map3, 'f1': f1, 'deadly3': deadly_rec}
"""
if old_val_return not in src:
    raise SystemExit("validate return missing")
src = src.replace(old_val_return, new_val_return)

old_hist = """    history.append({
        'epoch': epoch, 'train_loss': train_loss,
        'val_acc': val_metrics['acc'], 'val_map3': val_metrics['map3'],
        'val_f1': val_metrics['f1'],
    })

    log(f"Ep{epoch} RESULT | loss={train_loss:.4f} | acc={val_metrics['acc']:.4f} | "
        f"map3={val_metrics['map3']:.4f} | f1={val_metrics['f1']:.4f}")

    if val_metrics['map3'] > best_map3:
        best_map3 = val_metrics['map3']
        best_epoch = epoch
        epochs_no_improve = 0
        torch.save({
            'epoch': epoch,
            'model_state': model.state_dict(),
            'config': {'d_model': cfg.d_model, 'metadata_dim': cfg.metadata_dim,
                       'num_classes': NUM_CLASSES, 'lora_rank': cfg.lora_rank},
            'label2idx': label2idx,
            'metadata_vocab': metadata_vocab,
        }, OUT_DIR / 'best.pt')
        log(f"  ★ New best MAP@3: {best_map3:.4f} — saved!")
    else:
        epochs_no_improve += 1
        log(f"  No improvement for {epochs_no_improve} epoch(s).")
"""

new_hist = """    history.append({
        'epoch': epoch, 'train_loss': train_loss,
        'val_acc': val_metrics['acc'], 'val_map3': val_metrics['map3'],
        'val_f1': val_metrics['f1'],
        'val_deadly3': val_metrics.get('deadly3', 0.0),
    })

    log(f"Ep{epoch} RESULT | loss={train_loss:.4f} | acc={val_metrics['acc']:.4f} | "
        f"map3={val_metrics['map3']:.4f} | f1={val_metrics['f1']:.4f} | "
        f"deadly3={val_metrics.get('deadly3', 0):.4f}")

    improved = False
    if val_metrics['map3'] > best_map3:
        best_map3 = val_metrics['map3']
        best_epoch = epoch
        improved = True
        torch.save({
            'epoch': epoch,
            'model_state': model.state_dict(),
            'config': {'d_model': cfg.d_model, 'metadata_dim': cfg.metadata_dim,
                       'num_classes': NUM_CLASSES, 'lora_rank': cfg.lora_rank},
            'label2idx': label2idx,
            'metadata_vocab': metadata_vocab,
        }, OUT_DIR / 'best.pt')
        log(f"  ★ New best MAP@3: {best_map3:.4f} — saved!")
    # E17 dual: deadly@3 improvement soft-resets patience (safety first)
    d3 = float(val_metrics.get('deadly3', 0.0) or 0.0)
    if d3 > best_deadly + 1e-6:
        best_deadly = d3
        improved = True
        log(f"  ★ New best val deadly@3: {best_deadly:.4f}")
    if improved:
        epochs_no_improve = 0
    else:
        epochs_no_improve += 1
        log(f"  No improvement for {epochs_no_improve} epoch(s).")
"""

if old_hist not in src:
    raise SystemExit("history/best block missing")
src = src.replace(old_hist, new_hist)

src = src.replace(
    "'subsample_config': {'max_species': 500, 'max_obs_per_species': 8},\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v8',",
    "'subsample_config': {\n"
    "        'max_species': 40, 'max_obs': 200, 'max_obs_deadly': 400,\n"
    "        'experiment': 'E17-data-scale', 'allowlist': 'industrial_v1',\n"
    "        'epochs': 40, 'sources': ['fungitastic', 'fungiclef', 'fungiclef2022'],\n"
    "        'baseline_e16_map': 0.184, 'baseline_e16_deadly': 0.371,\n"
    "    },\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v17-E17-data-scale',\n"
    "    'attribution': 'FungiTastic/FungiCLEF public Kaggle (Picek et al.); FC2022 train; educational orientation only',",
)

src = src.replace("TRAINING COMPLETE! (v8)", "TRAINING COMPLETE! (v17-E17-data-scale)")
src = src.replace(
    'out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"',
    'out_path = Path(__file__).parent / "visionsetil_exp_v17_data_scale.ipynb"',
)
src = src.replace(
    "VisionSetil Multi-View Mega Training v8",
    "VisionSetil E17 DATA-SCALE — public multi-source allowlist40",
)

ns = {"__name__": "__main__", "__file__": str(ROOT / "gen_notebook_v8.py")}
exec(compile(src, "gen_e17.py", "exec"), ns)
out = ROOT / "visionsetil_exp_v17_data_scale.ipynb"
print("ok", out, out.stat().st_size if out.is_file() else "MISSING")

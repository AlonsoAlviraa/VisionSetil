"""Build E13 notebook: data-scale + deadly oversample + force-include critical taxa."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent
src = (ROOT / "gen_notebook_v8.py").read_text(encoding="utf-8")

# --- Subsample: more data + force deadly species into the set ---
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

new_sub = """# ═══ CELL 5: E13 subsample — data-scale + FORCE deadly species ═══

DEADLY_FORCE = {
    'amanita phalloides', 'amanita virosa', 'amanita bisporigera', 'amanita verna',
    'amanita muscaria', 'amanita pantherina',
    'galerina marginata', 'galerina autumnalis',
    'lepiota brunneoincarnata', 'lepiota castanea', 'lepiota subincarnata',
    'cortinarius orellanus', 'cortinarius rubellus',
    'hypholoma fasciculare',
}

if len(df) > 0:
    species_counts = df.groupby('observation_id')['species'].first().value_counts()
    # Allow deadly with fewer obs (min 2) so they enter the set
    def _min_obs(sp):
        return 2 if str(sp).lower() in DEADLY_FORCE else 4
    keep_mask = []
    sp_first = df.groupby('observation_id')['species'].first()
    valid_obs = []
    for oid, sp in sp_first.items():
        if species_counts.get(sp, 0) >= _min_obs(sp):
            valid_obs.append(oid)
    df = df[df['observation_id'].isin(valid_obs)].reset_index(drop=True)
    log(f"After min-obs filter: {len(df)} images, {df['species'].nunique()} species")

    MAX_SPECIES = 1000
    MAX_OBS_DEFAULT = 16
    MAX_OBS_DEADLY = 32  # oversample critical taxa

    obs_per_species = df.groupby('observation_id')['species'].first().value_counts()
    # Force all deadly present in data into the species set first
    present_deadly = [s for s in obs_per_species.index if str(s).lower() in DEADLY_FORCE]
    other = [s for s in obs_per_species.index if str(s).lower() not in DEADLY_FORCE]
    top_other = other[: max(0, MAX_SPECIES - len(present_deadly))]
    selected = list(present_deadly) + list(top_other)
    df = df[df['species'].isin(selected)].copy()
    log(f"Forced deadly species in set: {len(present_deadly)} -> {present_deadly[:12]}")

    sampled_parts = []
    for sp, group in df.groupby('species'):
        cap = MAX_OBS_DEADLY if str(sp).lower() in DEADLY_FORCE else MAX_OBS_DEFAULT
        obs_ids = group['observation_id'].unique()[:cap]
        sampled_parts.append(group[group['observation_id'].isin(obs_ids)])

    df = pd.concat(sampled_parts, ignore_index=True)

    log(f"After E13 subsampling (≤{MAX_SPECIES} spp, deadly×{MAX_OBS_DEADLY}):")
    log(f"  Images: {len(df)}")
    log(f"  Species: {df['species'].nunique()}")
    log(f"  Observations: {df['observation_id'].nunique()}")
    log(f"  Source DBs: {df['source_db'].value_counts().to_dict()}")
else:
    log("WARNING: Empty dataframe, skipping subsampling")
"""

if old_sub not in src:
    raise SystemExit("subsample block not found — gen_notebook_v8 changed")
src = src.replace(old_sub, new_sub)

# TrainConfig epochs / batch
src = src.replace("epochs: int = 8", "epochs: int = 14  # E13")
src = src.replace("patience: int = 3", "patience: int = 5")
src = src.replace("swa_start_epoch: int = 6", "swa_start_epoch: int = 10")
src = src.replace("batch_size: int = 16", "batch_size: int = 12")
src = src.replace("center_loss_weight: float = 0.01", "center_loss_weight: float = 0.03")

# Weighted sampling in training loop — inject after model build cell is hard;
# instead patch the training step to use class weights via CE on soft targets
# by upweighting deadly labels in loss. Find train_one_epoch loss computation.
old_loss_hook = "loss = F.cross_entropy(logits, labels, label_smoothing=cfg.label_smoothing)"
# may not exist exact; try soft labels path
# Look for common patterns in gen_notebook_v8
if "F.cross_entropy" in src:
    # Add deadly weight after deadly_label_indices definition
    inject = """
# E13: class weights — deadly taxa 8x, others 1x
class_weights = torch.ones(NUM_CLASSES, device=DEVICE)
for di in deadly_label_indices:
    if 0 <= di < NUM_CLASSES:
        class_weights[di] = 8.0
log(f"E13 class weights: deadly={len(deadly_label_indices)} set to 8.0")
"""
    marker = 'log(f"Deadly species in dataset: {len(deadly_label_indices)}")'
    if marker in src and "E13 class weights" not in src:
        src = src.replace(marker, marker + "\n" + inject)

# Replace CE with weighted CE where possible
src = src.replace(
    "loss = F.cross_entropy(logits, labels, label_smoothing=cfg.label_smoothing)",
    "loss = F.cross_entropy(logits, labels, weight=class_weights, label_smoothing=cfg.label_smoothing)",
)

# Metrics version string
src = src.replace(
    "'subsample_config': {'max_species': 500, 'max_obs_per_species': 8},\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v8',",
    "'subsample_config': {'max_species': 1000, 'max_obs_default': 16, 'max_obs_deadly': 32, 'experiment': 'E13-deadly-data'},\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v13-E13-deadly-data',",
)
src = src.replace("TRAINING COMPLETE! (v8)", "TRAINING COMPLETE! (v13-E13-deadly-data)")
src = src.replace(
    'out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"',
    'out_path = Path(__file__).parent / "visionsetil_exp_v13_deadly.ipynb"',
)

# Ensure deadly indices use DEADLY_FORCE union as well
src = src.replace(
    "if sp.lower() in DEADLY_SPECIES:\n        deadly_label_indices.add(idx)",
    "if sp.lower() in DEADLY_SPECIES or sp.lower() in DEADLY_FORCE:\n        deadly_label_indices.add(idx)",
)

ns: dict = {"__name__": "__main__", "__file__": str(ROOT / "gen_notebook_v8.py")}
exec(compile(src, str(ROOT / "gen_notebook_v8_e13.py"), "exec"), ns)
out = ROOT / "visionsetil_exp_v13_deadly.ipynb"
print("wrote", out, "size", out.stat().st_size if out.exists() else 0)
text = out.read_text(encoding="utf-8")
for n in ("E13", "MAX_OBS_DEADLY", "class_weights", "v13-E13", "epochs: int = 14"):
    print(n, n in text)

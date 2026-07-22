"""E14: focused 120-class model — only way to reach acceptable metrics quickly.

Strategy:
  - Force all deadly taxa present
  - Top frequent species to fill 120 classes
  - Max 40 obs per class
  - 20 epochs, strong deadly weights
  - Smaller head = higher per-class samples
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent
src = (ROOT / "gen_notebook_v8.py").read_text(encoding="utf-8")

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

new_sub = """# ═══ CELL 5: E14 FOCUSED — 120 classes, max data, deadly forced ═══
# Goal: acceptable MAP@3 by NOT doing 500-way few-shot.

DEADLY_FORCE = {
    'amanita phalloides', 'amanita virosa', 'amanita bisporigera', 'amanita verna',
    'amanita muscaria', 'amanita pantherina', 'amanita citrina',
    'galerina marginata', 'galerina autumnalis',
    'lepiota brunneoincarnata', 'lepiota castanea', 'lepiota subincarnata',
    'cortinarius orellanus', 'cortinarius rubellus',
    'hypholoma fasciculare', 'gyromitra esculenta',
}

if len(df) > 0:
    species_counts = df.groupby('observation_id')['species'].first().value_counts()
    MAX_SPECIES = 120
    MAX_OBS = 40
    MIN_OBS = 6  # need enough for train/val/test

    # Deadly: lower min so they enter
    def ok_sp(sp, n):
        if str(sp).lower() in DEADLY_FORCE:
            return n >= 3
        return n >= MIN_OBS

    valid = [sp for sp, n in species_counts.items() if ok_sp(sp, n)]
    df = df[df['species'].isin(valid)].copy()

    obs_per = df.groupby('observation_id')['species'].first().value_counts()
    deadly = [s for s in obs_per.index if str(s).lower() in DEADLY_FORCE]
    others = [s for s in obs_per.index if str(s).lower() not in DEADLY_FORCE]
    # Prefer species with MOST observations among others
    others_sorted = sorted(others, key=lambda s: obs_per[s], reverse=True)
    selected = deadly + others_sorted[: max(0, MAX_SPECIES - len(deadly))]
    df = df[df['species'].isin(selected)].copy()
    log(f"E14 selected {len(selected)} spp (deadly={len(deadly)})")

    parts = []
    for sp, group in df.groupby('species'):
        obs_ids = group['observation_id'].unique()[:MAX_OBS]
        parts.append(group[group['observation_id'].isin(obs_ids)])
    df = pd.concat(parts, ignore_index=True)

    log(f"E14 focused set: images={len(df)} spp={df['species'].nunique()} obs={df['observation_id'].nunique()}")
    log(f"  obs/sp median={df.groupby('species')['observation_id'].nunique().median():.0f}")
else:
    log("WARNING: Empty dataframe")
"""

if old_sub not in src:
    raise SystemExit("subsample block missing")
src = src.replace(old_sub, new_sub)
src = src.replace("epochs: int = 8", "epochs: int = 20  # E14 focused")
src = src.replace("patience: int = 3", "patience: int = 6")
src = src.replace("swa_start_epoch: int = 6", "swa_start_epoch: int = 14")
src = src.replace("batch_size: int = 16", "batch_size: int = 16")
src = src.replace("center_loss_weight: float = 0.01", "center_loss_weight: float = 0.05")
src = src.replace("lr_backbone: float = 2e-5", "lr_backbone: float = 3e-5")

marker = 'log(f"Deadly species in dataset: {len(deadly_label_indices)}")'
inject = """
class_weights = torch.ones(NUM_CLASSES, device=DEVICE)
for di in deadly_label_indices:
    if 0 <= di < NUM_CLASSES:
        class_weights[di] = 10.0
log(f"E14 class weights deadly x10, n={len(deadly_label_indices)}")
"""
if marker in src:
    src = src.replace(marker, marker + "\\n" + inject.replace("\n", "\\n") if False else marker + "\n" + inject)

src = src.replace(
    "loss_cls = F.cross_entropy(logits, labels, label_smoothing=cfg.label_smoothing)",
    "loss_cls = F.cross_entropy(logits, labels, weight=class_weights, label_smoothing=cfg.label_smoothing)",
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
    "'subsample_config': {'max_species': 120, 'max_obs': 40, 'experiment': 'E14-focused'},\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v14-E14-focused',",
)
src = src.replace("TRAINING COMPLETE! (v8)", "TRAINING COMPLETE! (v14-E14-focused)")
src = src.replace(
    'out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"',
    'out_path = Path(__file__).parent / "visionsetil_exp_v14_focused.ipynb"',
)

ns = {"__name__": "__main__", "__file__": str(ROOT / "gen_notebook_v8.py")}
exec(compile(src, "gen_e14.py", "exec"), ns)
out = ROOT / "visionsetil_exp_v14_focused.ipynb"
print("wrote", out, out.stat().st_size)
t = out.read_text(encoding="utf-8")
for n in ("E14", "MAX_SPECIES = 120", "MAX_OBS = 40", "class_weights", "v14-E14"):
    print(n, n in t)

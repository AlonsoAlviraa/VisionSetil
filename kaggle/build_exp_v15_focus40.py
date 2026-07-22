"""E15: filter to industrial_v1 40-species allowlist + deadly weights + more epochs."""

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

new_sub = f"""# ═══ CELL 5: E15 industrial_v1 allowlist (40 spp) ═══
ALLOWLIST = {allow_literal}
DEADLY_FORCE = {{
    'amanita phalloides', 'amanita virosa', 'amanita muscaria', 'amanita pantherina',
    'galerina marginata', 'gyromitra esculenta', 'cortinarius rubellus',
    'hypholoma fasciculare', 'lepiota castanea', 'lepiota subincarnata', 'paxillus involutus',
}}

if len(df) > 0:
    df = df[df['species'].isin(ALLOWLIST)].copy()
    log(f"After allowlist filter: {{len(df)}} imgs, {{df['species'].nunique()}} spp")
    species_counts = df.groupby('observation_id')['species'].first().value_counts()
    keep = []
    for sp, n in species_counts.items():
        mn = 3 if str(sp).lower() in DEADLY_FORCE else 6
        if n >= mn:
            keep.append(sp)
    df = df[df['species'].isin(keep)].copy()
    MAX_OBS = 80
    MAX_OBS_DEADLY = 120
    parts = []
    for sp, group in df.groupby('species'):
        cap = MAX_OBS_DEADLY if str(sp).lower() in DEADLY_FORCE else MAX_OBS
        oids = group['observation_id'].unique()[:cap]
        parts.append(group[group['observation_id'].isin(oids)])
    df = pd.concat(parts, ignore_index=True) if parts else df
    log(f"E15 focus40: imgs={{len(df)}} spp={{df['species'].nunique()}} obs={{df['observation_id'].nunique()}}")
else:
    log("WARNING: empty df")
"""

if old_sub not in src:
    raise SystemExit("subsample block missing")
src = src.replace(old_sub, new_sub)
src = src.replace("epochs: int = 8", "epochs: int = 25  # E15")
src = src.replace("patience: int = 3", "patience: int = 7")
src = src.replace("swa_start_epoch: int = 6", "swa_start_epoch: int = 18")
src = src.replace("center_loss_weight: float = 0.01", "center_loss_weight: float = 0.05")

marker = 'log(f"Deadly species in dataset: {len(deadly_label_indices)}")'
inject = """
class_weights = torch.ones(NUM_CLASSES, device=DEVICE)
for di in deadly_label_indices:
    if 0 <= di < NUM_CLASSES:
        class_weights[di] = 10.0
log(f"E15 deadly class_weights x10 n={len(deadly_label_indices)}")
"""
src = src.replace(marker, marker + "\n" + inject)
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
    "'subsample_config': {'max_species': 40, 'max_obs': 80, 'experiment': 'E15-focus40', 'allowlist': 'industrial_v1'},\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v15-E15-focus40',",
)
src = src.replace("TRAINING COMPLETE! (v8)", "TRAINING COMPLETE! (v15-E15-focus40)")
src = src.replace(
    'out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"',
    'out_path = Path(__file__).parent / "visionsetil_exp_v15_focus40.ipynb"',
)

ns = {"__name__": "__main__", "__file__": str(ROOT / "gen_notebook_v8.py")}
exec(compile(src, "gen_e15.py", "exec"), ns)
print("ok", (ROOT / "visionsetil_exp_v15_focus40.ipynb").stat().st_size)

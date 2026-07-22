"""Build E12-data-scale notebook from gen_notebook_v8 generator."""

from __future__ import annotations

import re
from pathlib import Path

# Import and re-run generator by patching source of gen_notebook_v8
ROOT = Path(__file__).resolve().parent
src = (ROOT / "gen_notebook_v8.py").read_text(encoding="utf-8")

# Patch generator parameters for E12-data-scale
patches = [
    (
        "MAX_SPECIES = 500\n    MAX_OBS_PER_SPECIES = 8  # was 5",
        "MAX_SPECIES = 1000  # E12-data-scale\n    MAX_OBS_PER_SPECIES = 16  # E12-data-scale",
    ),
    ("epochs: int = 8", "epochs: int = 12  # E12-data-scale"),
    ("patience: int = 3", "patience: int = 4"),
    (
        "'subsample_config': {'max_species': 500, 'max_obs_per_species': 8},\n"
        "    'deadly_species_known': len(DEADLY_SPECIES),\n"
        "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
        "    'version': 'v8',",
        "'subsample_config': {'max_species': 1000, 'max_obs_per_species': 16, 'experiment': 'E12-data-scale'},\n"
        "    'deadly_species_known': len(DEADLY_SPECIES),\n"
        "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
        "    'version': 'v12-E12-data-scale',",
    ),
    ("TRAINING COMPLETE! (v8)", "TRAINING COMPLETE! (v12-E12-data-scale)"),
    (
        'OUT_DIR = Path("/kaggle/working/models")',
        'OUT_DIR = Path("/kaggle/working/models")\nlog("Experiment: E12-data-scale (1000 spp x 16 obs, 12 epochs)")',
    ),
]

for old, new in patches:
    if old not in src:
        print("WARN missing patch snippet:", old[:80].replace("\n", " "))
    else:
        src = src.replace(old, new)
        print("OK patch:", old[:50].replace("\n", " "))

# Execute generator in isolated namespace writing notebook to exp file
# gen_notebook_v8 writes visionsetil_mega_training.ipynb — intercept Path write
ns: dict = {"__name__": "__main__", "__file__": str(ROOT / "gen_notebook_v8.py")}
# Redirect output notebook name by patching write target in source
src = src.replace(
    'out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"',
    'out_path = Path(__file__).parent / "visionsetil_exp_v12_data_scale.ipynb"',
)

exec(compile(src, str(ROOT / "gen_notebook_v8_patched.py"), "exec"), ns)
out = ROOT / "visionsetil_exp_v12_data_scale.ipynb"
print("exists", out.exists(), "size", out.stat().st_size if out.exists() else 0)
# sanity
t = out.read_text(encoding="utf-8")
for needle in ("MAX_SPECIES = 1000", "MAX_OBS_PER_SPECIES = 16", "v12-E12-data-scale", "epochs: int = 12"):
    print(needle, "->", needle in t)

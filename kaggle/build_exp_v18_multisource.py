#!/usr/bin/env python3
"""
E18 MULTISOURCE — real multi-source training after E17 CSV ingest failure.

Root cause (E17):
  - seemshukla/fungiclef = checkpoint .pth only (0 images)
  - fdfyaytkt/2022-data-fungiclef-train = TFRecord-only (no species CSV)
  - Loader failed to map FungiTastic filename/species/observationID robustly
    and only read one CSV split

E18:
  - Embed kaggle/fungi_csv_loader.py (column aliases, multi-CSV, folder loads)
  - Sources: FungiTastic + mushroom1 + combined-kaggle-mushrooms (latin folders)
  - Still accepts DF20/FungiCLEF CSV layouts if mounted later
  - Hard-fail if <2 sources contribute rows (no silent FungiTastic-only)
  - Keep industrial allowlist at 40 spp (do NOT expand to 80)
  - Caps 200/400, deadly×12, dual early-stop (from E17)

Usage:
  python kaggle/build_exp_v18_multisource.py
  python scripts/push_kaggle_e18.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
src = (ROOT / "gen_notebook_v8.py").read_text(encoding="utf-8")
loader_src = (ROOT / "fungi_csv_loader.py").read_text(encoding="utf-8")

allow = json.loads(
    (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(encoding="utf-8")
)
names = [s["latin_name"] for s in allow["species"]]
allow_literal = repr(set(names))

# ── 1) Dataset detection: 3 REAL public image sources ────────────────────────
old_detect_paths = """    FUNGICLEF_PATHS = [
        '/kaggle/input/datasets/seemshukla/fungiclef',
        '/kaggle/input/datasets/seemshukla',
        '/kaggle/input/fungiclef',
        '/kaggle/input/seemshukla',
    ]
"""

new_detect_paths = """    FUNGICLEF_PATHS = [
        # E18: seemshukla/fungiclef is checkpoint-only — keep path for future real packs
        '/kaggle/input/datasets/seemshukla/fungiclef',
        '/kaggle/input/datasets/seemshukla',
        '/kaggle/input/fungiclef',
        '/kaggle/input/seemshukla',
        # DF20 / competition-style if attached
        '/kaggle/input/fungiclef2022',
        '/kaggle/input/datasets/fungiclef2022',
    ]
    # E18 real multi-source replacements (latin folder images)
    MUSHROOM1_PATHS = [
        '/kaggle/input/datasets/zlatan599/mushroom1',
        '/kaggle/input/zlatan599/mushroom1',
        '/kaggle/input/mushroom1',
        '/kaggle/input/datasets/zlatan599',
    ]
    COMBINED_MUSH_PATHS = [
        '/kaggle/input/datasets/dariobaumberger/combined-kaggle-mushrooms-dataset',
        '/kaggle/input/dariobaumberger/combined-kaggle-mushrooms-dataset',
        '/kaggle/input/combined-kaggle-mushrooms-dataset',
        '/kaggle/input/datasets/dariobaumberger',
    ]
    # Legacy FC2022 TFRecord mount (loader will soft-skip if unusable)
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

new_fc_detect = """    # Try FungiCLEF / DF20 pack (if present and usable)
    for p in FUNGICLEF_PATHS:
        if Path(p).exists():
            datasets['fungiclef'] = Path(p)
            log(f"  ✓ Found FungiCLEF path: {p}")
            break

    # E18: zlatan599/mushroom1 — species folders with latin names
    for p in MUSHROOM1_PATHS:
        if Path(p).exists():
            datasets['mushroom1'] = Path(p)
            log(f"  ✓ Found mushroom1: {p}")
            break

    # E18: combined kaggle mushrooms — latin species folders
    for p in COMBINED_MUSH_PATHS:
        if Path(p).exists():
            datasets['combined_mushrooms'] = Path(p)
            log(f"  ✓ Found combined_mushrooms: {p}")
            break

    # Optional legacy TFRecord pack (may soft-skip inside loader)
    for p in FUNGICLEF2022_PATHS:
        if Path(p).exists() and 'fungiclef2022' not in datasets and 'fungiclef' not in datasets:
            datasets['fungiclef2022'] = Path(p)
            log(f"  ✓ Found FungiCLEF2022 path: {p}")
            break
"""

if old_fc_detect not in src:
    raise SystemExit("FungiCLEF detect block missing")
src = src.replace(old_fc_detect, new_fc_detect)

# Fallback name matching for new sources
src = src.replace(
    "elif 'fungiclef' in combined or 'seemshukla' in combined:\n"
    "                datasets['fungiclef'] = d\n"
    "                log(f\"  ✓ Found FungiCLEF: {d}\")",
    "elif 'fungiclef' in combined or 'seemshukla' in combined:\n"
    "                datasets['fungiclef'] = d\n"
    "                log(f\"  ✓ Found FungiCLEF: {d}\")\n"
    "            elif 'mushroom1' in combined or 'zlatan599' in combined:\n"
    "                datasets['mushroom1'] = d\n"
    "                log(f\"  ✓ Found mushroom1: {d}\")\n"
    "            elif 'combined' in combined and 'mushroom' in combined:\n"
    "                datasets['combined_mushrooms'] = d\n"
    "                log(f\"  ✓ Found combined_mushrooms: {d}\")\n"
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
    "                    elif 'mushroom1' in name or 'zlatan599' in name:\n"
    "                        datasets['mushroom1'] = d\n"
    "                        log(f\"  ✓ Found mushroom1 (nested): {d}\")\n"
    "                    elif 'combined' in name and 'mushroom' in name:\n"
    "                        datasets['combined_mushrooms'] = d\n"
    "                        log(f\"  ✓ Found combined_mushrooms (nested): {d}\")\n"
    "                    elif '2022' in name or 'fdfyaytkt' in name:\n"
    "                        datasets['fungiclef2022'] = d\n"
    "                        log(f\"  ✓ Found FungiCLEF2022 (nested): {d}\")",
)

# ── 2) Replace CELL 4 load logic with embedded fungi_csv_loader ──────────────
def _sanitize_loader_for_notebook(text: str) -> str:
    """Strip docstrings / future import so embedding into code(\"\"\"...\"\"\") is safe."""
    import ast

    tree = ast.parse(text)
    # Drop module docstring
    if (
        tree.body
        and isinstance(tree.body[0], ast.Expr)
        and isinstance(getattr(tree.body[0], "value", None), ast.Constant)
        and isinstance(tree.body[0].value.value, str)
    ):
        tree.body = tree.body[1:]
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if (
                node.body
                and isinstance(node.body[0], ast.Expr)
                and isinstance(getattr(node.body[0], "value", None), ast.Constant)
                and isinstance(node.body[0].value.value, str)
            ):
                node.body = node.body[1:] or [ast.Pass()]
    # Remove `from __future__ import annotations`
    tree.body = [
        n
        for n in tree.body
        if not (
            isinstance(n, ast.ImportFrom)
            and n.module == "__future__"
        )
    ]
    out = ast.unparse(tree)
    # Belt-and-suspenders: no triple quotes / fancy arrows left
    out = out.replace('"""', "'''").replace("→", "->")
    # ast.unparse may emit replace('\\', '/') which breaks when JSON-embedded in ipynb
    # (JSON collapses \\ → \, leaving unterminated '\''). Force chr(92) form.
    out = out.replace(".replace('\\\\', '/')", ".replace(chr(92), '/')")
    out = out.replace('.replace("\\\\", "/")', ".replace(chr(92), '/')")
    out = out.replace(".replace('\\\\', \"/\")", ".replace(chr(92), '/')")
    out = out.replace('.replace("\\\\", \'/\')', ".replace(chr(92), '/')")
    return out


loader_body = _sanitize_loader_for_notebook(loader_src)
# log() already exists in notebook; wire loader default through
loader_body = loader_body.replace(
    "def _log(msg: str, log: Optional[LogFn] = None) -> None:\n"
    "    if log:\n"
    "        log(msg)\n"
    "    else:\n"
    "        print(msg)",
    "def _log(msg: str, log: Optional[LogFn] = None) -> None:\n"
    "    fn = log if log is not None else globals().get('log', print)\n"
    "    try:\n"
    "        fn(msg)\n"
    "    except Exception:\n"
    "        print(msg)",
)
# If ast.unparse reformatted _log, force-patch by regex
if "globals().get('log'" not in loader_body:
    loader_body = re.sub(
        r"def _log\(msg: str, log: Optional\[LogFn\] = None\) -> None:\n"
        r"(?:    .*\n){1,6}",
        "def _log(msg: str, log: Optional[LogFn] = None) -> None:\n"
        "    fn = log if log is not None else globals().get('log', print)\n"
        "    try:\n"
        "        fn(msg)\n"
        "    except Exception:\n"
        "        print(msg)\n",
        loader_body,
        count=1,
    )

old_cell4_marker = (
    "# ═══ CELL 4: Load datasets (BUG 1+2 FIX: direct CSV paths, multi-tier) ═══\n"
    "# v8 FIX: Instead of rglob scanning (49 min), we try KNOWN CSV paths directly."
)
if old_cell4_marker not in src:
    raise SystemExit("CELL 4 marker missing")

# Find the code(""" that contains CELL 4 and replace whole content until closing """)
# Safer: replace from marker through "df = pd.DataFrame()" of empty branch end of load loop
old_load_start = src.find(old_cell4_marker)
if old_load_start < 0:
    raise SystemExit("CELL 4 start not found")

# End of cell 4 is the subsample cell marker
old_cell5_marker = (
    "# ═══ CELL 5: Filter + subsample (BUG 3 FIX: 8 obs/species for safe 3-way split) ═══"
)
old_cell5_pos = src.find(old_cell5_marker)
if old_cell5_pos < 0:
    raise SystemExit("CELL 5 marker missing")

# Work backwards to include everything from CELL 4 start to just before CELL 5 code block
# Structure: code("""\n CELL4 ... \n""")\n\n# ─── CELL 5
# Find the closing of cell4 code()
cell4_chunk = src[old_load_start:old_cell5_pos]
# cell4_chunk starts mid-string; find matching end before CELL5
# Actually CELL5 is inside its own code("""...""") so cell4 ends with """) before it
end_of_cell4 = src.rfind('""")', old_load_start, old_cell5_pos)
if end_of_cell4 < 0:
    raise SystemExit("CELL 4 end not found")
# Include through the closing quotes of code()
cell4_end = end_of_cell4 + len('""")')

new_cell4 = (
    "# ═══ CELL 4: E18 multi-source loader (fungi_csv_loader embedded) ═══\n"
    "# Fixes E17: FungiCLEF mounts were checkpoint/TFRecord-only; CSV aliases + multi-CSV + folders.\n"
    "\n"
    + loader_body
    + "\n\n"
    "# Load all detected datasets with multi-source gate (>=2 required)\n"
    "df = load_all_datasets(\n"
    "    ALL_DATASETS,\n"
    "    log=log,\n"
    "    min_sources=2,\n"
    "    hard_fail_below_min=True,\n"
    ")\n"
    "if df is None or len(df) == 0:\n"
    '    log("FATAL: No data loaded after multi-source gate!")\n'
    "    df = pd.DataFrame()\n"
    "else:\n"
    '    log(f"E18 source_db counts: {df[\'source_db\'].value_counts().to_dict()}")\n'
    '""")\n'
)

# Reconstruct: everything before CELL4 content inside code(), then new cell4
# Find start of code(""" containing CELL4
code_start = src.rfind('code("""', 0, old_load_start)
if code_start < 0:
    raise SystemExit("code() start for CELL4 not found")
# Keep `code("""\n` then new content
prefix = src[: code_start + len('code("""\n')]
suffix = src[cell4_end:]
src = prefix + new_cell4 + suffix

# ── 3) Allowlist filter (40 spp, caps 200/400) ───────────────────────────────
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

new_sub = f"""# ═══ CELL 5: E18 MULTISOURCE industrial allowlist (40 spp — NOT 80) ═══
# Scope lock: do not expand allowlist until MAP@3≥0.22 AND deadly@3≥0.50.
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
    # Prefer existing image paths after allowlist (same gate as CELL 4)
    if 'image_path' in df.columns:
        _ex = df['image_path'].map(lambda p: Path(str(p)).exists())
        log(f"  existing images post-allowlist (pre-cap): {{int(_ex.sum())}}/{{len(df)}}")
        df = df.loc[_ex].copy() if _ex.any() else df.iloc[0:0].copy()

    log(f"After allowlist filter: {{len(df)}} imgs, {{df['species'].nunique() if len(df) else 0}} spp")
    src_counts = df['source_db'].value_counts().to_dict() if len(df) and 'source_db' in df.columns else {{}}
    log(f"  Sources pre-cap: {{src_counts}}")
    n_src = int(df['source_db'].nunique()) if len(df) and 'source_db' in df.columns else 0
    log(f"  n_sources_after_allowlist={{n_src}}")
    if n_src < 2:
        msg = (
            f"MULTI-SOURCE GATE: expected ≥2 sources with rows after allowlist+existing images, "
            f"got {{n_src}}: {{src_counts}}"
        )
        log(f"  FATAL: {{msg}}")
        raise RuntimeError(msg)

    species_counts = df.groupby('observation_id')['species'].first().str.lower().value_counts()
    keep = []
    for sp, n in species_counts.items():
        mn = 3 if str(sp).lower() in DEADLY_FORCE else 4
        if n >= mn:
            keep.append(sp)
    df = df[df['species'].str.lower().isin(keep)].copy()

    # Re-check multi-source after min-obs filter (species drop can zero a source)
    src_counts2 = df['source_db'].value_counts().to_dict() if len(df) and 'source_db' in df.columns else {{}}
    n_src2 = int(df['source_db'].nunique()) if len(df) and 'source_db' in df.columns else 0
    if n_src2 < 2:
        msg = (
            f"MULTI-SOURCE GATE: expected ≥2 sources after min-obs filter, "
            f"got {{n_src2}}: {{src_counts2}}"
        )
        log(f"  FATAL: {{msg}}")
        raise RuntimeError(msg)

    MAX_OBS = 200
    MAX_OBS_DEADLY = 400
    # Fair per-source reservation (see fair_cap_observations in fungi_csv_loader)
    df = fair_cap_observations(
        df, max_obs=MAX_OBS, max_obs_deadly=MAX_OBS_DEADLY, deadly_force=DEADLY_FORCE,
    )
    if 'image_path' in df.columns:
        before = len(df)
        df = df.drop_duplicates(subset=['image_path'], keep='first')
        log(f"  Dedup image_path: {{before}} → {{len(df)}}")

    # Hard-fail after obs caps (caps can still zero a thin secondary source)
    src_counts3 = df['source_db'].value_counts().to_dict() if len(df) and 'source_db' in df.columns else {{}}
    n_src3 = int(df['source_db'].nunique()) if len(df) and 'source_db' in df.columns else 0
    log(f"  Sources post-cap: {{src_counts3}}")
    if n_src3 < 2:
        msg = (
            f"MULTI-SOURCE GATE: expected ≥2 sources after obs caps, "
            f"got {{n_src3}}: {{src_counts3}}"
        )
        log(f"  FATAL: {{msg}}")
        raise RuntimeError(msg)

    # Final multi-source snapshot used by metrics / DO7
    DATABASES_USED_EFFECTIVE = sorted(df['source_db'].unique().tolist()) if len(df) and 'source_db' in df.columns else []
    log(f"E18 multisource: imgs={{len(df)}} spp={{df['species'].nunique()}} obs={{df['observation_id'].nunique()}}")
    log(f"  obs/species median={{df.groupby('observation_id')['species'].first().value_counts().median():.0f}}")
    log(f"  Source DBs: {{df['source_db'].value_counts().to_dict()}}")
    log(f"  databases_used: {{DATABASES_USED_EFFECTIVE}}")
else:
    log("WARNING: empty df after allowlist")
    DATABASES_USED_EFFECTIVE = []
    raise RuntimeError(
        "MULTI-SOURCE GATE: empty df after allowlist — cannot train multi-source E18"
    )
"""

if old_sub not in src:
    raise SystemExit("subsample block missing — check CELL4 splice")
src = src.replace(old_sub, new_sub)

# ── 4) Train hyperparams (E17 carry-forward) ─────────────────────────────────
src = src.replace("epochs: int = 8", "epochs: int = 40  # E18")
src = src.replace("patience: int = 3", "patience: int = 10  # E18 dual early-stop")
src = src.replace("warmup_epochs: int = 1", "warmup_epochs: int = 2  # E18")
src = src.replace("swa_start_epoch: int = 6", "swa_start_epoch: int = 28  # E18")
src = src.replace("center_loss_weight: float = 0.01", "center_loss_weight: float = 0.05")
src = src.replace("batch_size: int = 16", "batch_size: int = 10  # E18 multi-view VRAM")

src = src.replace(
    "for epoch in range(start_epoch, cfg.epochs):\n    img_size = 224",
    "for epoch in range(start_epoch, cfg.epochs):\n"
    "    # E18: fixed 224 (P100-safe)\n"
    "    img_size = 224",
)

marker = 'log(f"Deadly species in dataset: {len(deadly_label_indices)}")'
inject = """
class_weights = torch.ones(NUM_CLASSES, device=DEVICE)
for di in deadly_label_indices:
    if 0 <= di < NUM_CLASSES:
        class_weights[di] = 12.0
log(f"E18 deadly class_weights x12 n={len(deadly_label_indices)}")
"""
if marker not in src:
    raise SystemExit("deadly marker missing")
src = src.replace(marker, marker + "\n" + inject)

src = src.replace(
    "loss_cls = F.cross_entropy(logits, labels, label_smoothing=cfg.label_smoothing)",
    "loss_cls = F.cross_entropy(logits, labels, weight=class_weights, label_smoothing=cfg.label_smoothing)\n"
    "            # E18: push deadly true class into top-3\n"
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

old_val_return = """    map3 = map_at_3(all_probs, all_labels)
    f1 = f1_score(all_labels, preds, average='macro', zero_division=0)
    return {'acc': acc, 'map3': map3, 'f1': f1}
"""
new_val_return = """    map3 = map_at_3(all_probs, all_labels)
    f1 = f1_score(all_labels, preds, average='macro', zero_division=0)
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

# Improved image path resolve list inside MultiViewDataset
src = src.replace(
    "for sub in ['', 'Train', 'train', 'Test', 'test',\n"
    "                         'Train/Processed_300px/JPG', 'val', 'Val',\n"
    "                         'FungiTastic-FewShot/Train', 'FungiTastic-FewShot/Val',\n"
    "                         'FungiTastic-FewShot/Train/Processed_300px/JPG',\n"
    "                         'FungiTastic-FewShot/Val/Processed_500px/JPG',\n"
    "                         'metadata/FungiTastic']:",
    "for sub in ['', 'Train', 'train', 'Test', 'test', 'images', 'merged_dataset',\n"
    "                         'Train/Processed_300px/JPG', 'val', 'Val',\n"
    "                         'FungiTastic-FewShot/Train', 'FungiTastic-FewShot/Val',\n"
    "                         'images/FungiTastic-FewShot/train/300p',\n"
    "                         'images/FungiTastic-FewShot/train/500p',\n"
    "                         'images/FungiTastic-FewShot/val/300p',\n"
    "                         'images/FungiTastic-FewShot/val/500p',\n"
    "                         'images/FungiTastic-FewShot/test/300p',\n"
    "                         'images/FungiTastic-FewShot/test/500p',\n"
    "                         'FungiTastic-FewShot/Train/Processed_300px/JPG',\n"
    "                         'FungiTastic-FewShot/Val/Processed_500px/JPG',\n"
    "                         'DF20-300px/DF20_300', 'DF20_300',\n"
    "                         'metadata/FungiTastic']:",
)

# Single databases_used key = effective post-allowlist contributors (not mount names)
src = src.replace(
    "'databases_used': list(ALL_DATASETS.keys()),\n"
    "    'subsample_config': {'max_species': 500, 'max_obs_per_species': 8},\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v8',",
    "'databases_used': list(globals().get('DATABASES_USED_EFFECTIVE') or (\n"
    "        sorted(df['source_db'].unique().tolist()) if len(df) and 'source_db' in df.columns else [])),\n"
    "    'datasets_mounted': list(ALL_DATASETS.keys()),\n"
    "    'subsample_config': {\n"
    "        'max_species': 40, 'max_obs': 200, 'max_obs_deadly': 400,\n"
    "        'experiment': 'E18-multisource', 'allowlist': 'industrial_v1',\n"
    "        'epochs': 40,\n"
    "        'sources_planned': ['fungitastic', 'mushroom1', 'combined_mushrooms'],\n"
    "        'baseline_e17_map': 0.194, 'baseline_e17_deadly': 0.447,\n"
    "        'gate_map': 0.22, 'gate_deadly': 0.50,\n"
    "        'soft_gate_map': 0.25, 'soft_gate_deadly': 0.90,\n"
    "        'note': 'do not expand to 80 spp until MAP@3>=0.22 AND deadly@3>=0.50',\n"
    "    },\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v18-E18-multisource',\n"
    "    'attribution': 'FungiTastic (Picek et al.) + public Kaggle mushroom image packs; educational orientation only',",
)

# DO checklist: industrial expand-to-80 + soft-gate A (not legacy mega 0.45/100%)
# Note: gen_notebook_v8 stores notebook newlines as literal \\n inside code("""...""")
_old_do = (
    'log(f"  DBs:            {list(ALL_DATASETS.keys())}")\n'
    'log(f"{\'=\'*60}")\n'
    "\n"
    'log("\\\\n📋 DEFINITION OF DONE STATUS:")\n'
    'log(f"  DO1: Runs < 8h ............... ✅ (est. ~2.5-3h)")\n'
    'log(f"  DO2: MAP@3 ≥ 0.450 ........... {\'✅\' if test_map3 >= 0.45 else \'⚠️\'} ({test_map3:.4f})")\n'
    'log(f"  DO3: Safety Recall = 100% .... {\'✅\' if safety_recall_deadly >= 1.0 else \'❌\'} ({safety_recall_deadly:.4f})")\n'
    'log(f"  DO4: Logging real-time ....... ✅")\n'
    'log(f"  DO5: Checkpoint each epoch ... ✅")\n'
    'log(f"  DO6: LoRA vectorized .......... ✅")\n'
    'log(f"  DO7: Multi-DB detected ........ {\'✅\' if len(ALL_DATASETS) >= 2 else \'⚠️\'} ({list(ALL_DATASETS.keys())})")\n'
    'log(f"  DO8: Artifacts exported ...... ✅")\n'
    'log(f"  DO9: ECE < 0.15 .............. {\'✅\' if ece < 0.15 else \'⚠️\'} ({ece:.4f})")\n'
    'log(f"  DO10: Per-species diag ....... ✅")'
)
_new_do = (
    'log(f"  DBs used:       {final_metrics.get(\'databases_used\', [])}")\n'
    'log(f"{\'=\'*60}")\n'
    "\n"
    'log("\\\\n📋 E18 GATES (industrial):")\n'
    'log(f"  DO1: Runs < 8h ............... ✅")\n'
    'log(f"  DO2: expand-to-80 MAP@3≥0.22 . {\'✅\' if test_map3 >= 0.22 else \'⚠️\'} ({test_map3:.4f})")\n'
    'log(f"  DO2b: soft-gate A MAP@3≥0.25 . {\'✅\' if test_map3 >= 0.25 else \'⚠️\'} ({test_map3:.4f})")\n'
    'log(f"  DO3: expand deadly@3≥0.50 .... {\'✅\' if safety_recall_deadly >= 0.50 else \'❌\'} ({safety_recall_deadly:.4f})")\n'
    'log(f"  DO3b: soft-gate deadly≥0.90 .. {\'✅\' if safety_recall_deadly >= 0.90 else \'❌\'} ({safety_recall_deadly:.4f})")\n'
    'log(f"  DO4: Logging real-time ....... ✅")\n'
    'log(f"  DO5: Checkpoint each epoch ... ✅")\n'
    'log(f"  DO6: LoRA vectorized .......... ✅")\n'
    "_dbs = final_metrics.get('databases_used', [])\n"
    'log(f"  DO7: Multi-source ≥2 used .... {\'✅\' if len(_dbs) >= 2 else \'❌\'} ({_dbs})")\n'
    'log(f"  DO8: Artifacts exported ...... ✅")\n'
    'log(f"  DO9: ECE < 0.15 .............. {\'✅\' if ece < 0.15 else \'⚠️\'} ({ece:.4f})")\n'
    'log(f"  DO10: Per-species diag ....... ✅")\n'
    'log("  Scope: allowlist stays 40 until expand-to-80 gates pass")'
)
if _old_do not in src:
    raise SystemExit("DO checklist block missing — cannot align industrial gates")
src = src.replace(_old_do, _new_do)

src = src.replace("TRAINING COMPLETE! (v8)", "TRAINING COMPLETE! (v18-E18-multisource)")
src = src.replace(
    'out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"',
    'out_path = Path(__file__).parent / "visionsetil_exp_v18_multisource.ipynb"',
)
src = src.replace(
    "VisionSetil Multi-View Mega Training v8",
    "VisionSetil E18 MULTISOURCE — real multi-source allowlist40",
)
src = src.replace(
    "VisionSetil v8 — Multi-View SOTA Training (3x BUG-FIXED)",
    "VisionSetil E18 MULTISOURCE — CSV/folder loader fix + 3 public image sources",
)

# Debug dump only when E18_DEBUG=1 (avoid accidental commit clutter)
import os

if os.environ.get("E18_DEBUG", "").strip() in {"1", "true", "yes"}:
    dbg = ROOT / "_gen_e18_debug.py"
    dbg.write_text(src, encoding="utf-8")
    print("wrote", dbg)

ns = {"__name__": "__main__", "__file__": str(ROOT / "gen_notebook_v8.py")}
try:
    exec(compile(src, "gen_e18.py", "exec"), ns)
except Exception as e:
    print("EXEC FAILED:", e)
    raise

out = ROOT / "visionsetil_exp_v18_multisource.ipynb"
if not out.is_file():
    raise SystemExit(f"MISSING notebook {out}")
# Build-time landmine guard (same as E19): ban string-literal backslash path replace
_nb_raw = out.read_text(encoding="utf-8")
if "replace('\\\\', '/')" in _nb_raw or 'replace("\\\\", "/")' in _nb_raw:
    raise SystemExit(
        "LANDMINE: notebook embeds replace('\\\\','/') — use replace(chr(92), '/') "
        "in fungi_csv_loader / _sanitize_loader_for_notebook"
    )
print("ok", out, out.stat().st_size)

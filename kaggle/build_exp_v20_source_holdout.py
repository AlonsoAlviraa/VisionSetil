#!/usr/bin/env python3
"""
E20 SOURCE HOLDOUT — honest anti-leak eval for VisionSetil ES orientation.

After E19 (mixed FT+GBIF random split inflated MAP@3 ~0.96):
  - Train (+ val): FungiTastic only (+ optional soft non-GBIF packs)
  - Test: pure GBIF ES allowlist40 (no FT in test)
  - Near-dup collapse before split (stem / media-id / optional filesize)
  - Persist train_obs.json / val_obs.json / test_obs.json / split_manifest.json
  - safety_recall_deadly = deadly@3 (true class in top-3); also report @1
  - Dual T4: DataParallel when 2 GPUs; batch scaled; graceful single-GPU
  - Caps 200/400, deadly×12, dual early-stop, ConvNeXtV2-tiny+LoRA multi-view
  - Allowlist stays 40 spp until honest gates pass

Usage:
  python kaggle/build_exp_v20_source_holdout.py
  python scripts/push_kaggle_e20.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
src = (ROOT / "gen_notebook_v8.py").read_text(encoding="utf-8")
loader_src = (ROOT / "fungi_csv_loader.py").read_text(encoding="utf-8")
near_dup_src = (ROOT / "near_dup.py").read_text(encoding="utf-8")
split_export_src = (ROOT / "split_export.py").read_text(encoding="utf-8")

allow = json.loads(
    (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(encoding="utf-8")
)
names = [s["latin_name"] for s in allow["species"]]
allow_literal = repr(set(names))


def _sanitize_for_notebook(text: str) -> str:
    """Strip module docstring / function docstrings / __future__; fix path landmine."""
    import ast

    tree = ast.parse(text)
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
    tree.body = [
        n
        for n in tree.body
        if not (isinstance(n, ast.ImportFrom) and n.module == "__future__")
    ]
    # Drop top-level imports that are already in notebook env or re-imported
    # Keep typing/collections/pathlib/re/json/pandas/numpy/sklearn as needed —
    # notebook already has most; re-import is fine.
    out = ast.unparse(tree)
    out = out.replace('"""', "'''").replace("→", "->")
    # Landmine: never leave replace('\\', '/') in notebook JSON
    out = out.replace(".replace('\\\\', '/')", ".replace(chr(92), '/')")
    out = out.replace('.replace("\\\\", "/")', ".replace(chr(92), '/')")
    out = out.replace(".replace('\\\\', \"/\")", ".replace(chr(92), '/')")
    out = out.replace('.replace("\\\\", \'/\')', ".replace(chr(92), '/')")
    # Landmine: '\n' / "\n" inside code("""...""") becomes a real newline and
    # breaks the outer generator string (unterminated string in cell).
    out = out.replace("'\\n'", "chr(10)")
    out = out.replace('"\\n"', "chr(10)")
    out = out.replace("'\\r'", "chr(13)")
    out = out.replace('"\\r"', "chr(13)")
    out = out.replace("'\\t'", "chr(9)")
    out = out.replace('"\\t"', "chr(9)")
    return out


# ── 1) Dataset detection: FT + GBIF + optional mush215 soft ───────────────────
old_detect_paths = """    FUNGICLEF_PATHS = [
        '/kaggle/input/datasets/seemshukla/fungiclef',
        '/kaggle/input/datasets/seemshukla',
        '/kaggle/input/fungiclef',
        '/kaggle/input/seemshukla',
    ]
"""

new_detect_paths = """    FUNGICLEF_PATHS = [
        # keep for future real CSV packs (seemshukla is checkpoint-only)
        '/kaggle/input/datasets/seemshukla/fungiclef',
        '/kaggle/input/datasets/seemshukla',
        '/kaggle/input/fungiclef',
        '/kaggle/input/seemshukla',
        '/kaggle/input/fungiclef2022',
        '/kaggle/input/datasets/fungiclef2022',
    ]
    # E20: GBIF ES allowlist40 — pure TEST domain
    GBIF_ES_PATHS = [
        '/kaggle/input/datasets/alonsoalviraaaa/visionsetil-gbif-es-allowlist40',
        '/kaggle/input/alonsoalviraaaa/visionsetil-gbif-es-allowlist40',
        '/kaggle/input/visionsetil-gbif-es-allowlist40',
        '/kaggle/input/datasets/alonsoalviraaaa',
    ]
    # Optional soft non-GBIF train packs
    MUSH215_PATHS = [
        '/kaggle/input/datasets/daniilonishchenko/mushrooms-images-classification-215',
        '/kaggle/input/daniilonishchenko/mushrooms-images-classification-215',
        '/kaggle/input/mushrooms-images-classification-215',
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

new_fc_detect = """    # Try FungiCLEF / DF20 pack (optional train domain)
    for p in FUNGICLEF_PATHS:
        if Path(p).exists():
            datasets['fungiclef'] = Path(p)
            log(f"  ✓ Found FungiCLEF path: {p}")
            break

    # E20 REQUIRED test domain: GBIF ES allowlist40
    for p in GBIF_ES_PATHS:
        if Path(p).exists():
            cand = Path(p)
            if (cand / 'obs_gbif_es.jsonl').exists() or (cand / 'images').exists() or cand.name == 'visionsetil-gbif-es-allowlist40':
                datasets['gbif_es'] = cand
                log(f"  ✓ Found gbif_es (TEST domain): {p}")
                break
            for sub in cand.iterdir() if cand.is_dir() else []:
                if sub.is_dir() and ('gbif' in sub.name.lower() or (sub / 'obs_gbif_es.jsonl').exists()):
                    datasets['gbif_es'] = sub
                    log(f"  ✓ Found gbif_es nested (TEST domain): {sub}")
                    break
            if 'gbif_es' in datasets:
                break

    for p in MUSH215_PATHS:
        if Path(p).exists():
            datasets['mush215'] = Path(p)
            log(f"  ✓ Found mush215 (optional train soft): {p}")
            break
"""

if old_fc_detect not in src:
    raise SystemExit("FungiCLEF detect block missing")
src = src.replace(old_fc_detect, new_fc_detect)

src = src.replace(
    "elif 'fungiclef' in combined or 'seemshukla' in combined:\n"
    "                datasets['fungiclef'] = d\n"
    "                log(f\"  ✓ Found FungiCLEF: {d}\")",
    "elif 'fungiclef' in combined or 'seemshukla' in combined:\n"
    "                datasets['fungiclef'] = d\n"
    "                log(f\"  ✓ Found FungiCLEF: {d}\")\n"
    "            elif 'gbif' in combined or 'visionsetil-gbif' in combined:\n"
    "                datasets['gbif_es'] = d\n"
    "                log(f\"  ✓ Found gbif_es: {d}\")\n"
    "            elif 'mushrooms-images-classification-215' in combined or 'daniilonishchenko' in combined:\n"
    "                datasets['mush215'] = d\n"
    "                log(f\"  ✓ Found mush215: {d}\")",
)

src = src.replace(
    "elif 'fungiclef' in name or 'seemshukla' in name:\n"
    "                        datasets['fungiclef'] = d\n"
    "                        log(f\"  ✓ Found FungiCLEF (nested): {d}\")",
    "elif 'fungiclef' in name or 'seemshukla' in name:\n"
    "                        datasets['fungiclef'] = d\n"
    "                        log(f\"  ✓ Found FungiCLEF (nested): {d}\")\n"
    "                    elif 'gbif' in name or 'visionsetil-gbif' in name:\n"
    "                        datasets['gbif_es'] = d\n"
    "                        log(f\"  ✓ Found gbif_es (nested): {d}\")\n"
    "                    elif '215' in name or 'daniilonishchenko' in name:\n"
    "                        datasets['mush215'] = d\n"
    "                        log(f\"  ✓ Found mush215 (nested): {d}\")",
)

# ── 2) Embed fungi_csv_loader + near_dup + split_export ───────────────────────
loader_body = _sanitize_for_notebook(loader_src)
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

near_dup_body = _sanitize_for_notebook(near_dup_src)
split_export_body = _sanitize_for_notebook(split_export_src)

old_cell4_marker = (
    "# ═══ CELL 4: Load datasets (BUG 1+2 FIX: direct CSV paths, multi-tier) ═══\n"
    "# v8 FIX: Instead of rglob scanning (49 min), we try KNOWN CSV paths directly."
)
if old_cell4_marker not in src:
    raise SystemExit("CELL 4 marker missing")

old_load_start = src.find(old_cell4_marker)
old_cell5_marker = (
    "# ═══ CELL 5: Filter + subsample (BUG 3 FIX: 8 obs/species for safe 3-way split) ═══"
)
old_cell5_pos = src.find(old_cell5_marker)
if old_cell5_pos < 0:
    raise SystemExit("CELL 5 marker missing")

end_of_cell4 = src.rfind('""")', old_load_start, old_cell5_pos)
if end_of_cell4 < 0:
    raise SystemExit("CELL 4 end not found")
cell4_end = end_of_cell4 + len('""")')

new_cell4 = (
    "# ═══ CELL 4: E20 multi-source loader + near-dup + split helpers ═══\n"
    "# Train domain: FungiTastic (+ soft packs). Test domain: GBIF ES pure.\n"
    "# Orientation only — never consumption permission.\n"
    "\n"
    + loader_body
    + "\n\n"
    + near_dup_body
    + "\n\n"
    + split_export_body
    + "\n\n"
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
    '    log(f"E20 source_db counts: {df[\'source_db\'].value_counts().to_dict()}")\n'
    "    _present = set(df['source_db'].unique().tolist()) if 'source_db' in df.columns else set()\n"
    "    if 'gbif_es' in ALL_DATASETS and 'gbif_es' not in _present:\n"
    "        raise RuntimeError(\n"
    "            f\"GBIF GATE: mount exists at {ALL_DATASETS['gbif_es']} but contributed 0 rows\"\n"
    "        )\n"
    "    if 'fungitastic' in ALL_DATASETS and 'fungitastic' not in _present:\n"
    "        log('  WARNING: fungitastic mounted but 0 rows after load')\n"
    "    if 'gbif_es' not in ALL_DATASETS:\n"
    "        log('  WARNING: gbif_es dataset not detected under /kaggle/input')\n"
    '""")\n'
)

code_start = src.rfind('code("""', 0, old_load_start)
if code_start < 0:
    raise SystemExit("code() start for CELL4 not found")
prefix = src[: code_start + len('code("""\n')]
suffix = src[cell4_end:]
src = prefix + new_cell4 + suffix

# ── 3) Allowlist + near-dup + domain-wise fair caps ───────────────────────────
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

new_sub = f"""# ═══ CELL 5: E20 industrial allowlist + near-dup collapse + domain caps ═══
# Scope lock: 40 spp until honest MAP@3≥0.22 AND deadly@3≥0.50 on GBIF hold-out.
# Product language: orientation only, never consumption permission.
ALLOWLIST = {allow_literal}
DEADLY_FORCE = {{
    'amanita phalloides', 'amanita virosa', 'amanita muscaria', 'amanita pantherina',
    'galerina marginata', 'gyromitra esculenta', 'cortinarius rubellus',
    'hypholoma fasciculare', 'lepiota castanea', 'lepiota subincarnata', 'paxillus involutus',
}}
TRAIN_DOMAIN_SOURCES = {{'fungitastic', 'mushroom1', 'combined_mushrooms', 'mush215', 'fungiclef', 'df20'}}
TEST_DOMAIN_SOURCES = {{'gbif_es', 'gbif'}}
NEAR_DUP_STATS = {{}}

if len(df) > 0:
    df['species'] = df['species'].astype(str).str.strip()
    allow_l = {{a.lower() for a in ALLOWLIST}}
    df = df[df['species'].str.lower().isin(allow_l)].copy()
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
    _have = set(src_counts.keys())
    if 'gbif_es' in ALL_DATASETS and 'gbif_es' not in _have:
        raise RuntimeError(f"GBIF GATE: 0 allowlist rows from gbif_es; sources={{src_counts}}")
    if 'fungitastic' in ALL_DATASETS and 'fungitastic' not in _have:
        raise RuntimeError(f"FT GATE: 0 allowlist rows from fungitastic; sources={{src_counts}}")

    # Near-dup collapse BEFORE domain split (stem/media; prefer cc_ok then train source)
    before_nd = len(df)
    df, NEAR_DUP_STATS = near_dup_collapse(
        df, train_sources=TRAIN_DOMAIN_SOURCES, use_filesize=False, log=log,
    )
    log(f"  Near-dup: {{before_nd}} → {{len(df)}} (collapsed {{NEAR_DUP_STATS.get('n_collapsed', 0)}})")

    species_counts = df.groupby('observation_id')['species'].first().str.lower().value_counts()
    keep = []
    for sp, n in species_counts.items():
        mn = 1 if str(sp).lower() in DEADLY_FORCE else 2
        if n >= mn:
            keep.append(sp)
    df = df[df['species'].str.lower().isin(keep)].copy()

    # Fair caps PER DOMAIN so GBIF cannot starve FT train pool (and vice versa)
    MAX_OBS = 200
    MAX_OBS_DEADLY = 400
    parts_capped = []
    for domain_name, domain_srcs in [('train', TRAIN_DOMAIN_SOURCES), ('test', TEST_DOMAIN_SOURCES)]:
        sub = df[df['source_db'].astype(str).isin(domain_srcs)].copy()
        if len(sub) == 0:
            log(f"  domain {{domain_name}}: 0 rows pre-cap")
            continue
        sub = fair_cap_observations(
            sub, max_obs=MAX_OBS, max_obs_deadly=MAX_OBS_DEADLY, deadly_force=DEADLY_FORCE,
            prefer_cc_ok=True,
        )
        log(f"  domain {{domain_name}} post-cap: {{len(sub)}} imgs, "
            f"{{sub['observation_id'].nunique()}} obs, sources={{sub['source_db'].value_counts().to_dict()}}")
        parts_capped.append(sub)
    if not parts_capped:
        raise RuntimeError("E20 GATE: no domain rows after caps")
    df = pd.concat(parts_capped, ignore_index=True)

    if 'image_path' in df.columns:
        before = len(df)
        df = df.drop_duplicates(subset=['image_path'], keep='first')
        log(f"  Dedup image_path: {{before}} → {{len(df)}}")

    src_counts3 = df['source_db'].value_counts().to_dict() if len(df) and 'source_db' in df.columns else {{}}
    if 'gbif_es' not in src_counts3 and 'gbif' not in src_counts3:
        raise RuntimeError(f"GBIF GATE: test domain dropped after caps: {{src_counts3}}")
    if 'fungitastic' not in src_counts3:
        raise RuntimeError(f"FT GATE: train domain dropped after caps: {{src_counts3}}")

    if 'license_class' in df.columns:
        _lc = df['license_class'].astype(str).str.lower().value_counts().to_dict()
        log(f"  license_class post-cap: {{_lc}}")

    DATABASES_USED_EFFECTIVE = sorted(df['source_db'].unique().tolist()) if len(df) and 'source_db' in df.columns else []
    log(f"E20 source-holdout prep: imgs={{len(df)}} spp={{df['species'].nunique()}} obs={{df['observation_id'].nunique()}}")
    log(f"  Source DBs: {{df['source_db'].value_counts().to_dict()}}")
    log(f"  databases_used: {{DATABASES_USED_EFFECTIVE}}")
    log("  Label sources: FT metadata CSVs; GBIF species field in JSONL")
    log("  Inputs are image-only (no species-name path features to model)")
else:
    log("WARNING: empty df after allowlist")
    DATABASES_USED_EFFECTIVE = []
    raise RuntimeError(
        "SOURCE HOLDOUT GATE: empty df after allowlist — cannot train E20"
    )
"""

if old_sub not in src:
    raise SystemExit("subsample block missing — check CELL4 splice")
src = src.replace(old_sub, new_sub)

# ── 4) Replace CELL 7 anti_leak_split with source hold-out + export ───────────
# Match gen_notebook_v8 escaped docstring form inside code("""...""")
_cell7_start = "# ═══ CELL 7: Anti-leak split (BUG 3 FIX: robust stratified with fallback) ═══\n"
_cell7_end = "train_df, val_df, test_df = anti_leak_split(df)\n"
_c7a = src.find(_cell7_start)
_c7b = src.find(_cell7_end)
if _c7a < 0 or _c7b < 0:
    raise SystemExit("CELL 7 anti_leak_split block missing — cannot replace with source holdout")
_c7b = _c7b + len(_cell7_end)

new_cell7 = """# ═══ CELL 7: E20 SOURCE HOLDOUT split + persist split artifacts ═══
# Train/val = FT domain; Test = pure GBIF ES. No mixed random test (E19 inflate).
# Assert train∩val∩test obs empty; fail hard if not.
# Cross-domain oid overlap hard-fails; residual near-dup keys drop contaminated test rows.
log("E20 source hold-out protocol (honest product gate)")

train_df, val_df, test_df, SPLIT_META = source_holdout_split(
    df,
    train_sources=TRAIN_DOMAIN_SOURCES,
    test_sources=TEST_DOMAIN_SOURCES,
    val_size=0.15,
    seed=42,
    min_per_class=2,
    require_train_core='fungitastic',
    require_test_core='gbif_es',
    hard_fail_cross_domain_oids=True,
    log=log,
)

# Residual near-dup hygiene: drop contaminated test rows (fail if test emptied)
test_df, _nd_scrub = drop_test_rows_sharing_near_dup_keys(
    train_df, val_df, test_df, hard_fail=False, log=log,
)
SPLIT_META['n_shared_near_dup_keys_post_split'] = int(_nd_scrub.get('n_shared_keys', 0))
SPLIT_META['n_test_rows_dropped_near_dup'] = int(_nd_scrub.get('n_dropped_rows', 0))
SPLIT_META['n_test_obs'] = int(test_df['observation_id'].nunique()) if len(test_df) else 0
SPLIT_META['n_test_imgs'] = int(len(test_df))
if _nd_scrub.get('n_shared_keys', 0) > 0:
    log(f"  Near-dup residual scrub: dropped {_nd_scrub.get('n_dropped_rows', 0)} test rows "
        f"({_nd_scrub.get('n_shared_keys')} shared keys)")
else:
    log("  Near-dup keys train/val↔test: empty (good)")

# Re-assert disjoint after scrub
assert_obs_disjoint(
    set(train_df['observation_id'].astype(str)),
    set(val_df['observation_id'].astype(str)),
    set(test_df['observation_id'].astype(str)),
    hard_fail=True,
)

OUT_DIR = Path('/kaggle/working/models')
OUT_DIR.mkdir(parents=True, exist_ok=True)
SPLIT_MANIFEST = export_split_artifacts(
    train_df, val_df, test_df, OUT_DIR,
    split_meta=SPLIT_META,
    near_dup_stats=globals().get('NEAR_DUP_STATS') or {},
    hard_fail=True,
)
log(f"Split artifacts saved under {OUT_DIR}: train_obs/val_obs/test_obs/split_manifest.json")
log(f"  protocol={SPLIT_MANIFEST.get('protocol')} pass={SPLIT_MANIFEST.get('pass')}")
"""
src = src[:_c7a] + new_cell7 + src[_c7b:]

# ── 5) T4x2 multi-GPU + batch scale ──────────────────────────────────────────
src = src.replace(
    "DEVICE = torch.device('cuda' if CUDA_WORKS else 'cpu')\n"
    "NUM_WORKERS = 4 if CUDA_WORKS else 2",
    "DEVICE = torch.device('cuda' if CUDA_WORKS else 'cpu')\n"
    "N_GPU = int(torch.cuda.device_count()) if CUDA_WORKS else 0\n"
    "NUM_WORKERS = 4 if CUDA_WORKS else 2\n"
    "if CUDA_WORKS:\n"
    "    for _gi in range(N_GPU):\n"
    "        print(f\"  GPU{_gi}: {torch.cuda.get_device_name(_gi)} "
    "({torch.cuda.get_device_properties(_gi).total_memory / 1e9:.1f} GB)\", flush=True)\n"
    "    print(f\"N_GPU={N_GPU} (T4x2 DataParallel when >=2)\", flush=True)",
)

src = src.replace("epochs: int = 8", "epochs: int = 40  # E20")
src = src.replace("patience: int = 3", "patience: int = 10  # E20 dual early-stop")
src = src.replace("warmup_epochs: int = 1", "warmup_epochs: int = 2  # E20")
src = src.replace("swa_start_epoch: int = 6", "swa_start_epoch: int = 28  # E20")
src = src.replace("center_loss_weight: float = 0.01", "center_loss_weight: float = 0.05")
src = src.replace("batch_size: int = 16", "batch_size: int = 10  # E20 multi-view base (scaled x N_GPU)")

# Scale batch for multi-GPU after cfg creation
src = src.replace(
    "cfg = TrainConfig()\n"
    "\n"
    "if len(train_obs) < 100:",
    "cfg = TrainConfig()\n"
    "\n"
    "# T4x2: scale batch when 2 GPUs available (DataParallel splits batch)\n"
    "if globals().get('N_GPU', 0) >= 2:\n"
    "    cfg.batch_size = min(cfg.batch_size * 2, 20)\n"
    "    log(f'E20 multi-GPU: N_GPU={N_GPU}, batch_size={cfg.batch_size}')\n"
    "\n"
    "if len(train_obs) < 100:",
)

# DataParallel wrap after model build
old_model_build = """model = MultiViewModel(
    backbone_name=cfg.backbone,
    d_model=cfg.d_model,
    metadata_dim=cfg.metadata_dim,
    num_classes=NUM_CLASSES,
    lora_rank=cfg.lora_rank,
).to(DEVICE)

param_count = sum(p.numel() for p in model.parameters()) / 1e6
log(f"Model parameters: {param_count:.1f}M")

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

OUT_DIR = Path('/kaggle/working/models')
OUT_DIR.mkdir(parents=True, exist_ok=True)
CHECKPOINT_PATH = OUT_DIR / 'checkpoint_latest.pt'

log("Optimizer + AMP + SWA ready.")
"""

new_model_build = """model = MultiViewModel(
    backbone_name=cfg.backbone,
    d_model=cfg.d_model,
    metadata_dim=cfg.metadata_dim,
    num_classes=NUM_CLASSES,
    lora_rank=cfg.lora_rank,
).to(DEVICE)

# T4x2: DataParallel when 2+ GPUs; graceful single-GPU fallback
if globals().get('N_GPU', 0) >= 2:
    model = nn.DataParallel(model)
    log(f"E20 DataParallel enabled on {N_GPU} GPUs")
else:
    log(f"E20 single-device training (N_GPU={globals().get('N_GPU', 0)})")

def _unwrap(m):
    return m.module if isinstance(m, nn.DataParallel) else m

def _model_state(m):
    # Always unwrapped state_dict (never use bare dir() inside nested fns)
    return _unwrap(m).state_dict()

def _load_model_state(m, state_dict):
    # Load unwrapped or DP-prefixed state into current model layout
    try:
        m.load_state_dict(state_dict)
        return
    except RuntimeError:
        pass
    # strip or add module. prefix for T4x2 <-> single GPU resume
    sd = state_dict
    if any(k.startswith('module.') for k in sd.keys()):
        sd = {k[7:] if k.startswith('module.') else k: v for k, v in sd.items()}
        try:
            _unwrap(m).load_state_dict(sd)
            return
        except RuntimeError:
            pass
    else:
        try:
            _unwrap(m).load_state_dict(sd)
            return
        except RuntimeError:
            pass
        try:
            m.load_state_dict({'module.' + k: v for k, v in sd.items()})
            return
        except RuntimeError:
            pass
    raise RuntimeError('Failed to load model_state (DataParallel key mismatch)')

param_count = sum(p.numel() for p in _unwrap(model).parameters()) / 1e6
log(f"Model parameters: {param_count:.1f}M")

_m = _unwrap(model)
backbone_params = list(_m.backbone.backbone.parameters())
head_params = [p for n, p in _m.named_parameters() if not n.startswith('backbone.backbone.')]
optimizer = torch.optim.AdamW([
    {'params': backbone_params, 'lr': cfg.lr_backbone},
    {'params': head_params, 'lr': cfg.lr_head},
], weight_decay=cfg.weight_decay)

scaler = torch.amp.GradScaler('cuda', enabled=cfg.amp)

swa_model = None
if cfg.use_swa:
    swa_model = torch.optim.swa_utils.AveragedModel(model)

OUT_DIR = Path('/kaggle/working/models')
OUT_DIR.mkdir(parents=True, exist_ok=True)
CHECKPOINT_PATH = OUT_DIR / 'checkpoint_latest.pt'

log("Optimizer + AMP + SWA ready.")
"""

if old_model_build not in src:
    raise SystemExit("model build block missing for DataParallel inject")
src = src.replace(old_model_build, new_model_build)

# Dual early-stop + deadly@3 val + unwrapped state_dict (before other state patches)
marker = 'log(f"Deadly species in dataset: {len(deadly_label_indices)}")'
inject = """
class_weights = torch.ones(NUM_CLASSES, device=DEVICE)
for di in deadly_label_indices:
    if 0 <= di < NUM_CLASSES:
        class_weights[di] = 12.0
log(f"E20 deadly class_weights x12 n={len(deadly_label_indices)}")
"""
if marker not in src:
    raise SystemExit("deadly marker missing")
src = src.replace(marker, marker + "\n" + inject)

src = src.replace(
    "loss_cls = F.cross_entropy(logits, labels, label_smoothing=cfg.label_smoothing)",
    "loss_cls = F.cross_entropy(logits, labels, weight=class_weights, label_smoothing=cfg.label_smoothing)\n"
    "            # E20: push deadly true class into top-3\n"
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

    # Dual early-stop: patience resets on MAP@3 OR deadly@3 improvement.
    # best.pt = MAP@3 weights (primary product metric load); best_deadly.pt = deadly@3 peak.
    improved = False
    if val_metrics['map3'] > best_map3:
        best_map3 = val_metrics['map3']
        best_epoch = epoch
        improved = True
        torch.save({
            'epoch': epoch,
            'model_state': _model_state(model),
            'config': {'d_model': cfg.d_model, 'metadata_dim': cfg.metadata_dim,
                       'num_classes': NUM_CLASSES, 'lora_rank': cfg.lora_rank},
            'label2idx': label2idx,
            'metadata_vocab': metadata_vocab,
            'val_map3': float(best_map3),
            'val_deadly3': float(val_metrics.get('deadly3', 0.0) or 0.0),
            'checkpoint_kind': 'best_map3',
        }, OUT_DIR / 'best.pt')
        log(f"  ★ New best MAP@3: {best_map3:.4f} — saved best.pt!")
    d3 = float(val_metrics.get('deadly3', 0.0) or 0.0)
    if d3 > best_deadly + 1e-6:
        best_deadly = d3
        improved = True
        torch.save({
            'epoch': epoch,
            'model_state': _model_state(model),
            'config': {'d_model': cfg.d_model, 'metadata_dim': cfg.metadata_dim,
                       'num_classes': NUM_CLASSES, 'lora_rank': cfg.lora_rank},
            'label2idx': label2idx,
            'metadata_vocab': metadata_vocab,
            'val_map3': float(val_metrics['map3']),
            'val_deadly3': float(best_deadly),
            'checkpoint_kind': 'best_deadly3',
        }, OUT_DIR / 'best_deadly.pt')
        log(f"  ★ New best val deadly@3: {best_deadly:.4f} — saved best_deadly.pt!")
    if improved:
        epochs_no_improve = 0
    else:
        epochs_no_improve += 1
        log(f"  No improvement for {epochs_no_improve} epoch(s).")
"""

if old_hist not in src:
    raise SystemExit("history/best block missing")
src = src.replace(old_hist, new_hist)

# save_checkpoint: always unwrapped state (never dir() locals)
src = src.replace(
    "def save_checkpoint(epoch, model, optimizer, best_map3, best_epoch, history):\n"
    "    torch.save({\n"
    "        'epoch': epoch,\n"
    "        'model_state': model.state_dict(),",
    "def save_checkpoint(epoch, model, optimizer, best_map3, best_epoch, history):\n"
    "    torch.save({\n"
    "        'epoch': epoch,\n"
    "        'model_state': _model_state(model),",
)

# Resume training: robust DP <-> single GPU
src = src.replace(
    "ckpt = load_checkpoint_if_exists()\n"
    "start_epoch = 0\n"
    "if ckpt is not None:\n"
    "    model.load_state_dict(ckpt['model_state'])",
    "ckpt = load_checkpoint_if_exists()\n"
    "start_epoch = 0\n"
    "if ckpt is not None:\n"
    "    _load_model_state(model, ckpt['model_state'])",
)

# load best for test — robust unwrap
src = src.replace(
    "best_ckpt = torch.load(OUT_DIR / 'best.pt', map_location=DEVICE, weights_only=False)\n"
    "model.load_state_dict(best_ckpt['model_state'])\n"
    "model.eval()",
    "best_ckpt = torch.load(OUT_DIR / 'best.pt', map_location=DEVICE, weights_only=False)\n"
    "_load_model_state(model, best_ckpt['model_state'])\n"
    "model.eval()\n"
    "log('Loaded best.pt (MAP@3 checkpoint); best_deadly.pt saved when deadly@3 improved')",
)

src = src.replace(
    "for epoch in range(start_epoch, cfg.epochs):\n    img_size = 224",
    "for epoch in range(start_epoch, cfg.epochs):\n"
    "    # E20: fixed 224 (T4-safe multi-view)\n"
    "    img_size = 224",
)

# ── 6) Fix safety_recall_deadly = @3 (E19 bug: was top-1) ────────────────────
old_safety = """# DO3: Safety Recall Deadly
deadly_mask = np.array([l in deadly_label_indices for l in all_labels])
n_deadly = deadly_mask.sum()
if n_deadly > 0:
    deadly_correct = (all_preds[deadly_mask] == all_labels[deadly_mask]).sum()
    safety_recall_deadly = deadly_correct / n_deadly
    log(f"  🔴 DEADLY species in test: {n_deadly}")
    log(f"  🔴 Safety Recall Deadly: {safety_recall_deadly:.4f}")
else:
    safety_recall_deadly = 1.0
    log(f"  No deadly species in test set. Safety recall = 1.0 (vacuous).")
"""

new_safety = """# DO3: Safety Recall Deadly = TRUE @3 (E19 mislabeled top-1 as safety_recall_deadly)
# FAIL-CLOSED: n_deadly==0 must NOT green-pass expand gate (no vacuous 1.0)
deadly_mask = np.array([l in deadly_label_indices for l in all_labels])
n_deadly = int(deadly_mask.sum())
if n_deadly > 0:
    # @1 diagnostic
    deadly_correct_1 = (all_preds[deadly_mask] == all_labels[deadly_mask]).sum()
    safety_recall_deadly_at_1 = float(deadly_correct_1 / n_deadly)
    # @3 product gate (true class in top-3 among deadly-labeled samples)
    top3 = np.argsort(-all_probs, axis=1)[:, :3]
    hits3 = 0
    for i, lab in enumerate(all_labels):
        if deadly_mask[i] and lab in top3[i]:
            hits3 += 1
    safety_recall_deadly_at_3 = float(hits3 / n_deadly)
    # Primary field name = @3 (gates use this)
    safety_recall_deadly = safety_recall_deadly_at_3
    deadly_gate_status = 'ok'
    log(f"  🔴 DEADLY species in test (GBIF pure): {n_deadly}")
    log(f"  🔴 safety_recall_deadly_at_1: {safety_recall_deadly_at_1:.4f}")
    log(f"  🔴 safety_recall_deadly_at_3 (=safety_recall_deadly): {safety_recall_deadly_at_3:.4f}")
else:
    # Fail-closed: unevaluable — numeric 0.0 so threshold checks cannot pass
    safety_recall_deadly = 0.0
    safety_recall_deadly_at_1 = 0.0
    safety_recall_deadly_at_3 = 0.0
    deadly_gate_status = 'unevaluable'
    log('  FATAL-soft: 0 deadly samples in pure GBIF test — deadly gate UNEVALUABLE')
    log('  safety_recall_deadly set to 0.0 (fail-closed; will not pass expand gate)')
"""

if old_safety not in src:
    raise SystemExit("safety_recall_deadly block missing")
src = src.replace(old_safety, new_safety)

# Metrics export
src = src.replace(
    "'safety_recall_deadly': float(safety_recall_deadly),\n"
    "    'n_deadly_in_test': int(n_deadly),",
    "'safety_recall_deadly': float(safety_recall_deadly),  # @3 (product gate); 0.0 if n_deadly==0 fail-closed\n"
    "    'safety_recall_deadly_at_1': float(safety_recall_deadly_at_1),\n"
    "    'safety_recall_deadly_at_3': float(safety_recall_deadly_at_3),\n"
    "    'safety_recall_deadly_definition': 'top-3 among deadly-labeled samples (true class in top-3)',\n"
    "    'n_deadly_in_test': int(n_deadly),\n"
    "    'deadly_gate_status': str(deadly_gate_status),\n"
    "    'deadly_gate_pass_expand': bool(n_deadly > 0 and safety_recall_deadly >= 0.50),\n"
    "    'deadly_gate_pass_soft': bool(n_deadly > 0 and safety_recall_deadly >= 0.90),\n"
    "    'eval_protocol': 'source_holdout_e20',\n"
    "    'test_domain': 'gbif_es_only',\n"
    "    'train_domain': 'fungitastic_plus_soft_non_gbif',\n"
    "    'primary_checkpoint': 'best.pt (MAP@3); best_deadly.pt also saved on deadly@3 peak',\n"
    "    'split_artifacts': ['train_obs.json', 'val_obs.json', 'test_obs.json', 'split_manifest.json'],",
)

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
    "        'experiment': 'E20-source-holdout', 'allowlist': 'industrial_v1',\n"
    "        'epochs': 40,\n"
    "        'protocol': 'train=FT(+soft non-GBIF); val=FT holdout; test=GBIF ES pure',\n"
    "        'sources_train': ['fungitastic'],\n"
    "        'sources_test': ['gbif_es'],\n"
    "        'sources_optional_train': ['mush215'],\n"
    "        'near_dup': True,\n"
    "        'persist_split_artifacts': True,\n"
    "        'gate_map': 0.22, 'gate_deadly_at_3': 0.50,\n"
    "        'soft_gate_map': 0.25, 'soft_gate_deadly_at_3': 0.90,\n"
    "        'prefer_cc_ok': True,\n"
    "        'multi_gpu': 'DataParallel if N_GPU>=2 (T4x2)',\n"
    "        'note': 'honest gates lower than E19 mixed; orientation only; no expand to 80 until pass',\n"
    "    },\n"
    "    'deadly_species_known': len(DEADLY_SPECIES),\n"
    "    'deadly_species_in_dataset': len(deadly_label_indices),\n"
    "    'version': 'v20-E20-source-holdout',\n"
    "    'n_gpu': int(globals().get('N_GPU', 0)),\n"
    "    'attribution': 'FungiTastic (Picek et al.) train + GBIF ES StillImage pure test; educational orientation only',",
)

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
    'log(f"  Protocol:       source_holdout test=GBIF pure")\n'
    'log(f"  N_GPU:          {globals().get(\'N_GPU\', 0)}")\n'
    'log(f"{\'=\'*60}")\n'
    "\n"
    'log("\\\\n📋 E20 HONEST GATES (source hold-out):")\n'
    'log(f"  DO1: Runs < 8h ............... ✅")\n'
    'log(f"  DO2: expand-to-80 MAP@3≥0.22 . {\'✅\' if test_map3 >= 0.22 else \'⚠️\'} ({test_map3:.4f})")\n'
    'log(f"  DO2b: soft-gate A MAP@3≥0.25 . {\'✅\' if test_map3 >= 0.25 else \'⚠️\'} ({test_map3:.4f})")\n'
    "_dg = (n_deadly > 0 and safety_recall_deadly >= 0.50)\n"
    "_dgs = (n_deadly > 0 and safety_recall_deadly >= 0.90)\n"
    'log(f"  DO3: expand deadly@3≥0.50 .... {\'✅\' if _dg else \'❌\'} '
    '(val={safety_recall_deadly:.4f} n_deadly={n_deadly} status={deadly_gate_status})")\n'
    'log(f"  DO3b: soft-gate deadly@3≥0.90 {\'✅\' if _dgs else \'❌\'} '
    '(val={safety_recall_deadly:.4f} n_deadly={n_deadly})")\n'
    'log(f"  DO3c: deadly@1 (diagnostic) .. {safety_recall_deadly_at_1:.4f}")\n'
    'log(f"  DO3d: fail-closed n_deadly>0 . {\'✅\' if n_deadly > 0 else \'❌ UNEVALUABLE\'}")\n'
    'log(f"  DO4: Logging real-time ....... ✅")\n'
    'log(f"  DO5: Checkpoint each epoch ... ✅")\n'
    'log(f"  DO6: LoRA vectorized .......... ✅")\n'
    "_dbs = final_metrics.get('databases_used', [])\n"
    'log(f"  DO7: FT+GBIF present ......... {\'✅\' if (\'fungitastic\' in _dbs and (\'gbif_es\' in _dbs or \'gbif\' in _dbs)) else \'❌\'} ({_dbs})")\n'
    'log(f"  DO7b: pure GBIF test ......... ✅ (protocol)")\n'
    'log(f"  DO8: Artifacts + split ids ... ✅")\n'
    'log(f"  DO9: ECE < 0.15 .............. {\'✅\' if ece < 0.15 else \'⚠️\'} ({ece:.4f})")\n'
    'log(f"  DO10: Per-species diag ....... ✅")\n'
    'log("  Scope: allowlist 40 until expand gates; orientation only; no product unlock claim")'
)
if _old_do not in src:
    raise SystemExit("DO checklist block missing — cannot align industrial gates")
src = src.replace(_old_do, _new_do)

src = src.replace("TRAINING COMPLETE! (v8)", "TRAINING COMPLETE! (v20-E20-source-holdout)")
src = src.replace(
    'out_path = Path(__file__).parent / "visionsetil_mega_training.ipynb"',
    'out_path = Path(__file__).parent / "visionsetil_exp_v20_source_holdout.ipynb"',
)
src = src.replace(
    "VisionSetil Multi-View Mega Training v8",
    "VisionSetil E20 SOURCE-HOLDOUT — FT train / GBIF pure test",
)
src = src.replace(
    "VisionSetil v8 — Multi-View SOTA Training (3x BUG-FIXED)",
    "VisionSetil E20 SOURCE-HOLDOUT — honest anti-leak eval (T4x2)",
)

# Notebook accelerator metadata hint (Python True, not JSON true)
src = src.replace(
    '"accelerator": "GPU",',
    '"accelerator": "GPU",\n'
    '        "kaggle": {"accelerator": "nvidiaTeslaT4", "isGpuEnabled": True},',
)

ns = {"__name__": "__main__", "__file__": str(ROOT / "gen_notebook_v8.py")}
try:
    exec(compile(src, "gen_e20.py", "exec"), ns)
except Exception as e:
    print("EXEC FAILED:", e)
    raise

out = ROOT / "visionsetil_exp_v20_source_holdout.ipynb"
if not out.is_file():
    raise SystemExit(f"MISSING notebook {out}")

# Build-time landmine guard
_nb_raw = out.read_text(encoding="utf-8")
if "replace('\\\\', '/')" in _nb_raw or 'replace("\\\\", "/")' in _nb_raw:
    raise SystemExit(
        "LANDMINE: notebook embeds replace('\\\\','/') — use replace(chr(92), '/') "
        "in helpers / _sanitize_for_notebook"
    )
if "replace(chr(92)" not in _nb_raw:
    raise SystemExit("notebook missing replace(chr(92) path normalize")
# Must contain deadly@3 fix and source holdout
if "safety_recall_deadly_at_3" not in _nb_raw:
    raise SystemExit("notebook missing safety_recall_deadly_at_3")
if "source_holdout" not in _nb_raw.lower() and "source_holdout_split" not in _nb_raw:
    raise SystemExit("notebook missing source_holdout_split")
if "DataParallel" not in _nb_raw:
    raise SystemExit("notebook missing DataParallel for T4x2")
if "train_obs.json" not in _nb_raw:
    raise SystemExit("notebook missing train_obs.json export")

_nb = json.loads(_nb_raw)
import ast as _ast

for _i, _cell in enumerate(_nb.get("cells", [])):
    if _cell.get("cell_type") != "code":
        continue
    _src = _cell.get("source", [])
    _src = "".join(_src) if isinstance(_src, list) else str(_src)
    try:
        _ast.parse(_src)
    except SyntaxError as _e:
        raise SystemExit(f"LANDMINE: code cell {_i} SyntaxError after embed: {_e}") from _e
print("ok", out, out.stat().st_size)

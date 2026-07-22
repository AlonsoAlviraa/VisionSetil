# ML weights packaging & readyz honesty (PR-16)

## Reference artifacts

Known training outputs live under:

- `kaggle/kernel_output_v9/models/`
  - `label2idx.json`
  - `metrics.json`
  - `test_predictions.npz`
  - `training_history.json`

Full MultiView checkpoint path (when available):

- Settings: `multi_view_weights_path` → default `backend/app/ml/weights/multiview_v1.pt`
- Env override via pydantic-settings / `.env`

## Honest readiness

`GET /readyz` reports:

- `classifier_mode`: `real` | `mock` | `error`
- `degraded: true` when running mock fallback
- `catalog_version` / `catalog_count`
- `media_root` / `media_placeholders`
- (Phase B) nested `quality_gate` + `weights_present` when wired

Production should set `READYZ_FAIL_ON_MOCK_MODELS=true` only when real weights are required.

Also check **`GET /models/quality-gate`** before claiming live identification:

- `metrics_acceptable` — MAP@3 / deadly recall vs thresholds (never forced true by disable)
- `species_id_allowed` — policy (respects block flag)
- `block_enabled` — mirrors `MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE`
- `reason_code` — e.g. `gates_passed` | `map_below` | `deadly_below` | `no_metrics` | `gate_disabled`

## Quality gate disable is **dev-only** (B-23 / D-B3)

| Setting | Default | Notes |
|---|---|---|
| `MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE` | `true` | Fail-closed: bad metrics → species ID blocked |
| `ENVIRONMENT` | `development` | Use `production` / `prod` in real deploys |

**Rules:**

1. **Never** set `MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE=false` in production.
2. **B-23 hard refuse:** if `ENVIRONMENT` is `production` or `prod` and the block is disabled, `Settings` construction raises and the API **will not start**.
3. **B-19 soft guardrail:** in non-prod, disable still boots but emits structured log  
   `event=quality_gate_block_disabled` (severity `warning`; would be `critical` if prod were reached via monkeypatch).
4. Disable is for local experiments only (e.g. UI work while metrics remain below gate). Confidence UI must still key off `metrics_acceptable`, not only `species_id_allowed` (D-B9).

See also: `docs/QUALITY_GATE.md`, `docs/configuration.md`.

## Preflight notes (Identify / ops)

Frontend preflight (B-11) should:

1. Fetch `/readyz` + `/models/quality-gate` (advisory — **do not** hard-disable submit solely because the gate failed).
2. Treat offline / API-down as submit-disabled with clear copy.
3. Map dual signals honestly:
   - `gate_disabled` + bad metrics → mode can be `real`/`mock` with **metrics warning**; **no confidence bars** until `metrics_acceptable`.
   - Gate blocked (`species_id_allowed=false`) → educational shell / blocked mode; submit may stay enabled so users can still receive abstention.
4. Weight discovery: confirm sibling `metrics.json` next to the loaded checkpoint; missing sibling → `no_metrics` / fail-closed serve path (D-B12).

Ops alert (Phase B): `block_enabled=false` under `ENVIRONMENT=production` should page — prevented at boot by B-23 refuse when config is consistent.

## Packaging checklist

1. **Never commit weights to GitHub.** `*.pt` / `*.pth` / `*.onnx` / `*.safetensors` are gitignored (local only).
2. Copy approved checkpoint into a local path, e.g. `backend/app/ml/weights/` or `kaggle/kernel_output_*/models/`.
3. Point `MULTI_VIEW_WEIGHTS_PATH` (or settings / weight_discovery) at the file.
4. Confirm `/readyz` → `classifier_mode: real` and quality-gate dual signals as expected.
5. Keep `ENVIRONMENT=production` + `MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE=true` in prod compose/env.
6. Never claim production accuracy metrics without matching `eval/reports` baseline table (PR-18 gate).

### Optional: purge weights already on GitHub history

This commit only stops **future** tracking. Old LFS blobs may still exist in remote history until cleaned (BFG / `git filter-repo` + force-push). Coordinate with the team before rewriting `main`.

## Fallback behaviour

`model_fallback_to_mock=true` (default) keeps the API usable offline with mock predictions; safety policy still applies (`orientation_only` / `unsafe_to_consume`). Mock stack does **not** override quality-gate fail-closed: without acceptable metrics, species ID stays blocked unless someone fail-opens the gate in **non-prod** only.
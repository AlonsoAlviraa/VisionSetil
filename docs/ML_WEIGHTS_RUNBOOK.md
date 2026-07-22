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

Production should set `READYZ_FAIL_ON_MOCK_MODELS=true` only when real weights are required.

## Packaging checklist

1. **Never commit weights to GitHub.** `*.pt` / `*.pth` / `*.onnx` / `*.safetensors` are gitignored (local only).
2. Copy approved checkpoint into a local path, e.g. `backend/app/ml/weights/` or `kaggle/kernel_output_*/models/`.
3. Point `MULTI_VIEW_WEIGHTS_PATH` (or settings / weight_discovery) at the file.
4. Confirm `/readyz` → `classifier_mode: real`.
5. Never claim production accuracy metrics without matching `eval/reports` baseline table (PR-18 gate).

### Optional: purge weights already on GitHub history

This commit only stops **future** tracking. Old LFS blobs may still exist in remote history until cleaned (BFG / `git filter-repo` + force-push). Coordinate with the team before rewriting `main`.

## Fallback behaviour

`model_fallback_to_mock=true` (default) keeps the API usable offline with mock predictions; safety policy still applies (`orientation_only` / `unsafe_to_consume`).

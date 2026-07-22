# VisionSetil — Configuration Reference

All configuration is centralized in `backend/app/core/config.py` via
`pydantic-settings`. Every field below can be overridden through an environment
variable of the same name (case-insensitive) or a `.env` file at the repo root.

## Quick start

```bash
cp .env.example .env
# edit .env to taste
```

## Categories

### Paths

| Variable | Default | Description |
|---|---|---|
| `BASE_DIR` | repo root | Base directory for relative paths. |
| `DATABASE_PATH` | `<base>/mushroom_photo_id.db` | SQLite database file. |
| `UPLOAD_DIR` | `<base>/uploads` | Where uploaded images are stored. |
| `POISONOUS_SPECIES_PATH` | `backend/app/data/poisonous_species.json` | Poisonous species denylist. |
| `MOCK_SPECIES_CATALOG_PATH` | `backend/app/data/mock_species_catalog.json` | Mock species catalog. |
| `METADATA_SCHEMA_PATH` | `backend/app/data/metadata_schema.json` | JSON schema for metadata. |

### Uploads

| Variable | Default | Description |
|---|---|---|
| `MAX_IMAGE_MB` | `10` | Max upload size in **megabytes** (values ≤ 2048 treated as MB). |
| `ALLOWED_EXTENSIONS` | `{jpg,jpeg,png,webp}` | Allowed image extensions. |

### Pipeline

| Variable | Default | Description |
|---|---|---|
| `TOP_K_CANDIDATES` | `5` | Number of species candidates returned. |

### Model activation

| Variable | Default | Description |
|---|---|---|
| `USE_REAL_YOLOE` | `False` | Activate the real YOLOE detector. |
| `USE_REAL_DINOV3` | `False` | Activate the real DINOv3 backbone. |
| `USE_REAL_SIGLIP2` | `False` | Activate the real SigLIP-2 text encoder. |
| `ALLOW_MOCK_FALLBACKS` | `True` | Allow falling back to mock models when real ones fail. |

### Open-set rejection (safety)

| Variable | Default | Description |
|---|---|---|
| `OPEN_SET_MIN_CONFIDENCE` | `0.55` | Minimum confidence to accept a prediction. |
| `OPEN_SET_MIN_MARGIN` | `0.15` | Minimum margin between top-1 and top-2. |
| `OPEN_SET_REJECT_ON_MISSING_CRITICAL_EVIDENCE` | `True` | Reject when required views are missing. |
| `OPEN_SET_REJECT_ON_DEADLY_LOOKALIKES` | `True` | Reject when a deadly lookalike is near. |

### Runtime environment & quality gate (D-B3 / B-19 / B-23)

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | Ops environment label. `production` / `prod` enable production guardrails. |
| `MODEL_MIN_ACCEPTABLE_MAP_AT_3` | `0.20` | Min on-disk test MAP@3 before species ID is allowed. |
| `MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE` | `True` | **Fail-closed.** When `True`, bad/missing metrics block species ID. |

**Gate disable is dev-only:**

- Default is always fail-closed (`MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE=true`).
- Setting it `false` is fail-open (species ID allowed despite bad metrics) — **local/dev only**.
- **B-23:** if `ENVIRONMENT` is `production` or `prod` and the block flag is `false`, `Settings` construction **raises** (`ValidationError`) and the process will not boot.
- **B-19:** in non-production, a structured warning (`event=quality_gate_block_disabled`) is emitted at boot and on gate evaluation when the block is disabled.
- Dual signals still apply: disable may set `species_id_allowed=true` but never forces `metrics_acceptable=true` (see `docs/QUALITY_GATE.md`, `docs/ML_WEIGHTS_RUNBOOK.md`).

### Security / runtime

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGINS` | *(empty)* | Comma-separated allowed origins. Never combine `*` with credentials. |
| `LOG_LEVEL` | `INFO` | Root log level. |
| `LOG_FORMAT` | `text` | `text` (dev) or `json` (production). |
| `REQUEST_ID_HEADER` | `X-Request-ID` | Header name used for correlation ids. |
| `READYZ_FAIL_ON_MOCK_MODELS` | `False` | If `True`, `/readyz` returns 503 when all models are mock. |

## Overriding in tests

`Settings` is constructed via `get_settings()` which is `lru_cache`-d. To
override settings in tests, clear the cache or use `app.dependency_overrides`
where the app injects `get_settings`.

```python
from app.core.config import get_settings
get_settings.cache_clear()
```

## Production checklist

- [ ] Set `ENVIRONMENT=production` (or `prod`).
- [ ] Keep `MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE=true` (B-23 refuses otherwise).
- [ ] Set `CORS_ORIGINS` to the exact frontend origin(s).
- [ ] Set `LOG_FORMAT=json`.
- [ ] Set `READYZ_FAIL_ON_MOCK_MODELS=True` once real models are required.
- [ ] Ensure `UPLOAD_DIR` is on a persistent volume.
- [ ] Reverse-proxy terminates TLS and sets `X-Forwarded-*`.
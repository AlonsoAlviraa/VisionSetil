# Security checklist — VisionSetil S4

Educational product API. Safety of *people* (mycology) is R1; this doc is *cyber* hardening.

## Controls shipped

| Control | Status | Notes |
|---------|--------|--------|
| API keys optional | ✅ | `API_KEYS` env; open mode when empty |
| Org scoping | ✅ | `key:org` |
| Scopes | ✅ | `key:org:classify+review` / `admin` |
| Rate limit general | ✅ | `RATE_LIMIT_REQUESTS` (default 60/min) |
| Rate limit classify | ✅ | `RATE_LIMIT_CLASSIFY_REQUESTS` (default 20/min) |
| Rate limit preflight exempt | ✅ | B-17: `/readyz`, `/models/quality-gate` (+ health/docs/media/species) — Identify polls mount + **60s** |
| Upload magic bytes | ✅ | jpg/png/webp |
| Upload size | ✅ | `MAX_IMAGE_MB` |
| Upload dimensions | ✅ | `MAX_IMAGE_DIMENSION` (default 4096) |
| Upload count | ✅ | `MAX_IMAGES_PER_REQUEST` (default 10) |
| Path traversal | ✅ | filename + resolve under upload dir |
| Security headers | ✅ | HSTS, CSP, XFO, nosniff, Permissions-Policy |
| CORS | ✅ | no `*` + credentials |
| Gitleaks CI | ✅ | secrets scan |
| Bandit CI | ✅ | Python SAST |
| pip-audit / npm audit | ✅ | logged in CI (non-blocking until lock strict) |
| FE safety-copy test | ✅ | forbids consumption-permission phrases in UI code |

## Scope matrix

| Path | Scope |
|------|--------|
| `/classify`, `/jobs`, `/observations`, `/feedback` | `classify` |
| `/human-reviews` | `review` |
| `/metrics`, `/models` | `admin` |
| `/health`, `/auth/*`, `/community/posts` | public |

`admin` implies all scopes.

## Env quick ref

```bash
API_KEYS=vs_prod:acme:classify+review,vs_ops:acme:admin
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_CLASSIFY_REQUESTS=20
RATE_LIMIT_WINDOW_SECONDS=60
MAX_IMAGE_MB=10
MAX_IMAGE_DIMENSION=4096
MAX_IMAGES_PER_REQUEST=10
CORS_ORIGINS=https://app.example.com
```

## Identify preflight rate limits (B-17)

| Path | Policy | Why |
|------|--------|-----|
| `GET /readyz` | **Exempt** | Readiness + nested `quality_gate`; k8s/Docker + Identify |
| `GET /models/quality-gate` | **Exempt** | Dual-signal gate; cached metrics, no GPU |
| `GET /health` | **Exempt** | Liveness |
| `POST /classify*` | **Strict** (20/min default) | Inference abuse surface |

**Client contract:** Identify preflight polls on **page mount + every 60 seconds**
(`PREFLIGHT_POLL_MS = 60_000`). Do not poll faster. With ~5 open tabs that is
~10 status GETs/min when both endpoints are hit — still cheap, but without
exemption those share the general 60/min bucket with catalog/API traffic and
can 429. Prefer full exemption; if a deploy must cap them, use a dedicated
bucket **≥120 req/min/IP**, never the classify bucket.

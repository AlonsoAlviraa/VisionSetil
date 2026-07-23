# Audit Security + Performance + Quality — 2026-07-23

Loop-engineering: triple audit (security / speed / bad practices) + remediation PR.

## Scope

Full stack: `backend/app`, `frontend/src`, `docker-compose.prod.yml`, PWA/Vite, auth, classify, media.

## Critical findings (pre-fix)

| ID | Area | Issue |
|----|------|--------|
| S1 | API keys | Scopes documented/tested but **not enforced** in middleware |
| S2 | API keys | 3-part `key:org:scopes` mis-parsed via `rsplit` |
| S3 | Prod | Boot with empty `API_KEYS` allowed in production |
| S4 | Jobs | `org_id == "default"` bypasses multi-tenant job isolation |
| S5 | Deploy | `docker-compose.prod.yml` weak defaults (changeme, CORS `*`, mocks) |
| P1 | FE Home | Heavy photo JSON / spin frames on critical path |
| P2 | BE classify | Sync torch blocks async event loop |
| P3 | PWA | Precache `json`+`webp` bloats install |
| Q1 | E2E | Missing `encyclopedia-count` / `home-species-count` testids |
| Q2 | CSS | `--safe` food-green residual |
| Q3 | FE | No ErrorBoundary |

## Fix batch (shipped 2026-07-23)

1. ✅ Wire scope enforcement + `parse_api_key_entry` in `APIKeyMiddleware`
2. ✅ Refuse production boot without `API_KEYS` + refuse mock fallbacks + CORS `*`
3. ✅ Strict job org equality; trust XFF only when `TRUST_PROXY=1`
4. ✅ Harden `docker-compose.prod.yml` (required secrets, no host DB ports, redis password)
5. ✅ SQLite WAL + busy_timeout; classify via `asyncio.to_thread`
6. ✅ Auth login/register stricter rate-limit bucket (`auth`, 10/min default)
7. ✅ PWA shell-only precache; Vite vendor chunks; drop unused framer-motion
8. ✅ Home: no full-catalog hydrate for counter; spin frames capped; IntersectionObserver; same-origin spin
9. ✅ ErrorBoundary; testids; retokenize `--safe`; preflight single-fetch + visibility; classify gen guard; auth boot resilience
10. ✅ Community upload dimension validation; max images from settings
11. ✅ **Async worker** was ignoring `view_types`/`locale` — now forwards (honesty bug)
12. ✅ `strip_exif` restored for upload privacy helper
13. ✅ Hide OpenAPI in production

## Verification

- Backend: pytest green except optional `test_multiview_v8_load` (needs `timm` + weights on disk)
- Frontend: vitest green for preflight / identify safety / catalog split / offline / spin; broader catalog tests still fail when suite runs without catalog hydration setup (pre-existing)

## Explicitly deferred (need product decision / larger design)

- Full remove of public `/uploads` StaticFiles (breaks community image URLs — needs signed URLs)
- HttpOnly cookie sessions + token hashing migration
- Full observations IDOR + human-review role model (requires product auth roles)
- Virtualized encyclopedia grid
- Slim catalog artifact rebuild (build pipeline)
- ML quality gate metrics (training, not app bug)

## Safety policy

No change to Identify food chrome policy (D16). Gate remains fail-closed.

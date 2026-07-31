# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering  
**Updated:** 2026-07-31  
**Goal:** Product UX reliability · never product_unlock

## Active graph version

`v1.65.1-verify-7commits`

## HEAD

`main` @ **91d0e1d** (= origin/main) — range `a2c6a93..91d0e1d` includes the 7 thematic commits + later photo/layout fixes.

## Tasks

| Item | Status |
|------|--------|
| 7 thematic commits on main (push) | **VERIFIED present** |
| Backend AuthZ / request_id / StaticPool | **VERIFIED** + tests expanded |
| Lookalike bidirectionality + join v20 | **VERIFIED** (0 asymmetric; 40/40 model) |
| FE dual-build + Stitch + density | **VERIFIED in tree** |
| FE gates vitest 608 + tsc | **PASS** |
| Kill app/web/API background servers | **DONE** (prior) |
| Live mycology-perf-uplift workflow | **DONE** (report in docs/audits) |
| T1–T4, T6, T7 media/games/lookalike | **SHIPPED** (in b8ee548+) |
| T5 encyclopedia virtualization | **DEFERRED** |

### Verification matrix (7 commits)

| Commit | Claim | Result |
|--------|-------|--------|
| `45c1015` AuthZ + request_id + SQLite | admin patterns on `/observations/{id}/classify(-advanced)`; StaticPool; bind_request_id | **PASS** (new scope tests 8/8) |
| `af44e83` lookalike bi + join v20 | 0 asymmetric edges; rubellus↔edulis/imleria; kernel_output_v20 40/40 | **PASS** |
| `f012543` Identify + Stitch + footer | Identify orientation sticky; footer compact; campo tokens | **PASS** (present) |
| `fe4d0fa` a11y/i18n/bundle | FeaturedSpeciesGrid; CA/EU locales; main-app/web | **PASS** |
| `b8ee548` dual-build + density | `build:app`/`build:web`, MEDIA_SURFACE_POLICY, GamesHub | **PASS**; vitest **608/608** |
| `e487021` gitignore dist | `frontend/dist-app/`, `dist-web/` ignored | **PASS** |
| `91d0e1d` graph canon v1.13 | STATE/BACKLOG/graph_evolution + audits | **PASS** |

### Gates run this session

- FE: `vitest run` → **608 passed**; `tsc --noEmit` → **0 errors**  
- BE: security_scopes + authz + lookalike_normalize + species_index_join + security + quality_gate → **all green**  
- New tests: AuthZ classify-advanced middleware; catalog bidirectional edges; join report v20 coverage  

### product_unlock

**false**

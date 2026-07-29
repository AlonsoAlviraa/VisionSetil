# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering (residual mega-audit fix)  
**Updated:** 2026-07-29  
**Goal:** Close residual FE/BE audit findings · never product_unlock · never forage

## Active graph version

`v1.13.0-residual-audit-fix`

## Current status

| Area | Status | Notes |
|------|--------|--------|
| Dual build App / Web | **SHIPPED** | 5173/5174 · dist-app/web |
| Campo nocturno + Home visual | **SHIPPED** | v1.12 |
| Full-bleed layout (no phone gutters) | **SHIPPED** | a74805c |
| Real photos / Wiki thumb sizes | **SHIPPED** | local-first + 250/500/1280px |
| Map cotos + expand | **SHIPPED** | extraCotosZones + Ampliar mapa |
| CA/EU locale parity keys | **SHIPPED** | 0 missing vs ES (auto-fill + maps) |
| Segmented ErrorBoundary | **SHIPPED** | per-route `withRouteBoundary` |
| aria-label i18n (product) | **SHIPPED** | a11y.* keys |
| Mojibake UTF-8 | **SHIPPED** | ModelInsights + MultiViewWizard |
| speciesPhotos code-split | **SHIPPED** | `hydrateSpeciesPhotos()` |
| DocumentTitle all routes | **SHIPPED** | 20+ paths |
| Rate limiter lock | **SHIPPED** | threading.Lock |
| SQLite busy_timeout align | **SHIPPED** | 30s / 30000ms |
| Alembic baseline | **SHIPPED** | alembic/ + 20260729_0001 |
| Canonical API errors | **SHIPPED** | app/core/errors.py handlers |
| product_unlock | **BLOCKED** | false |

## Residual next

1. Native review CA/EU copy quality (keys filled, language not perfect)  
2. Operator deploy O1–O7  
3. Optional: ML/admin aria remaining EN/ES  
4. P3 weak local media re-harvest  
5. `alembic stamp head` on prod DBs once  

## product_unlock

Always **false**.

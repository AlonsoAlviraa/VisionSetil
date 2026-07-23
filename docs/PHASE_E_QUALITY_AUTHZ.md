# Phase E — Quality, AuthZ, Media & Product depth

| Campo | Valor |
| --- | --- |
| **Estado** | In progress / closeout in tree |
| **Rama** | `merge/best-of-both` |
| **Precedente** | Phases A–D + audit security/perf 2026-07-23 |

## Ship checklist

| ID | Entrega | Estado |
|----|---------|--------|
| E-00 | Audit remediations | ✅ in tree |
| E-01 | Vitest setupFiles + exclude e2e | ✅ |
| E-02 | ResultCard resolveJoinRisk B-42 | ✅ |
| E-03 | CI merge/best-of-both + FE tests + e2e smoke | ✅ |
| E-04 | Observations org-scoped | ✅ |
| E-05 | Human-review reviewer role | ✅ |
| E-06 | Authenticated /uploads | ✅ |
| E-07 | Session token hash + 7d TTL | ✅ |
| E-08 | HttpOnly cookies | deferred (opt-in later) |
| E-09 | Encyc page size 12 + debounce | ✅ |
| E-10 | Catalog v2-only load (no dual JSON) | ✅ |
| E-11 | Media P0 crawl | residual (scripts exist; manual ops) |
| E-12 | Media badges | already in SpeciesImage / Phase C |
| E-13 | industrial-progress on /models | ✅ endpoint exists |
| E-14 | skip multiview_v8 without timm | ✅ |
| E-15 | Industrial gate docs | this doc + AUDIT |
| E-16 | Community empty polish | ✅ |
| E-17 | Offline pack progress | already D-14 |
| E-18 | ROADMAP/MEMORY | ✅ |

## Verify

```text
cd backend && pytest -q --ignore=app/tests/test_multiview_v8_load.py
cd frontend && npx vitest run && npx tsc --noEmit
```

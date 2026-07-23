# VisionSetil Web — Product Bar v1.0

DoD del mega polish web (M1–M6).

## Arranque local

```powershell
cd C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL
pwsh -File scripts\run_dev.ps1
```

| Servicio | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |

- **Enciclopedia + fotos**: funcionan con frontend solo (`/media` estático).
- **Identificar**: necesita backend en `:8000`.

## Media

```powershell
python scripts/audit_media.py
python scripts/precompute_species_images.py
python scripts/precompute_species_images.py --fetch --limit 150 --max-mb 250
```

## Checks

```powershell
python scripts/audit_media.py
cd backend; python -m pytest app/tests/test_media_and_catalog.py -q
cd ..\frontend
npx tsc --noEmit
npx vitest run
npx playwright test
```

## KPI product bar

| KPI | Target |
| --- | --- |
| Catálogo UI | ≥520 |
| Cards con imagen | 100% |
| Fotos `ok_real` (KPI SSOT) | baseline post-C-01 → soft ≥120; stretch ≥200 license-honest |
| Priority non-stub (gate) | 100% interim: `ok_real` \|\| `ok_procedural` \|\| `legacy_unverified` with card ≥ 8 KB |
| Thumb floor | thumb ≥ 1500 B (or sibling card served); rebuild: `--fix-thumbs` / `--force-stubs` |
| Fotos reales (legacy meta) | deprecated — was ≥133; do not mix with `ok_real` |
| i18n ES/CA/EU/EN chrome | sí |
| Safety D16 | sí |
| E2E smoke | 4+ verdes |

### Media quality SSOT (Phase C)

- **`ok_real`**: decode OK ∧ `card_bytes ≥ 20480` ∧ source real (not procedural) ∧ **license ∈ allowlist** (Commons/GBIF; not `wikipedia-page-image`). Separate license-strict product KPI — **not** the same as priority non-stub.
- **`ok_procedural`**: branded procedural ≥ 8192 B (interim; not “foto real”).
- **`legacy_unverified`**: photo-like / meta ok but license not allowlisted (e.g. `wikipedia-page-image`).
- **Priority non-stub (CI `--fail-priority`, interim)**: card status ∈ {`ok_real`, `ok_procedural`} **or** `legacy_unverified` with `card_bytes ≥ 8192`. Rationale: do not destroy real photos while license re-verify lands; still fails pure stubs/missing/corrupt.
- **Thumbs**: serve floor 1500 B; tiny thumb with good card → sibling card body (`X-Media-Quality: sibling_fallback`) until `--fix-thumbs` rebuilds.
- Audit: `python scripts/audit_media.py --json` · priority: `--priority --fail-priority`.
- Priority set: `media/manifests/priority_slugs_v1.json` (season ∪ T0 ∪ deadly ∪ featured; catalog slugs only).

## Versión UI

`v1.0.0-web` (footer).

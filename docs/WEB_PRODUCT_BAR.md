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
| Fotos reales | ≥133 (stretch 150+) |
| i18n ES/CA/EU/EN chrome | sí |
| Safety D16 | sí |
| E2E smoke | 4+ verdes |

## Versión UI

`v1.0.0-web` (footer).

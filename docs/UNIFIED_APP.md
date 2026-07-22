# VisionSetil unificada — best of both

## Origen

| Línea | Contenido |
| --- | --- |
| **Compañero** (`origin/main`) | Auth, comunidad, quiz, lookalike studio, ML dashboard, atelier UI, quality gate, multiview v8, pesos LFS |
| **Local** (`wip/local-media-i18n-catalog`) | Catálogo v2 520 spp, media WebP + fetch, i18n ES/CA/EU/EN, SpeciesImage, Playwright |

## Branch de merge

`merge/best-of-both` (basada en `origin/main` + merge del WIP local).

## Arranque

```powershell
git lfs pull   # pesos modelo
pwsh -File scripts\run_dev.ps1
# o:
#   cd backend; python -m uvicorn app.main:app --reload --port 8000
#   cd frontend; npm install; npm run dev
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:8000/docs  
- Fotos: `/media/...` (Vite estático; no requiere API)  
- Identify / ML / auth: requieren backend  

## Regenerar media / catálogo

```powershell
python scripts/build_species_catalog.py
python scripts/precompute_species_images.py
python scripts/precompute_species_images.py --fetch --limit 150 --max-mb 250
python scripts/audit_media.py
```

## Política de fusión (recordatorio)

- **UI producto** del compañero (atelier, rutas nuevas)
- **Media + catálogo v2 + i18n** de local
- **ML industrial** del compañero (quality gate, v8, LFS)
- Safety D16: identify sin “safe to eat”

# Hosting + deploy + install (VisionSetil closed beta)

**Decision date:** 2026-07-28 · **Graph:** `v1.5.7-hosting-deploy-beta` (still valid)  
**Executable checklist:** **`docs/OPERATOR_BETA_CHECKLIST.md`** (O1–O4) · canon residual in `.grok/graph-engineering/STATE.md`  
**Audience:** operator (you), before inviting 20–40 people  
**Policy forever:** orientation only · **never** consumption / “safe to eat” · `product_unlock` is independent and stays **false** until an explicit operator unlock cycle

This doc **decides** the beta stack. One default recipe with copy-paste steps.

---

## Decision (read this first)

| Choice | Verdict |
|--------|---------|
| **Default for closed beta** | **Path A — VPS + Caddy** (one HTTPS origin: SPA + `/api` + `/media`, PWA install) |
| **Heavier / already on compose** | **Path B — `docker-compose.prod.yml`** behind the same Caddy edge |
| **App Store / Play Store / APK download marketing** | **Non-goal for 30 days** |
| **Edible / “safe to eat” claims in hosting copy** | **Forbidden** |

**Why Path A (Caddy colocated):** testers open **one** HTTPS link; deep routes (`/identificar`) work via SPA `try_files`; same-origin `/api` avoids CORS pain; `/media` is simple; PWA install works without stores. Residual ops = real domain + secrets, not vendor shopping.

---

## Path A (default) — VPS + Caddy (full recipe)

### Architecture

```
  Tester phone / laptop
         │  HTTPS
         ▼
  ┌─────────────────────────────────────┐
  │  Caddy (deploy/Caddyfile)           │
  │  · /          → frontend/dist-app (SPA) │
  │  · /api/*     → FastAPI :8000       │
  │  · /media/*   → ./media             │
  │  · TLS auto   → Let's Encrypt       │
  └─────────────────────────────────────┘
         │                │
         ▼                ▼
   FastAPI backend    media/ webp
```

Shipped artifacts:

| File | Role |
|------|------|
| `deploy/Caddyfile` | SPA `try_files` + `/api` + `/media` reverse proxy |
| `frontend/public/_redirects` | SPA fallback if you later use Netlify/Pages (static only) |
| `frontend/vercel.json` | SPA rewrite for Vercel static (static only) |
| `frontend/vite.config.ts` | PWA + `navigateFallback: index.html` |

### Full steps (copy-paste)

1. **VPS** with Docker or Python for backend + Caddy binary (or `caddy` package). Point DNS `A`/`AAAA` of `beta.YOURDOMAIN` at the VPS.

2. **Backend** (example local process; compose also fine):

```bash
# secrets required in production
export ENVIRONMENT=production
export ALLOW_MOCK_FALLBACKS=false
export MODEL_FALLBACK_TO_MOCK=false
export API_KEYS=vs_yourkey:default:admin
# Same-origin via Caddy → CORS can list the public origin explicitly
export CORS_ORIGINS=https://beta.YOURDOMAIN

# start FastAPI on 127.0.0.1:8000 (uvicorn / docker-compose.yml backend)
```

3. **Frontend build** (bake public URL + form before build):

```bash
cd frontend
# production env for this build (app shell + PWA → dist-app/index.html)
export VITE_API_URL=/api
export VITE_PUBLIC_APP_URL=https://beta.YOURDOMAIN
export VITE_BETA_FEEDBACK_URL=https://forms.gle/YOUR_FORM_ID
npm ci
npm run build:app
cd ..
```

`VITE_PUBLIC_APP_URL` must be **https** (http only allowed for `localhost` / `127.0.0.1` in code).

Optional marketing shell: `npm run build:web` → `frontend/dist-web/index.html` (no service worker).

4. **Caddy** from monorepo root:

```bash
export BETA_DOMAIN=beta.YOURDOMAIN
export BACKEND_UPSTREAM=127.0.0.1:8000
export FRONTEND_DIST=./frontend/dist-app
export MEDIA_ROOT=./media
caddy run --config deploy/Caddyfile
```

`deploy/Caddyfile` already defaults `FRONTEND_DIST` to `./frontend/dist-app` (standard SPA `index.html` + PWA).

5. **Smoke**

- `https://beta.YOURDOMAIN/readyz` is **not** on Caddy by default — use `https://beta.YOURDOMAIN/api/readyz` (or your health path under the API strip).
- Open `https://beta.YOURDOMAIN/` on phone → Home beta + install strip.
- Hard refresh `https://beta.YOURDOMAIN/identificar` → SPA (not 404).
- Identify once (orientation only).
- Local structural: `powershell -File scripts/smoke_beta_preview.ps1`

6. **Invite** with `VITE_PUBLIC_APP_URL` baked, or pass explicit `appUrl` into `betaInviteMessageEs({ appUrl, formUrl })`. Home warns when public URL env is not configured.

### Domain placeholder

```
https://beta.YOURDOMAIN.example
```

Set the same value in `VITE_PUBLIC_APP_URL`.

---

## Advanced — static FE host (optional)

Only if you **already** know Cloudflare Pages / Netlify / Vercel and accept **split API**:

- Build FE with `VITE_API_URL=https://api.YOURDOMAIN` (full URL).
- SPA fallbacks ship as `frontend/public/_redirects` and `frontend/vercel.json` (copied into `dist` for Pages/Netlify via `public/`).
- Backend on Railway/Fly/Render/VPS; set `CORS_ORIGINS=https://your-static-host`.
- Media: API host or CDN — **not** same-origin `/api` on bare Pages without extra functions.
- Prefer Path A Caddy when you control a VPS; do not block invites waiting for multi-CDN polish.

---

## Path B (heavier) — docker-compose.prod

Use when you want Postgres + Redis from day one on the VPS:

```bash
export POSTGRES_PASSWORD=...
export REDIS_PASSWORD=...
export API_KEYS=vs_...:default:admin
export CORS_ORIGINS=https://beta.YOURDOMAIN

docker compose -f docker-compose.prod.yml up -d --build
```

Still put **Caddy** (`deploy/Caddyfile`) on 443 in front of static **`frontend/dist-app`** + `BACKEND_UPSTREAM` to the compose-published API port.  
Full notes: `docker-compose.prod.yml` header + `docs/deployment_notes.md`.

**Still not:** native stores, APK “download our app” landing, edible claims.

---

## Non-goals (next 30 days)

- Full **App Store / Play Store** native packages or review
- Marketing a **download APK** / sideload path
- Claiming the model is **safe-to-eat / seguro para comer / permiso de recolección**
- Flipping `product_unlock` from metrics alone (see `docs/OPERATOR_UNLOCK_RUNBOOK.md`)
- Waiting for perfect custom domain before first invites (temporary HTTPS hostname is OK)

---

## Env vars (frontend + backend)

### Frontend (`frontend/.env.local` or host dashboard → rebuild)

| Variable | Required for beta? | Example | Notes |
|----------|--------------------|---------|--------|
| `VITE_API_URL` | **Yes** | `/api` | Same origin under Path A Caddy |
| `VITE_PUBLIC_APP_URL` | **Yes before invites** | `https://beta.YOURDOMAIN` | **https only** (http localhost allowed for local) |
| `VITE_BETA_FEEDBACK_URL` | **Yes before cohort** | `https://forms.gle/…` | Else mailto fallback |
| `VITE_API_KEY` | Only if backend requires keys for browser | `vs_…` | Prefer session/auth for humans |

### Backend (`.env` / compose)

| Variable | Required for beta? | Example | Notes |
|----------|--------------------|---------|--------|
| `ENVIRONMENT` | Yes | `production` or `staging` | B-23 gates mock disable |
| `CORS_ORIGINS` | Recommended | `https://beta.YOURDOMAIN` | Never `*` in prod |
| `API_KEYS` | Yes in production | `vs_key:default:admin` | See configuration docs |
| `ALLOW_MOCK_FALLBACKS` | Yes in prod | `false` | Settings refuse true in production |
| `MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE` | Keep true | `true` | Fail-closed quality |
| `FEEDBACK_LOG_PATH` | Recommended | `data/feedback/classification_log.jsonl` | S9 live reject |

Root template: `.env.example` · FE template: `frontend/.env.example`.

---

## CORS / API URL rules

| Setup | `VITE_API_URL` | `CORS_ORIGINS` |
|-------|----------------|----------------|
| **Path A Caddy** (default) | `/api` | Public origin (or same-origin only) |
| Advanced split FE/API | Full `https://api…` | Explicit FE origin(s) |
| Local dev | `/api` (Vite proxy) | `http://localhost:5173` |

Never ship `CORS_ORIGINS=*`.

---

## Media

- Repo `media/` (webp card/thumb/detail).
- **Path A:** Caddy `handle_path /media/*` → `MEDIA_ROOT`.
- **Dev:** Vite plugin serves `/media/*`.
- Do not promise offline Identify; PWA shell + offline **study pack** only.

---

## HTTPS + PWA install

- **HTTPS is mandatory** for installable PWA (except `localhost`).
- Code rejects non-https production values in `VITE_PUBLIC_APP_URL` (`normalizePublicAppUrl`).
- PWA: `vite-plugin-pwa` + `navigateFallback: 'index.html'` (denylist `/api`, `/media`).
- In-app: `PwaInstallHint` + Home **“Abrir en el móvil / Instalar app”** + ops warning if public URL env missing.

### How testers open / install

**iPhone / iPad (Safari):** Compartir → **Añadir a pantalla de inicio**.  
**Android (Chrome):** menú ⋮ → **Instalar app** / **Añadir a pantalla de inicio**.  
**Desktop:** optional Chrome install.

---

## Feedback form

1. Create form (`docs/GTM_BETA_COHORT.md` §1). Header: *Solo orientación — nunca permiso de consumo.*  
2. Set `VITE_BETA_FEEDBACK_URL` and rebuild.  
3. Invites: `betaInviteMessageEs()` uses `VITE_PUBLIC_APP_URL` when baked; or pass `appUrl` explicitly.

---

## One-page checklist (deploy → invite)

### 0. Hosting decision

- [x] Path A default = **VPS + Caddy** (`deploy/Caddyfile`)
- [ ] DNS + `BETA_DOMAIN` ready

### 1. Deploy

- [ ] Backend on `:8000` · `GET` health via `/api/…`
- [ ] `cd frontend && npm ci && npm run build:app` with env baked → `dist-app/index.html`
- [ ] `FRONTEND_DIST=./frontend/dist-app` (Caddy default) · `caddy run --config deploy/Caddyfile`
- [ ] Hard refresh `/identificar` → SPA (not 404)
- [ ] `/media` or image cascade works for ≥1 species card

### 2. Env

- [ ] `VITE_PUBLIC_APP_URL=https://…` (invite link; **https**)
- [ ] `VITE_API_URL=/api`
- [ ] `VITE_BETA_FEEDBACK_URL=https://forms…` (or accept mailto only for tiny pilot)
- [ ] Rebuild FE after env change
- [ ] Home does **not** show “URL pública no configurada”

### 3. Smoke Identify

- [ ] Phone opens public HTTPS URL
- [ ] Home beta strip + install guidance
- [ ] **Probar Identificar** → ID or honest abstain — **orientation only**
- [ ] One encyclopedia sheet
- [ ] Feedback CTA opens form when configured
- [ ] Optional: install PWA

### 4. Invite

- [ ] `betaInviteMessageEs({ appUrl, formUrl })` or paste from `GTM_BETA_COHORT.md` (includes install line)
- [ ] No “safe to eat” / “seguro para comer”
- [ ] 20–40 cohort
- [ ] `product_unlock` remains operator-gated — beta does **not** require unlock

### Local structural smoke

```powershell
# From repo root (Windows)
powershell -File scripts/smoke_beta_preview.ps1
```

---

## Code pointers

| Concern | Location |
|---------|----------|
| Caddy Path A | `deploy/Caddyfile` |
| SPA static fallbacks | `frontend/public/_redirects`, `frontend/vercel.json` |
| PWA + navigateFallback | `frontend/vite.config.ts` |
| Install banner | `frontend/src/components/PwaInstallHint.tsx` |
| Home beta + install + URL ops | `frontend/src/pages/HomePage.tsx` |
| Public app URL | `frontend/src/lib/hostingPublicUrl.ts` |
| Invite + feedback | `frontend/src/lib/betaFeedback.ts` |
| Prod compose | `docker-compose.prod.yml` |
| GTM cohort | `docs/GTM_BETA_COHORT.md` |
| Unlock (separate) | `docs/OPERATOR_UNLOCK_RUNBOOK.md` |

---

## Residual after this doc ships

1. Operator runs Path A steps with real `BETA_DOMAIN` + env  
2. Smoke Identify on the public HTTPS URL  
3. Send invites (`GTM_BETA_COHORT`)  
4. Grow S9 under real traffic · unlock only via runbook if ever desired  

**product_unlock stays false** until explicit human operator cycle — never from hosting alone.

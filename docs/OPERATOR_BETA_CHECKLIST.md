# Operator beta checklist (real)

**Audience:** human operator before inviting the closed cohort.  
**Graph residual:** O1–O4 · **Policy:** orientation only · **product_unlock stays false** (unlock is a separate runbook).  
**Do not** send mass invites until steps 1–4 are green.

Companions:

| Doc | Use |
|-----|-----|
| `docs/HOSTING_DEPLOY_BETA.md` | Path A (Caddy) / Path B (compose) full recipe |
| `docs/GTM_BETA_COHORT.md` | Segments, invite copy, form fields |
| `docs/GTM_GOOGLE_FORM_SETUP.md` | Form setup detail |
| `docs/GTM_30_DAY_TRY_PLAN.md` | 30-day try narrative |
| `docs/OPERATOR_UNLOCK_RUNBOOK.md` | **Not** required for beta try — only if you later change unlock posture |
| `scripts/smoke_beta_preview.ps1` | Structural smoke (no cloud credentials) |

---

## Status board (fill as you go)

| Step | Item | Owner | Status |
|------|------|-------|--------|
| 0 | Read policy: orientation only / never forage | Operator | ✅ (docs + copy) |
| 1 | Deploy preview HTTPS (Path A preferred) | Operator | ⏳ **blocked** — needs your domain/VPS |
| 2 | Env: `VITE_PUBLIC_APP_URL` + `VITE_API_URL` + backend prod guards | Operator | ⏳ set on deploy host |
| 3 | Env: `VITE_BETA_FEEDBACK_URL` (real form, not mailto) | Operator | ⏳ create form URL |
| 4 | Structural smoke + live Identify smoke | Operator | ✅ **local dry-run 2026-07-29** (see below) |
| 5 | Small cohort (5–10) dry run | Operator | ☐ after HTTPS URL |
| 6 | Expand to 20–40 if dry run OK | Operator | ☐ |
| — | product_unlock | System | **false** (do not flip for beta) |
| — | git release snapshot | Graph | ✅ pushed `main` (4 thematic commits → + honesty fix) |

### Local dry-run log (agent, 2026-07-29)

| Check | Result |
|-------|--------|
| `git push origin main` | **done** (`3dca692..88a538a` + follow-up honesty fix) |
| `scripts/smoke_beta_preview.ps1` | **PASS** |
| torch+timm in `.venv-ci` | installed (CPU) for real MultiView |
| pytest `test_e20_real_identify_smoke` + lookalike + S9 | **PASS** (19) |
| `GET /health` | 200 |
| `GET /models/status` | MultiView **real_multiview_v8** · E20 `best.pt` · open-set calibrated · `product_unlock=false` · `unlock_eligible_advisory=true` |
| `POST /classify` (eval fixture images) | 200 · `mode=real` · `decision=rejected` (open-set) · `safety_level=unsafe_to_consume` · quality_gate ACCEPTABLE MAP@3≈0.860 |
| Stale warning MAP@3~7.6% on real path | **fixed** in `multi_view_classifier._build_response` |
| Public HTTPS / form / cohort invites | **still operator** (no domain/form secrets in agent env) |

---

## Step 0 — Policy (2 min)

- [ ] Invites say **solo orientación** / never “segura para comer” / never harvest permission  
- [ ] Open-set “no lo sé” is described as a feature  
- [ ] Multi-foto without gills/front/detail is **not** sold as safer to eat  

---

## Step 1 — Deploy preview (Path A default)

Follow **`docs/HOSTING_DEPLOY_BETA.md`** Path A (VPS + Caddy):

- [ ] DNS `A`/`AAAA` → VPS for `beta.YOURDOMAIN`  
- [ ] Backend listening `127.0.0.1:8000` (or compose)  
- [ ] Caddy: `/` → `frontend/dist`, `/api/*` → FastAPI, `/media/*` → media tree  
- [ ] TLS works (HTTPS only for testers)  
- [ ] SPA deep links (`/identificar`) do not 404 on refresh  

**Backend prod-ish flags (minimum):**

```bash
ENVIRONMENT=production   # or staging with honest guards
ALLOW_MOCK_FALLBACKS=false
MODEL_FALLBACK_TO_MOCK=false
CORS_ORIGINS=https://beta.YOURDOMAIN
# API_KEYS=... as required by your deploy
```

Weights: E20 `best.pt` discoverable on server (local path / volume). Do **not** commit `*.pt` to git.

---

## Step 2 — Public app + API env (build-time FE)

Frontend **build** env (bake into Vite):

```bash
export VITE_API_URL=/api
export VITE_PUBLIC_APP_URL=https://beta.YOURDOMAIN
export VITE_BETA_FEEDBACK_URL=https://forms.gle/YOUR_FORM_ID   # step 3
cd frontend && npm ci && npm run build
```

- [ ] Home invite / install copy shows real public URL (not placeholder)  
- [ ] `betaInviteMessageEs` / footer use public URL  

Templates: root `.env.example`, `frontend/.env.example`.

---

## Step 3 — Feedback form (`VITE_BETA_FEEDBACK_URL`)

1. Create form (Google / Typeform) with fields from `GTM_BETA_COHORT.md`  
2. Header: *Solo orientación — nunca permiso de consumo*  
3. Set `VITE_BETA_FEEDBACK_URL` **before** rebuild  
4. Verify Home → feedback opens the form (`betaFeedbackConfig().formConfigured === true`)  

Without form: mailto fallback works for local only — **weak for real cohort**.

Optional detail: `docs/GTM_GOOGLE_FORM_SETUP.md`.

---

## Step 4 — Smoke (must pass before invites)

### 4a Structural (repo / machine with checkout)

```powershell
pwsh -File scripts/smoke_beta_preview.ps1
```

Expect exit 0 (docs + env templates + contracts).

### 4b Live on public URL (phone + laptop)

| Check | Pass criteria |
|-------|----------------|
| `/health` or `/api/health` | 200 |
| Home loads | no blank error |
| **Identify** 1 photo | returns orientation result or honest reject (not raw 500) |
| Identify 2–4 photos / wizard | soft coach works; result shows orientation sticky |
| Open-set path | low-quality / nonsense image can abstain without crash |
| Result language | no “safe to eat” / edible green light |
| Enciclopedia ficha | loads; lookalikes if SSOT present |
| PWA install path | iOS “Añadir a inicio” / Android install (manual OK) |
| Feedback CTA | opens form URL |
| ML dashboard `/ml` (if exposed) | `product_unlock` false; E20 metrics honest |

Optional local model smoke (dev machine with weights):

```bash
# from repo root, with venv
pytest backend/app/tests/test_e20_real_identify_smoke.py -q
```

(Sips if no `best.pt` — OK on CI; on beta host weights should exist.)

---

## Step 5 — Small cohort dry run (5–10 people)

Segments (subset of GTM kit):

| Segment | n |
|---------|--:|
| Amigos de campo | 3–5 |
| Aficionado serio / micólogo | 2–3 |
| “Solo móvil” tester | 1–2 |

- [ ] Send invite using `betaInviteMessageEs` with **real** APP_URL + FORM_URL  
- [ ] Ask ~10 min: Identify multi-foto + one encyclopedia open + feedback form  
- [ ] Collect: crashes, confusion, “thought I could eat it”, install friction  
- [ ] Confirm S9 / feedback JSONL receives events if logging enabled on host  

**Stop / fix** if: 500s on Identify, mock-only serve in production, forage wording, form broken, HTTP-only URL.

---

## Step 6 — Expand cohort (20–40)

Only after dry run:

- [ ] Target 20–40 invites (`GTM_BETA_COHORT.md` full segments)  
- [ ] KPI week 1: ≥15 opened app once  
- [ ] Watch S9 traffic_depth leave `empty`/`sparse`  
- [ ] Weekly skim feedback form  

---

## Explicit non-goals for this checklist

| Non-goal | Why |
|----------|-----|
| Flip `product_unlock=true` | Separate human runbook; beta works orientation-only |
| App Store / Play Store | 30d non-goal |
| E21 GPU launch | Optional scale; not required for try-first |
| Claiming deadly@1 = 100% | Honest E20 deadly@1 ~0.79; use dual keys + open-set |

---

## Sign-off

| Field | Value |
|-------|--------|
| Operator | ________________ |
| Public URL | https://________________ |
| Form URL | https://________________ |
| Smoke date | ____-__-__ |
| Dry-run n | __ |
| product_unlock | **false** |
| Notes | |

---

*Graph engineering residual O1–O4 · 2026-07-29 · never forage permission.*

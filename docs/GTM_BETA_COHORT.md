# GTM beta cohort kit (try-first)

**Goal:** invite 20–40 people to try VisionSetil for ~10 minutes and send feedback.  
**Policy:** orientation only · **never** consumption / forage permission · open-set abstain is a feature.

Companion: `docs/GTM_30_DAY_TRY_PLAN.md` · product CTAs: Home/footer `betaFeedbackHref()`.  
**Operator one-pager:** `docs/OPERATOR_BETA_CHECKLIST.md` (deploy → form → smoke Identify → small cohort).

---

## 0. Hosting + public URL (before invites)

**Do this first:** decide/deploy the preview URL so testers can open and optionally install the PWA.

- Decision + checklist: **`docs/HOSTING_DEPLOY_BETA.md`** (Path A default: single HTTPS preview + PWA)
- Set `VITE_PUBLIC_APP_URL=https://…` (used by `betaInviteMessageEs` / `publicAppUrlForInvite`)
- Set `VITE_API_URL` (same-origin `/api` recommended)
- Smoke: `pwsh -File scripts/smoke_beta_preview.ps1` then Identify on the real phone URL
- Install copy is on Home (“Abrir en el móvil / Instalar app”) + `PwaInstallHint`

Without a stable HTTPS URL, do **not** blast the cohort.

---

## 1. Configure feedback URL (operator, 2 min)

1. Create a Google Form / Typeform with fields:
   - Qué probaste (Identificar / Enciclopedia / Mapa / Juegos / Otro)
   - Qué falló o confudió
   - Dispositivo
   - ¿Multi-foto? (sí/no)
   - Nota libre  
   Header note: *Solo orientación — nunca permiso de consumo.*
2. Copy public form URL (`https://…`).
3. Frontend env (preview / `.env.local`):

```bash
# frontend/.env.local (or deploy env)
VITE_BETA_FEEDBACK_URL=https://forms.gle/YOUR_FORM_ID
```

4. Rebuild/restart Vite so `import.meta.env` picks it up.
5. Verify Home → “Enviar feedback” opens the form (not mailto).  
   Code: `betaFeedbackConfig().formConfigured === true`.

Without env, product still works with **mailto fallback** (`betaFeedback.ts`) — fine for local, weak for real cohort.

Root `.env.example` documents the variables; frontend template:

```bash
# frontend/.env.example
VITE_API_URL=/api
VITE_PUBLIC_APP_URL=https://beta.YOURDOMAIN.example
VITE_BETA_FEEDBACK_URL=https://forms.gle/YOUR_FORM_ID
```

---

## 2. Cohort segments (D3–4)

| Segment | n | Why |
|---------|--:|-----|
| Amigos de campo | 5–10 | multi-foto real |
| Micólogos / aficionados serios | 5 | seguridad + open-set |
| Cotos / asociaciones | 5 | mapa + enlaces oficiales |
| LinkedIn / comunidad | 5–10 | alcance try-first |

Total target: **20–40** invites · KPI week 1: **≥15** opened the app once.

---

## 3. Invite message (copy-paste)

Spanish (default):

```
Estamos abriendo beta privada de VisionSetil (ID de setas con honestidad de modelo + enciclopedia Iberia).
No es permiso de consumo — solo orientación de campo. Si puedes probar ~10 min y decirnos qué falla, te lo agradecemos.
Link: [APP_URL]
Feedback: [FORM_URL or footer Feedback beta]
En el móvil: abre el link → (iOS) Compartir → «Añadir a pantalla de inicio» · (Android Chrome) menú → Instalar app.
Pide: 1 Identify multi-foto + 1 ficha de enciclopedia (opcional Wordle/Setadle).
```

Prefer generating from code (stays in sync): `betaInviteMessageEs({ appUrl, formUrl })` in `frontend/src/lib/betaFeedback.ts`.  
If `VITE_PUBLIC_APP_URL` is not baked, **always pass `appUrl`** explicitly (placeholder is not for real invites).

**Forbidden in any channel:** “safe to eat”, “seguro para comer”, “permiso de recolección”, edible green lights.

---

## 4. Ask each tester

1. One **Identify** with multi-foto (láminas + perfil if possible)  
2. One **enciclopedia** sheet  
3. Optional: Wordle / Setadle / mapa cotos  
4. Submit feedback form  

Questions to capture (week 3 loop): open-set trust · multi-foto friction · offline Pro interest · recommend to a field friend.

---

## 5. Measure (not vanity)

| Signal | Where |
|--------|--------|
| Identify / reject rates | S9 `data/feedback/classification_log.jsonl` · `/models/status.live_reject_monitor` · ML dashboard |
| Feedback form responses | your form backend |
| Waitlist Pro | Home `WaitlistTemporada` |
| Bugs P0 | triage; never “fix” by marketing edible claims |

Regenerate S9 report: `python -m kaggle.ml_qa.live_reject_monitor`  
(writes summary; see `eval/reports/ml_experiments/s9_live_reject_latest.json` when using write helper).

---

## 6. Checklist before blast

- [ ] **Step 0:** `docs/HOSTING_DEPLOY_BETA.md` Path A/B deployed (HTTPS)  
- [ ] `VITE_PUBLIC_APP_URL` = the invite link  
- [ ] Preview URL stable + smoke Identify on phone  
- [ ] `VITE_BETA_FEEDBACK_URL` set **or** accept mailto for tiny pilot  
- [ ] Home CTA “Probar Identificar” + install strip  
- [ ] Orientation-only copy visible  
- [ ] Invite list 20–40  
- [ ] No “safe to eat” in message  

Unlock (`product_unlock`) is **independent** of GTM — see `docs/OPERATOR_UNLOCK_RUNBOOK.md`. Beta does **not** require unlock=true.

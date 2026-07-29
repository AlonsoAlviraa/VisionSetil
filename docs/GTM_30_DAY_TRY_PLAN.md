# VisionSetil — Plan 30 días para que la gente **pruebe** la app

**Objetivo del mes:** que personas reales **entren, usen y den feedback** — no venta masiva ni App Store full launch.  
**Guardrail permanente:** solo orientación de campo · **nunca** permiso de consumo · open-set / abstenerse es una feature.

| Semana | Enfoque | Meta de “prueba” |
|--------|---------|------------------|
| **Día 1–7** | Producto listo + cohorte cerrada | 15–30 beta testers con cuenta o uso anónimo |
| **Día 8–14** | Primeros usos de Identificar + Enciclopedia | ≥50 sesiones Identify o fichas abiertas |
| **Día 15–21** | Feedback y pulido de fricción | ≥10 feedbacks útiles (form / chat) |
| **Día 22–30** | Ampliar prueba + waitlist | 100+ visitas o 40 waitlist; 5 testimonios |

---

## Principios (no negociables)

1. **Try-first, sell-later.** La CTA principal del mes es “Probar Identificar” / “Explorar enciclopedia”, no “Comprar Pro”.
2. **Orientación only.** En toda comunicación: *no autoriza recolección ni consumo*; micólogo humano ante la duda.
3. **Canales con confianza.** Micólogos locales, grupos de montaña CyL/Aragón/Soria, amigos, LinkedIn — no spam de “setas comestibles mágicas”.
4. **Medir prueba, no vanity.** Sesiones, Identify intentados, fichas abiertas, waitlist — no likes sueltos.

---

## Día 1–7 — Semana 1: listos para que te prueben

### Día 0 · Hosting (antes de invitar)
- [x] Decisión de hosting + PWA: **`docs/HOSTING_DEPLOY_BETA.md`** (Path A = URL HTTPS única + instalar desde el navegador)
- [ ] (Operador) Desplegar Path A o B · fijar `VITE_PUBLIC_APP_URL` + `VITE_API_URL` · smoke Identify en el móvil
- [ ] Smoke local sin cloud: `pwsh -File scripts/smoke_beta_preview.ps1`

### Día 1–2 · Checklist producto beta
- [x] App local o URL de preview estable (`/identificar`, `/enciclopedia`, `/mapa`, `/wordle`)
- [x] Copy de home: CTA “Probar Identificar” + trust strip (open-set, sin permiso de consumo)
- [x] Enciclopedia 2D (sin estudio 3D) y fotos prioritarias arriba
- [x] Feedback entry (Home + footer): `betaFeedbackHref()` · `VITE_BETA_FEEDBACK_URL` opcional · mailto fallback · waitlist temporada
- [x] Kit cohorte: `docs/GTM_BETA_COHORT.md` · `betaInviteMessageEs()` · `.env.example` documenta `VITE_BETA_FEEDBACK_URL` + `VITE_PUBLIC_APP_URL`
- [x] Home strip “Abrir en el móvil / Instalar app” + `PwaInstallHint` (PWA, no App Store)
- [ ] (Operador) Pegar URL real del form en `frontend/.env.local` → `VITE_BETA_FEEDBACK_URL` y rebuild (2 min)
- [ ] (Operador) Pegar URL pública HTTPS → `VITE_PUBLIC_APP_URL` y rebuild

### Día 3–4 · Cohorte cerrada (lista de 20–40 nombres)
**Prerrequisito:** step 0 hosting hecho (`docs/HOSTING_DEPLOY_BETA.md`).  
Plantilla lista: `docs/GTM_BETA_COHORT.md` §3 · `frontend/src/lib/betaFeedback.ts` (`betaInviteMessageEs`).  
Invitar por WhatsApp / email personal:

| Segmento | Por qué |
|----------|---------|
| 5–10 amigos que salen al campo | uso real de fotos |
| 5 micólogos / aficionados serios | feedback de seguridad |
| 5 partners cotos / asociaciones | B2B “prueba el mapa” |
| 5–10 de LinkedIn / comunidad | alcance medio |

Mensaje tipo (ES) — keep in sync with `betaInviteMessageEs`:

> Estamos abriendo **beta privada de VisionSetil** (ID de setas con honestidad de modelo + enciclopedia Iberia).  
> **No es permiso de consumo** — solo orientación. Si puedes probar 10 min y decirnos qué falla, te lo agradecemos.  
> Link: [URL] · Feedback: [form]  
> En el móvil: (iOS) Compartir → «Añadir a pantalla de inicio» · (Android Chrome) menú → Instalar app.

### Día 5–7 · Primera oleada de prueba
- Pedir **1 Identify** con multi-foto + **1 ficha** de enciclopedia + **opcional Wordle/Setadle**
- Recoger: ¿fotos claras? ¿mapa útil? ¿copy de riesgo legible?
- KPI semana 1: **≥15 personas** han abierto la app al menos una vez

---

## Día 8–14 — Semana 2: uso real (Identify + Enciclopedia)

### Canales
- Post corto en LinkedIn / X (énfasis **try**, no “la mejor app de setas comestibles”)
- 1 hilo en foro/grupo micológico local (con permiso del admin)
- Demo 15 min por videollamada a 2–3 power users

### Acciones producto (si el feedback lo pide)
- Fricción multi-vista: copy más claro inferior+perfil
- Enciclopedia: confirmar que lo más buscado sale primero (ya en producto)
- Mapa cotos: enlaces oficiales visibles

### KPI semana 2
- **≥50** eventos Identify o visitas a ficha
- **≥5** comentarios cualitativos escritos
- 0 promesas de “seguro para comer” en ningún canal

---

## Día 15–21 — Semana 3: iterar y preparar “soft sell”

### Feedback loop
| Pregunta | Para qué |
|----------|----------|
| ¿Confiarías en el open-set / abstención? | confianza |
| ¿Qué te faltó en multi-foto? | UX Identify |
| ¿Usarías el pack offline en el coche? | Pro value |
| ¿Recomendarías a un amigo de campo? | NPS-ish |

### Soft sell (solo a quien ya probó)
- “Si te ha sido útil, entra en **waitlist Pro / temporada**” (offline pack, sin bloquear seguridad)
- **No** paywall de fichas de riesgo ni de educación

### KPI semana 3
- Waitlist **≥20**
- 3 mejoras de copy/UI mergeadas por feedback
- 2 partners de cotos contactados (email plantilla en `PARTNER_OUTREACH_EMAILS.md` si existe)

---

## Día 22–30 — Semana 4: ampliar prueba + narrativa de venta futura

### Ampliar (aún try-first)
- 1 post “lo que aprendimos en la beta” (honestidad ML, no magia)
- Invitar **segunda cohorte** (otras CCAA / grupos)
- Landing: CTA dual **Probar gratis** + **Lista de espera Pro**

### Preparar venta (no cerrar el mes en facturación)
- Definir precio Pro demo (mensual) solo para offline/extras
- Checklist legal básico: disclaimer visible, privacidad cookies, no claims médicos
- Lista de 10 cuentas a las que **no** se vende Identify como “food-safe”

### KPI semana 4 (cierre 30 días)
| Métrica | Objetivo |
|---------|----------|
| Personas que probaron la app | **≥40** |
| Waitlist / interés Pro | **≥40** |
| Testimonios usables (con permiso) | **≥5** |
| Bugs P0 abiertos de Identify | **0** |
| Mensajes públicos con “safe to eat” | **0** |

---

## Calendario resumen

| Días | Hito |
|------|------|
| **1–2** | Beta checklist + form feedback |
| **3–7** | Invitaciones cohorte 1 + primeras pruebas |
| **8–14** | Canales abiertos controlados + uso Identify/Enciclopedia |
| **15–21** | Iteración + waitlist Pro soft |
| **22–30** | Cohorte 2 + narrativa + prep venta sin bloquear try |

---

## Mensajes de seguridad (copiar/pegar)

**ES:** *VisionSetil orienta; no autoriza consumo ni recolección. Ante la duda, un micólogo de carne y hueso.*  
**EN:** *VisionSetil is orientation only — never consumption or forage permission. When unsure, ask a human mycologist.*

---

## Artefactos relacionados

- `docs/COMPETITIVE_APPS.md` — posicionamiento vs Picture Mushroom / Seek  
- `docs/PARTNER_OUTREACH_EMAILS.md` — si existe, reutilizar tono partners  
- Política producto: orientation_only · `product_unlock` fail-closed  

---

## Qué **no** hacer en estos 30 días

- Publicidad de “identifica y come”  
- Ocultar open-set o forzar unlock de Identify  
- App Store submission completa sin cohorte beta  
- Invertir en modelos 3D (producto = **fotos 2D de campo**)  

---

*Documento vivo — actualizar KPIs al final de cada semana.*

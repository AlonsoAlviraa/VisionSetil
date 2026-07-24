# Plan de mejoras — VisionSetil

| Campo | Valor |
| --- | --- |
| **Fecha** | 2026-07-24 |
| **Rama** | `merge/best-of-both` |
| **Estado producto** | FE vendible + media 520; Identify bloqueado por quality gate |
| **Norte** | Educación y juegos fuertes; identificación solo cuando el modelo sea seguro |

---

## 0. Principios

1. **Safety-first:** nunca “segura para comer”; abstención si el modelo no llega.
2. **Visual > texto:** portada y fichas con fotos; menos copy suelto.
3. **Datos antes que hype:** train dataset y mortales antes de desbloquear Identify.
4. **PRs pequeños** y medibles.

---

## 1. Ahora (1–2 semanas) — UX + estabilidad

| ID | Mejora | DoD |
|----|--------|-----|
| U1 | Mini-vídeo flashcards 1,5 s + pausa al clic | Hecho / verificar en home |
| U2 | Menú **Más** usable desktop + móvil | Hecho / smoke manual |
| U3 | Portada corta (poco texto, mucho visual) | Hecho / iterar feedback |
| U4 | Enciclopedia: multi-ángulo + premium first | Hecho |
| U5 | Atribución visible en ficha de especie | Foto + autor/licencia si hay meta |
| U6 | PWA install + offline pack de temporada P0 | Pack descargable sin romper safety |
| U7 | Tests vitest de media stack + surfaceRoutes en CI | Verde en PR |

---

## 2. Datos ML (2–6 semanas) — prioridad máxima

| ID | Mejora | DoD |
|----|--------|-----|
| D1 | Unificar catálogo FE/BE (520 SSOT) | Un JSON/API de taxones |
| D2 | Harvest Iberia (GBIF + iNat research, anti-leak) | `data/iberia_obs/` versionado |
| D3 | Pack mortales ≥300 imgs/obs por P0 deadly | Recall dataset documentado |
| D4 | Lookalike pairs curados (20 clásicos) | JSON + UI lookalikes alimentada |
| D5 | Seguir outreach (Picek, GBIF.ES, AEM, Soria…) | CRM en `PARTNER_OUTREACH_EMAILS.md` |
| D6 | Licencias: solo CC0/BY/BY-SA en train; NC solo display | Auditoría script |

**Éxito D:** train set con split observation-aware y ≥80–150 spp bien cubiertas.

---

## 3. Modelo (en paralelo al final de D)

| ID | Mejora | DoD |
|----|--------|-----|
| M1 | Fine-tune backbone (ConvNeXt/DINOv2) en P0 | Checkpoint + `metrics.json` |
| M2 | Multi-view fusion en train (4 slots) | Paridad con wizard Identify |
| M3 | Head mortales + hard negatives lookalike | Deadly recall ≥ 0.90 en hold-out |
| M4 | Open-set / incertidumbre real | Rechazo sin depender solo del gate de checkpoint malo |
| M5 | Desbloquear Identify en prod solo si gate verde | MAP@3 soft ≥ 0.25 + deadly ≥ 0.90 |

**Éxito M:** `/classify` puede devolver top-3 con honesty chrome; si no, rejected.

---

## 4. Producto (continuo)

| ID | Mejora | DoD |
|----|--------|-----|
| P1 | Setadle hábitat + clásico pulidos | Sin bugs de play diario |
| P2 | Lookalikes side-by-side más visual | 10 pares one-tap |
| P3 | Mapa fenológico (avisos educacionales) | Sin permiso de recolección |
| P4 | Human review queue usable | Roles + cola real |
| P5 | Comunidad sin consejos de consumo | Moderación / copy duro |

---

## 5. Orden recomendado (siguiente mes)

```text
Semana 1–2   U5–U7 + D1 catálogo SSOT + seguir partners
Semana 2–4   D2–D4 dataset Iberia + mortales
Semana 4–6   M1–M3 train loop
Semana 6–8   M4–M5 gate + Identify real (si métricas OK)
             P1–P3 en paralelo ligero
```

---

## 6. No hacer (por ahora)

- Prometer “IA que identifica al 99%”
- Desbloquear Identify con MAP@3 ~0.07
- Scrapear bases privadas sin acuerdo
- Más rediseños de portada sin feedback de uso

---

## 7. Métricas de producto

| KPI | Objetivo |
|-----|----------|
| Stubs media | 0 (mantenido) |
| Deadly recall (eval) | ≥ 0.90 |
| MAP@3 (eval) | ≥ 0.25 soft |
| Identify en prod | Solo gate verde |
| Partners con respuesta útil | ≥ 2 en 30 días |

---

## 8. Referencias internas

- `docs/QUALITY_GATE.md`
- `docs/PARTNER_OUTREACH_EMAILS.md`
- `docs/DATA_SOURCES_SPAIN_SORIA.md`
- `docs/ROADMAP.md`
- `scripts/fill_all_photos.py`

# VisionSetil — Visión del Producto

> **Documento fundacional.** Define QUÉ es VisionSetil, POR QUÉ existe, y QUÉ NO es.  
> **Canon vivo de estado:** `.grok/graph-engineering/STATE.md` (hoy `v1.9.9` → process sync).  
> **No usar MEMORY/ROADMAP antiguos como fuente de métricas ML** — ver STATE + `eval/reports/ml_experiments/`.

---

## 1. Declaración de Misión

**VisionSetil** es un sistema de **identificación orientativa de setas** desde fotografías, con filosofía *safety-first*. No reemplaza al micólogo experto: ofrece una **primera orientación** rigurosa, conservadora y educativa.

> **Una identificación incorrecta puede costar una vida.** Cada decisión de diseño se toma bajo este axioma.

---

## 2. El Problema

| Problema | Impacto |
|----------|---------|
| Las setas son difíciles de identificar visualmente, incluso para expertos | Confusión entre especies comestibles y mortales |
| Las apps existentes dan falsa confianza ("segura para comer") | Intoxicaciones graves, incluso fatales |
| La identificación requiere múltiples ángulos (laminillas, sombrero, pie, hábitat) | Una sola foto no es suficiente |
| Falta multi-vista + metadata + open-set rejection + honesty de métricas | Falsos positivos peligrosos y claims inflados |

---

## 3. La Solución: VisionSetil

### 3.1 Arquitectura Multi-Vista

Hasta **4 vistas** de la misma seta:

- **Laminillas** (gills)
- **Frontal** (front / perfil)
- **Hábitat** (habitat)
- **Detalle** (detail)

El modelo MultiView fusiona vistas (attention pooling) + metadata cuando aplica. Producto: wizard + free mode con *soft coach* (nunca bloqueo duro por defecto).

**Honesty:** más fotos ayudan en general (field holdout MAP@3 sube); en subconjunto **deadly** el multi-view puede ser flat — no implica permiso de consumo.

### 3.2 Safety Policy Inviolable

- **Nunca** lenguaje "segura para consumir" / forrajeo permitido
- Toda salida es `orientation_only` y `unsafe_to_consume`
- Especies mortales siempre con advertencia crítica
- `product_unlock` es **fail-closed** (false hasta decisión humana explícita; ver `docs/OPERATOR_UNLOCK_RUNBOOK.md`)
- Preferible rechazo / falso positivo de peligro a falso negativo mortal

### 3.3 Open-Set Rejection

El sistema **rechaza** cuando no está seguro (conf / margin / entropy calibrados sobre holdout E20). Un "no lo sé" es respuesta válida y segura.

### 3.4 Lookalikes + nomenclatura

- Grafo SSOT de confusiones educativas (catalog lookalikes + diagnostic critical_views)
- Index Fungorum (Kew): nombres / sinónimos / atribución — **no** sustituye risk chips ni el modelo

---

## 4. Métricas Norte (honestas)

| Métrica | Rol |
|---------|-----|
| **MAP@3** | North star identificación (protocolo FungiCLEF-style) |
| **safety_recall_deadly_at_3** (+ `_at_1`) | Dual deadly honesty (set industrial ∩ label2idx) |
| **Open-set reject + acc_keep** | Calibración live Identify |
| **ECE band** | Si high/unknown → no chrome de % de confianza engañoso |
| **S9 live reject** | Histograma de abstenciones bajo tráfico real |

Protocolo de referencia actual: **E20 source-holdout** (train packs no-GBIF / test GBIF ES puro).

### Snapshot E20 (lab, honest)

| Key | Value |
|-----|------:|
| test_map_at_3 | **~0.860** |
| safety_recall_deadly_at_1 | **~0.788** |
| safety_recall_deadly_at_3 | **~0.927** |
| n_deadly (test) | 2580 |
| ECE | **~0.188** (band high) |
| Soft gates MAP≥0.25 · deadly@3≥0.90 | **PASS** |
| product_unlock | **false** (policy + operator cycle) |

Aspiración de producto: maximizar MAP@3 y deadly recall **sin** inventar 100% no medido. Soft gates ≠ forage OK.

---

## 5. Audiencia

| Usuario | Necesidad | Cómo lo resuelve VisionSetil |
|---------|-----------|------------------------------|
| Senderista curioso | "¿Qué seta es esta?" | Identify multi-vista, advertencias, open-set |
| Micólogo aficionado | Confirmar hipótesis | Top-k + lookalikes + ficha + IF links |
| Beta tester / cohorte | Probar 10 min + feedback | GTM try-first + form + PWA install |
| Operador / research | Métricas y unlock honestos | ML dashboard, pro tester S1–S14, runbooks |

---

## 6. Límites del Producto

| No es | Sí es |
|-------|--------|
| Guía de consumo | Orientación taxonómica de campo |
| Reemplazo del experto | Primer filtro conservador |
| Precisión 100% | Sistema que admite incertidumbre |
| Producto médico | Herramienta educativa |
| Auto-unlock por métricas | Unlock solo por operador humano |

---

## 7. Estado actual (graph `v1.9.9` + process sync)

**Producto (beta-ready en código):**

- Backend FastAPI (classify, models/status, species, media, nomenclature IF, auth, community…)
- Frontend React 18 PWA (Identify, enciclopedia, lookalike studio, juegos, mapa, offline, ML dash)
- Safety + multiview honesty en superficies principales
- Catalog SSOT ~523 taxa; modelo serve **40** clases (ML-40 allowlist)
- GTM + hosting docs listos; **deploy / form URL / cohorte = residual operador**

**ML:**

- Pesos E20 MultiView v8 (`kernel_output_v20`) preferidos en discovery
- Quality gate ACCEPTABLE en métricas E20 (species_id_allowed a nivel métricas)
- Open-set calibrado; S9 schema listo para tráfico real
- E21: readiness only, **no lanzado**

**Graph Engineering:**

- Proceso autónomo documentado en `.grok/graph-engineering/`
- Fuente de verdad de versión/residual: `STATE.md` + `BACKLOG.md` + `graph_evolution.md`

---

## 8. Principios de Diseño

1. **Safety over accuracy** — Si hay conflicto, gana la seguridad  
2. **Conservative over confident** — Mejor rechazar que adivinar  
3. **Multi-view over single-view** — Más información = mejor decisión (con caveats deadly)  
4. **Transparent over opaque** — El usuario entiende certeza e incertidumbre  
5. **Educated over ignorant** — Contexto educativo y lookalikes  
6. **Reproducible over ad-hoc** — Config versionada + reports en `eval/`  
7. **Fail-closed unlock** — Nunca `product_unlock=true` automático  

---

## 9. Referencias clave

| Doc | Uso |
|-----|-----|
| `.grok/graph-engineering/STATE.md` | Versión activa + residual |
| `.grok/graph-engineering/PROCESS.md` | Cómo opera el graph engineering |
| `docs/ROADMAP.md` | Roadmap alineado a STATE |
| `MEMORY.md` | Decisiones / bugs / lecciones (no métricas SSOT) |
| `docs/SAFETY_POLICY.md` | Política de seguridad |
| `docs/MODEL_CARD.md` | Intended use + citas (IF Kew) |
| `docs/OPERATOR_UNLOCK_RUNBOOK.md` | Unlock humano |
| `docs/OPERATOR_BETA_CHECKLIST.md` | Deploy preview + form + smoke + cohorte |
| `docs/HOSTING_DEPLOY_BETA.md` | Path A hosting |
| `docs/GTM_BETA_COHORT.md` | Invitaciones beta |
| `docs/E21_SCALE_PLAN.md` | Escala opcional (no lanzado) |

---

*Documento vivo. Actualizado con Graph Engineering process sync (2026-07-29). Estado ML/producto siempre revalidar en STATE.*

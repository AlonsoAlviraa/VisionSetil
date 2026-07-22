# Fallo experimental + Plan 30 días → modelo industrial

**Fecha:** 2026-07-17  
**Estado del producto:** quality gate **UNACCEPTABLE** (ID de especie bloqueada)  
**Mejor run:** E14 focused — MAP@3 **0.093**, deadly recall **~0.02–0.08**  
**Gates industriales (mínimo shippable):** MAP@3 ≥ **0.25** (soft) / **0.40** (elite), deadly top-3 ≥ **0.95**, ECE ≤ **0.05**, hold-out ES documentado  

---

# Parte A — Autopsia del fallo

## A1. Resultados que no se pueden discutir

| Run | Diseño | MAP@3 | Top-1 | Deadly | Veredicto |
|-----|--------|------:|------:|-------:|-----------|
| v9 | 500×8 | 0.076 | 5.0% | 0% | FAIL |
| E12 | 1000×16 | **0.070** | 4.8% | 0% | FAIL (peor) |
| E13 | ~999 + deadly×8 w | **0.052** | 3.4% | 3.6% | FAIL (peor ranking) |
| E14 | 119×40 | **0.093** | 6.3% | ~2–8% | FAIL (mejor dirección) |

Ningún run se acerca a uso industrial. El mejor (E14) está a **~2.7×** del gate blando (0.25) y a **~4.3×** de un umbral “elite” (0.40) en MAP@3; en mortales está a **>10×** del mínimo R7 (0.95).

## A2. Hipótesis que quedaron **falsadas**

### H1 — “Más especies = mejor producto”
- E12/E13 a **1000 clases** bajaron MAP@3.
- Ampliar el head con few-shot **aumenta entropía** y diluye gradientes.
- **Lección industrial:** el catálogo de servicio se dimensiona por **datos por clase**, no por ego de cobertura.

### H2 — “Más epochs / más pipeline arregla few-shot”
- Best epoch temprano (v9/E12: 6; E13: 4): el modelo no se beneficia de alargar sin datos.
- ArcFace + multi-view + LoRA **no fallan por falta de complejidad**; fallan por **señal por clase**.

### H3 — “Oversample mortales (CE×8–10) salva R7”
- E13: deadly 0→3.6%; E14: ~2–8% en top-k.
- Sin **volumen real de imágenes mortales** y sin **métrica de optimización primaria en safety**, el recall mortal no emerge.
- **Lección:** R7 es un **objetivo de entrenamiento + evaluación forzada**, no un post-proceso.

### H4 — “FungiCLEF subsample es suficiente para campo España”
- Datos: web scrape / challenge multi-origen, no CyL/Soria validado.
- Vistas: autoetiquetado heurístico por path → multi-view **parcialmente ficticio**.
- Domain shift a España **no medido** en ningún run.

### H5 — “Conectar pesos reales = modelo usable”
- Infra OK (`real_multiview_v8`, gate, dashboard).
- Usabilidad **no** es load de `.pt`; es **métrica + seguridad + abstención**.

## A3. Causas raíz (ordenadas por impacto)

```
1. RÉGIMEN DE DATOS (crítico)
   - 8–40 obs/clase en problemas 119–1000-way
   - Long-tail: cientos de clases con 0% acc
   - Mortales: 4–11 spp en set, docenas de casos test, recall ~0

2. DISEÑO EXPERIMENTAL ERRÓNEO (crítico)
   - Se optimizó “tamaño de catálogo” en vez de “error de decisión de producto”
   - No había criterion early-stop en deadly recall
   - No había hold-out geográfico ni por fuente

3. MULTI-VIEW DÉBIL (alto)
   - View labels heurísticas → fusion aprende ruido de “vista”
   - Falta ROI real multi-view (E-single-view nunca se midió bien)

4. OBJETIVO DE PÉRDIDA DESALINEADO (alto)
   - CE/ArcFace uniformes no priorizan coste de confusión mortal
   - Class weight ×8 no sustituye datos ni cost-sensitive eval

5. CALIBRACIÓN Y OPEN-SET TARDE (medio)
   - ECE alto; abstención post-hoc mejora condicional pero no “crea” skill
   - Producto ya bloquea ID (correcto) — no puede “parecer” elite

6. OPS / INFRA (bajo-medio, no culpable del MAP@3)
   - Monitores CLI timeout; límite 2 GPU Kaggle
   - No bloqueó aprendizaje; sí retrasó feedback
```

## A4. Qué **sí** funcionó (capitalizar)

| Activo | Por qué importa |
|--------|-----------------|
| Load real v8 + honesty | Base de serving industrial |
| Quality gate duro | Evita greenwash legal/ético |
| E14 > E12/E13 | Prueba: **menos clases + más obs** es el eje |
| Batería offline + metrics.json | Cultura de medición |
| Fuentes ES/Soria inventariadas | Camino a domain fit |
| Política “orientation only” | Alineada con R1/R7 |

## A5. Definición de “elite industrial” (no marketing)

Un modelo **industrial** en VisionSetil no es “top de FungiCLEF leaderboard”. Es un sistema que:

1. **Decide cuándo no saber** (open-set, coverage-accuracy curve).
2. **Prioriza no matar** (deadly recall / false-safe rate).
3. **Es medible en el dominio** (hold-out España / CyL).
4. **Es versionable** (data card + model card + gate CI).
5. **Sirve en latencia** aceptable (CPU/GPU p95 documentado).

Objetivos **mes 1** (realistas y ambiciosos):

| Nivel | MAP@3 | Deadly@3 | ECE | Coverage@acc≥0.40 | Uso producto |
|-------|------:|---------:|----:|------------------:|--------------|
| **Mínimo shippable (soft)** | ≥0.25 | ≥0.90 | ≤0.06 | ≥15% | Pistas con abstención fuerte |
| **Industrial sólido** | ≥0.35 | ≥0.95 | ≤0.05 | ≥25% | Asistente multi-vista |
| **Elite (stretch)** | ≥0.45 | ≥0.98 | ≤0.04 | ≥35% | Cerca de SOTA few-shot real |

> “Elite en 30 días” es **alcanzable solo en un catálogo acotado + datos serios**, no en 1000 spp web-noise. El plan asume **honestidad de alcance**.

---

# Parte B — Plan de 30 días

## Principios del plan

1. **Safety-first training:** deadly es métrica #1 en cada run.  
2. **Scope control:** 40 → 80 → 150 spp máximo en el mes; no 1000.  
3. **Data before architecture:** no tocar backbone hasta MAP@3≥0.20 en focused.  
4. **Eval industrial:** split por `observation_id`, por fuente, y hold-out ES.  
5. **Ship gates in CI:** sin métricas, no hay deploy de pesos.  
6. **Una GPU budget consciente:** Kaggle ~30h/semana; planificar ≤2 jobs paralelos.

## Arquitectura de datos objetivo (Mes 1)

```
data/
  industrial_v1/
    observations.jsonl      # 1 fila = 1 observación multi-vista
    images/                 # paths + hash
    labels/
      species_allowlist.json   # 40–80 spp fase 1
      deadly_set.json          # cerrada, versionada
    splits/
      train_obs.json / val_obs.json / test_obs.json
      test_es_gbif.json        # hold-out geográfico
    datacard.md
```

**Fuentes (prioridad):**
1. FungiCLEF + FungiTastic **filtrados** al allowlist (no subsample aleatorio 500).  
2. GBIF ES + imagen (licencia CC0/CC-BY primero).  
3. Contacto paralelo Micocyl / Montes de Soria / MA-Fungi (pipeline de ingesta aunque el dump llegue día 20–30).  
4. Hard-negatives: lookalikes de mortales en el set de train **con peso**.

## Stack de modelo (Mes 1) — sin reinventar

Mantener **MultiView v8/v14 arch** (ConvNeXtV2-tiny + LoRA + fusion + ArcFace) hasta superar soft gate.  
Añadir solo:
- **Cost-sensitive loss** (mortal: coste alto de FN).  
- **Sampler** por clase (mínimo N obs/clase, cap max).  
- **View quality filter** (descartar obs con 1 sola vista basura).  
- **Temperature + open-set** calibrados en **val**, freeze en test.  
- Opcional semana 4: backbone base **solo si** soft gate ya se superó.

## Organización del mes (semanas)

### Semana 1 — Cimentación industrial (días 1–7)

**Objetivo:** dataset focused + pipeline de eval no negociable.

| Día | Entregable | Done when |
|-----|------------|-----------|
| 1–2 | Allowlist **40 spp** (20 comunes ES + **todos mortales disponibles** en FungiCLEF/FT) | JSON versionado + conteos |
| 2–3 | Exportador `build_industrial_dataset.py` (obs-level, multi-img, anti-leak) | ≥30 obs/clase media; mortales listados |
| 3–4 | Splits train/val/test **por observation_id** + script métricas (MAP@3, deadly@1/@3, ECE, coverage-acc) | Un comando reproduce informe |
| 4–5 | **E15-focus40** train Kaggle (20–25 ep, tiny, cost loss) | metrics.json + battery |
| 5–6 | Calibración T + open-set en val; wire gate con **nuevo** metrics path | Gate lee industrial_v1 |
| 7 | Review: si MAP@3&lt;0.15 o deadly&lt;0.5 → **no ampliar clases**; solo más datos de esas 40 | Informe semanal |

**KPI semana 1 (must):** deadly@3 ≥ **0.50**, MAP@3 ≥ **0.15** en 40 spp.

### Semana 2 — Datos + safety (días 8–14)

**Objetivo:** romper el techo de datos y R7.

| Día | Entregable | Done when |
|-----|------------|-----------|
| 8–9 | GBIF download ES fungi+imagen filtrado licencia; empaquetar al allowlist | ≥+20% obs en mortales o doc de techo |
| 9–11 | **E16** retrain 40 spp con GBIF+FT+FC; hard negatives lookalike | MAP@3 ≥0.22, deadly@3 ≥0.80 |
| 11–12 | Ablation: 1-view vs multi-view (mismo set) | Δ MAP@3 documentado |
| 12–13 | Serve: conectar `best` industrial **solo si** soft gate parcial; si no, gate sigue bloqueando | No greenwash |
| 14 | Data card v1 + model card v1 | Docs en repo |

**KPI semana 2 (must):** deadly@3 ≥ **0.80**, MAP@3 ≥ **0.22**, ECE ≤ **0.08**.

### Semana 3 — Industrialización del sistema (días 15–21)

**Objetivo:** el “modelo” es el sistema (abstención + revisión + latencia).

| Día | Entregable | Done when |
|-----|------------|-----------|
| 15–16 | Ampliar a **80 spp** **solo** si KPI S2 cumplidos; si no, profundizar 40 | Decisión go/no-go escrita |
| 16–18 | **E17** train 80 (o 40++data); progressive resize 224→384 | MAP@3 ≥0.28 (80) o ≥0.30 (40) |
| 18–19 | Open-set policy productizada: curvas coverage-acc; defaults en config | acc\|accept≥0.40 a coverage≥0.20 |
| 19–20 | Hold-out **ES/Soria bbox** eval-only (aunque sea 1–2k imgs) | Informe domain shift |
| 20–21 | CI gate: PR no mergea pesos si metrics &lt; umbral | Script en CI local |

**KPI semana 3 (must):** soft industrial en catálogo acotado: MAP@3 ≥ **0.28**, deadly@3 ≥ **0.90**, domain-shift ES reportado.

### Semana 4 — Elite en alcance controlado + ops (días 22–30)

**Objetivo:** nivel “elite **en el catálogo del mes**” + listo para operación.

| Día | Entregable | Done when |
|-----|------------|-----------|
| 22–24 | **E18** ensemble o SWA + TTA multi-view (test-time) | +MAP@3 sin romper deadly |
| 24–26 | Opcional: backbone **base** o 384px si hay GPU y KPI S3 ok | Comparativa vs tiny |
| 26–27 | Latencia p50/p95 CPU y GPU; budget serving | p95 &lt; 1.5s GPU / doc CPU |
| 27–28 | Human-in-the-loop: cola de revisión para rejects + mortales | Flujo /revision-experta |
| 28–29 | Shadow mode en app: log predicciones sin mostrar ID si gate soft | Telemetría |
| 30 | **Release industrial v1**: model card, data card, metrics, rollback a gate block | Tag git + pesos en path canónico |

**KPI semana 4 (target elite acotado):**

- MAP@3 ≥ **0.40** en test obs-level del allowlist  
- Deadly@3 ≥ **0.95**  
- ECE ≤ **0.05**  
- Domain gap ES documentado (no necesariamente cerrado)  
- Gate CI verde en ese catálogo  

## Roadmap de experimentos (IDs)

| ID | Cuándo | Setup | Success |
|----|--------|-------|---------|
| E15-focus40 | S1 | 40 spp, max data, cost loss | MAP≥0.15, dead≥0.50 |
| E16-focus40-gbif | S2 | +GBIF/ES | MAP≥0.22, dead≥0.80 |
| E16b-view-ablation | S2 | 1 vs multi view | Δ MAP reportado |
| E17-focus80 o 40++ | S3 | expand o deepen | MAP≥0.28, dead≥0.90 |
| E18-elite-ttaswa | S4 | TTA/SWA/ens | MAP≥0.40, dead≥0.95 |

**Prohibido en el mes (salvo justificación escrita):**
- Runs 500–1000 spp few-shot “por cobertura”
- Cambiar 3 backbones en la misma semana sin dataset nuevo
- Subir a prod un `.pt` sin `metrics.json` + gate

## Equipo y roles (aunque sea 1 persona)

| Rol | % tiempo | Foco |
|-----|----------|------|
| Data eng | 40% | allowlist, GBIF, splits, datacard |
| ML eng | 35% | E15–E18, losses, calibración |
| Product/safety | 15% | gate, copy, human review, R7 |
| Ops | 10% | monitores Kaggle robustos, CI metrics |

## Presupuesto cómputo (orden de magnitud)

- Kaggle GPU: ~20–30 h/semana → **4–6 trains serios/mes** + evals  
- Priorizar **pocos trains de calidad** sobre muchos E12-likes  
- CPU local: baterías, gates, packaging  

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| No hay suficientes mortales en FT/FC | Ampliar deadly set con GBIF + aceptar recall incompleto documentado; no fingir 0.98 |
| Licencias NC (iNat) | Pipeline licencia-aware; train comercial solo CC0/BY |
| 30 días no bastan para 1000 spp ES | **No es el objetivo del mes**; elite en catálogo v1 |
| Overfit al allowlist | Hold-out ES + open-set obligatorio |
| GPU slots / CLI timeouts | Un job GPU; monitores con retry; push solo a kernels existentes |

## Criterios de éxito del mes (checklist)

- [ ] Dataset industrial v1 versionado (obs-level, anti-leak)  
- [ ] ≥1 checkpoint con MAP@3 ≥ 0.25 **y** deadly@3 ≥ 0.90 en ese set  
- [ ] Stretch: MAP@3 ≥ 0.40, deadly@3 ≥ 0.95  
- [ ] Hold-out ES evaluado (aunque sea pequeño)  
- [ ] Gate CI + model/data cards  
- [ ] Serve no greenwash (gate o modelo que pasa gate)  
- [ ] Plan de mes 2 esbozado: +datos CyL, +clases, retrieval/index  

## Qué **no** promete este plan

- SOTA FungiCLEF full 2k+ spp en 30 días  
- Sustituir a un micólogo  
- Autorizar consumo  
- Que iNat ruidoso iguale herbario MA-Fungi  

---

# Parte C — Mensaje ejecutivo

Los experimentos **no fallaron por no “conectar pesos”**. Fallaron porque se entrenó un **clasificador few-shot de catálogo grande** con **señal insuficiente**, **mortales sin prioridad real** y **sin dominio España**.  

E14 demostró el único vector válido: **reducir clases y aumentar datos por clase**.  

El plan de un mes convierte VisionSetil de “notebooks Kaggle con métricas cosméticas” en un **sistema industrial de decisión**: datos versionados, safety métrica #1, catálogo acotado elite, abstención calibrada y gates que impiden mentir.

**Primera acción mañana (día 1):** cerrar allowlist 40 spp + exportador obs-level + E15. Sin eso, cualquier E19 es más de lo mismo.

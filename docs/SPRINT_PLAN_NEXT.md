# 🍄 Sprint Plan — VisionSetil v0.2.0

> **Fecha:** 2026-07-07
> **Sprint anterior:** MVP v0.1.0 (backend funcional, 91 tests PASS, modelo YOLOv8 operativo)
> **Objetivo del sprint:** Convertir el MVP en producto industrial-grade con seguridad por defecto, feedback loop y UX profesional.

---

## ✅ Verificación de repositorio (local + remoto)

| Check | Estado |
|-------|--------|
| Working directory | C:\\AlonsoAlviraa\\VisionSetil ✓ |
| Git remote | Configurado ✓ |
| Branch actual | main ✓ |
| Modelo YOLOv8 | yolov8n.pt funcional (60% detection en smoke test) ✓ |
| Backend tests | 91/91 PASS ✓ |
| Frontend | Limpio (sin duplicados JSX legacy) ✓ |

---

## 🎯 Mejoras implementadas en este sprint

### 1. 🛡️ Sistema de seguridad crítico (SAFETY FIRST)
- Disclaimer obligatorio en cada resultado (no eliminable)
- Color-coding de edibilidad: mortal, toxica, comestible, desconocida
- Danger callout animado cuando la top-1 prediction es mortal/toxica
- Safety message en rechazos (tratar como potencialmente peligrosa)
- Footer disclaimer en todo momento

### 2. 🔄 Feedback loop (Active Learning)
- Nuevo endpoint POST /feedback conectado al FeedbackLogger existente
- Botones correcto/incorrecto en ResultCard cuando hay prediccion aceptada
- Integracion best-effort (no rompe UX si falla)
- Preparado para alimentar human review queue y reentrenamiento

### 3. 📜 Historial de sesion
- Persistencia en localStorage (max. 20 entradas)
- Grid visual con thumbnails y decision (accepted/rejected)
- Click para reabrir resultados anteriores
- Boton de limpiar historial

### 4. 🎨 Frontend industrial-grade
- Dark mode automatico via prefers-color-scheme
- Sistema de design tokens (CSS custom properties)
- Animaciones de peligro (pulse)
- Responsive mobile-first

### 5. 🧪 CI/CD robusto
- 4 jobs paralelos: lint+test, model smoke test, frontend build, docker build
- Model smoke test en CI (valida que el modelo carga e infiere)
- Frontend TypeScript check + build en CI
- Docker build solo si todo pasa

### 6. 🧹 Cleanup tecnico
- Eliminado frontend/src/app/ (JSX legacy duplicado)
- Stack unificado: TypeScript + React + Vite

---

## 📋 Plan para el SIGUIENTE sprint — Delegacion a subagentes

### 🤖 Subagente A — ML/Datos
**Task:** Fine-tuning de modelo especifico de setas
- [ ] Descargar dataset FungiCLEF / FungiTastic (>=10k imagenes)
- [ ] Fine-tune YOLOv8 o DINOv3 sobre setas ibericas
- [ ] Evaluar mAP@0.5 vs baseline actual
- [ ] Build species index con embeddings reales
- [ ] Calibrar thresholds de open-set rejection

**Entregable:** Modelo yolov8-mushrooms-v1.pt + metricas de validacion

### 🤖 Subagente B — Backend/Infra
**Task:** Escalabilidad y observabilidad
- [ ] Migrar SQLite a PostgreSQL para produccion
- [ ] Anadir Sentry/OTel tracing distribuido
- [ ] Implementar cache Redis para embeddings
- [ ] Health check con readiness probe (modelo cargado)
- [ ] Rate limiting dinamico por API key

**Entregable:** docker-compose.prod.yml + dashboard de metricas

### 🤖 Subagente C — Frontend/UX
**Task:** PWA y experiencia movil
- [ ] Convertir a PWA (service worker + offline cache)
- [ ] Camera capture nativo (no solo upload)
- [ ] Geolocalizacion automatica para metadata
- [ ] Multi-image upload (distintas vistas del especimen)
- [ ] Onboarding con tutorial de seguridad

**Entregable:** PWA instalable con offline-first

### 🤖 Subagente D — Seguridad/Compliance
**Task:** Hardening y compliance
- [ ] Audit de seguridad (OWASP Top 10)
- [ ] Rate limiting + WAF rules
- [ ] GDPR: consentimiento de datos + right-to-be-forgotten
- [ ] Disclaimer legal revisado por juridico
- [ ] Penetration testing basico

**Entregable:** Security audit report + politicas GDPR

---

## 📊 Metricas del sprint

| Metrica | Antes | Despues |
|---------|-------|---------|
| Tests backend | 91 | 91 (+ feedback endpoint) |
| Frontend componentes | 3 (JSX mezclado) | 4 TSX puro |
| Safety warnings | 0 | 4 niveles |
| CI jobs | 2 | 4 |
| Dark mode | No | Si |
| Feedback loop | No | Si |

---

## ⚠️ Riesgos y mitigaciones

1. **Modelo generico (no especifico de setas):** Mitigado con disclaimers + feedback loop. Subagente A trabaja en fine-tuning.
2. **localStorage lleno con previews:** Mitigado con fallback a 5 entradas.
3. **Feedback endpoint sin auth:** Dentro del rate limiting global. Subagente D audita.

---

## 🚀 Proximos pasos inmediatos

1. git add -A and commit
2. Lanzar subagentes A-D en paralelo
3. Sprint review al final de la semana

# Dataset de Validación Real de VisionSetil

Este directorio está reservado para almacenar imágenes reales y etiquetas validadas por expertos para realizar benchmarks del clasificador.

---

## Estructura del Directorio

```txt
eval/real_data/
  README.md
  images/              # Carpeta para colocar imágenes reales de setas (*.jpg)
  labels/
    real_observations_template.json # Plantilla de estructura de etiquetas
```

---

## Cómo preparar tu dataset real

1.  **Colocar imágenes:**
    Coloca las fotos de setas tomadas en campo dentro del directorio `eval/real_data/images/`.
    *   *Ejemplo:* `eval/real_data/images/real_001_cap.jpg`

2.  **Etiquetar las observaciones:**
    Edita o crea un archivo de etiquetas JSON (p. ej. `real_observations.json` o copia la plantilla) bajo `eval/real_data/labels/`. Asigna los taxones esperados, géneros, familias y comportamiento de seguridad esperado.

3.  **Ejecutar benchmark:**
    ```bash
    python eval/scripts/run_eval.py --dataset eval/real_data/labels/real_observations_template.json --output eval/reports/real_report.json
    ```

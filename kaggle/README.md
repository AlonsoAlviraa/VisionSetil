# VisionSetil Kaggle Benchmark Suite

Este directorio contiene herramientas para empaquetar conjuntos de datos y ejecutar evaluaciones por lotes (batch benchmark) del pipeline de VisionSetil en el entorno en la nube de **Kaggle**.

## Estructura del Directorio

```txt
kaggle/
  README.md                          # Este archivo.
  vision_setil_kaggle_benchmark.ipynb # Plantilla de notebook Jupyter para Kaggle.
  kaggle_run_config.example.json     # Plantilla de configuración JSON para el benchmark.
  prepare_kaggle_dataset.py          # Script CLI para empaquetar datasets locales a formato Kaggle.
  run_kaggle_benchmark.py            # Orquestador del benchmark en Kaggle con soporte staged.
```

## Guía Rápida de Uso

1.  **Empaquetar Dataset Local:**
    ```bash
    python kaggle/prepare_kaggle_dataset.py \
      --labels eval/real_data/labels/real_observations_template.json \
      --images-root eval/real_data/images \
      --output-dir my_kaggle_dataset
    ```

2.  **Subir a Kaggle:**
    *   Sube la carpeta `my_kaggle_dataset` como un nuevo Dataset privado en Kaggle.
    *   Sube el notebook `vision_setil_kaggle_benchmark.ipynb` a Kaggle.

3.  **Ejecutar en la Nube:**
    *   Vincula tu dataset al notebook de Kaggle.
    *   Ejecuta las celdas del notebook para correr el orquestador y calcular las métricas.

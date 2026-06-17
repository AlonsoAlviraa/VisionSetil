# mushroom-photo-id

MVP serio y seguro para identificacion orientativa de setas desde fotos. La app sigue un enfoque conservador inspirado en patrones chinos de mini-programa ligero: flujo guiado, backend simple, clasificador visual sustituible, coleccion personal, explicacion educativa y avisos fuertes para especies venenosas.

Nunca usa lenguaje de consumo seguro. La salida siempre es orientativa y recomienda validacion humana.

## Estructura

```txt
backend/
  app/
  requirements.txt
  README.md
frontend/
  src/
  package.json
  README.md
docs/
```

## Research usada

Se ha alineado con `research_deteccion_setas_desde_fotos.md`, localizada en el entorno en `C:\Users\alonso.alvira\Downloads\research_deteccion_setas_desde_fotos.md`.

## Backend

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn app.main:app --reload
```

Ejecuta el servidor desde `backend/`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Tests

```bash
python -m pytest backend/app/tests
```

## Documentacion

- [docs/product_spec.md](./docs/product_spec.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/safety_policy.md](./docs/safety_policy.md)
- [docs/chinese_reference_patterns.md](./docs/chinese_reference_patterns.md)
- [docs/roadmap.md](./docs/roadmap.md)

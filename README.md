# VisionSetil

VisionSetil es una app educativa de identificacion visual de setas inspirada en patrones de mini-programa ligero: flujo movil-first, backend simple, coleccion de observaciones, chatbot explicativo y alertas reforzadas para especies peligrosas.

La aplicacion nunca declara que una seta sea comestible o segura. Todas las respuestas se presentan como orientacion educativa con recomendacion explicita de validacion por una persona experta.

## Stack

- FastAPI
- SQLite con SQLAlchemy
- Jinja2 + HTML/CSS/JS movil-first
- Pytest para tests

## Inicio rapido

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
uvicorn app.main:app --reload
```

La app queda disponible en `http://127.0.0.1:8000`.

## Tests

```bash
pytest
```

## Documentacion

- [Documentacion tecnica](./docs/TECHNICAL.md)
- [Safety policy](./docs/SAFETY_POLICY.md)
- [Roadmap](./docs/ROADMAP.md)

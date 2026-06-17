# Backend

API FastAPI para el MVP de identificacion orientativa de setas.

## Arranque

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Endpoints principales

- `GET /health`
- `GET /species/poisonous`
- `GET /observations`
- `POST /observations`
- `POST /observations/{observation_id}/images`
- `POST /observations/{observation_id}/classify`

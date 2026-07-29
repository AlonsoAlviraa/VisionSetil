# Crear Google Form beta (manual — no hay MCP Forms)

Grok tiene MCP de **Gmail**, no de **Google Forms**. Por eso el form no se puede crear por API aquí.

## Lo que ya tienes sin Google

- Ruta en la app: **`/beta-feedback`**
- Home + footer apuntan ahí si no hay `VITE_BETA_FEEDBACK_URL`
- Guarda en `localStorage` + opción de email a `alonso.alvbal@gmail.com`

## Crear Google Form (2 min)

1. Abre https://docs.google.com/forms/u/0/create  
2. Título: **VisionSetil — Feedback beta**  
3. Descripción: *Solo orientación de campo — nunca permiso de consumo ni recolección.*  
4. Preguntas (ver checklist en borrador Gmail “crear Google Form beta”)  
5. Enviar → copiar enlace `https://forms.gle/...`  
6. Poner en build:

```bash
VITE_BETA_FEEDBACK_URL=https://forms.gle/TU_ID
```

7. `npm run build` + redeploy

Borrador de email en tu Gmail: asunto **VisionSetil — crear Google Form beta (checklist 2 min)**.

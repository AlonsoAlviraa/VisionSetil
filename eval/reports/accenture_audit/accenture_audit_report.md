# VisionSetil mega-auditoría (tipo Accenture)

- Generated: `2026-07-27T18:57:23.316746+00:00`
- Overall (gating only): **PASS**
- Policy: `orientation_only; unsafe_to_consume; never_forage_permission; product_unlock_not_in_scope`
- **product_unlock: false** (esta auditoría no desbloquea Identify/consumo)
- **consumption_permission: false**
- Report dir: `eval/reports/accenture_audit`

## Matriz área × resultado × evidencia

| Área | Resultado | Gating | Evidencia |
|------|-----------|--------|-----------|
| juegos_quiz_setadle | PASS | yes | `eval/reports/accenture_audit/accenture_games.log` |
| nombres_i18n | PASS | yes | `eval/reports/accenture_audit/accenture_names_i18n.log` |
| cookies_auth_frontend | PASS | yes | `eval/reports/accenture_audit/accenture_cookies_fe.log` |
| cookies_auth_backend | PASS | yes | `eval/reports/accenture_audit/accenture_cookies_be.log` |
| seguridad_backend | PASS | yes | `eval/reports/accenture_audit/accenture_security_be.log` |
| security_static | PASS | yes | `eval/reports/accenture_audit/accenture_static_security.txt` |
| app_web_pwa | PASS | yes | `frontend/vite.config.ts + vite-plugin-pwa (shared SPA/PWA)` |
| e2e_browser | SKIPPED | no | `eval/reports/accenture_audit/ (e2e not run; use --with-e2e)` |

## Superficies

- **App / Web / PWA**: misma codebase Vite + `vite-plugin-pwa` (SPA instalable).
- **Juegos**: quiz (name/photo/food/lookalike) + Setadle — pool documentado.
- **Nombres / i18n**: paridad EN/ES + catálogo SSOT.
- **Cookies / auth**: dual bearer vs HttpOnly cookie (E-08); cookie mode sin token en localStorage.
- **Seguridad**: CORS no-wildcard con credentials, cookie HttpOnly, API keys en prod, path hardening.

## Defectos abiertos / notas

- Ningún fallo en áreas **gating**.
- **SKIPPED** `e2e_browser`: Playwright not executed by default — not a test PASS (no cuenta en overall)

## Deviations / limitaciones

- E2e Playwright omitido por defecto → **SKIPPED** (no PASS falso); usar `--with-e2e` si hay browser.
- No se afirma unlock de producto ni permiso de forrajeo/consumo.

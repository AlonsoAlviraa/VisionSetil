# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering (Campo nocturno B → product)  
**Updated:** 2026-07-29  
**Goal:** Ship Stitch B visual language into real FE (map unchanged) · never product_unlock · never forage

## Active graph version

`v1.10.1-campo-nocturno-full-skin`

## Current status

| Area | Status | Notes |
|------|--------|--------|
| Stitch B v2 pack (16 screens) | **SHIPPED** | `docs/design/stitch/screens-b-v2/` |
| App ref screenshots | **SHIPPED** | `docs/design/stitch/ref-app/` |
| FE shell dark + bottom nav | **SHIPPED** | `/juegos` `/mas` |
| Home calm B | **IN PROGRESS → SHIPPING** | `home-mkt--cn-calm` + campo-nocturno.css |
| Identify / games / ency night skin | **SHIPPING** | tokens + page classes |
| **Mapa** | **KEEP CURRENT** | user preference — no Stitch map restyle |
| product_unlock | **BLOCKED** | false |

## Design source of truth

- Stitch: `docs/design/stitch/screens-b-v2/01-home.png` … `16-comunidad.png`
- System prompt: `docs/design/stitch/B_SYSTEM_PROMPT.md`
- Implementation CSS: `frontend/src/styles/campo-nocturno.css`

## Residual next

1. Iterate pixel fidelity vs Stitch PNGs (identify slots, result card)  
2. Games pages (Setadle/Wordle/Reto) skin pass  
3. Species detail night gallery  
4. Operator deploy still open  

## product_unlock

Always **false**.

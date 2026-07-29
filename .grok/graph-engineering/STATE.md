# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering (visual Home redesign · less text)  
**Updated:** 2026-07-29  
**Goal:** Photo-first Home (app+web), short Spanish copy, residual kit hidden · never product_unlock · never forage

## Active graph version

`v1.12.0-home-visual-redesign`

## Current status

| Area | Status | Notes |
|------|--------|--------|
| Dual build App / Web (split) | **SHIPPED** | 2 Vite builds · `index-app/web.html` · `main-app/web.tsx` · ports 5173/5174 · `dist-app/` + `dist-web/` · factory `createViteConfig(target)` |
| Layout mode forced per build | **SHIPPED** | `VITE_LAYOUT_MODE` baked at build · `forcedMode` prop on App · toggle disabled in fixed builds |
| Stitch design tokens SSOT | **SHIPPED** | campo-nocturno.css :root rewritten · OLED `#0F1410` · Source Serif 4 body · glass `rgba(26,36,32,0.6)` · cream `#E8DCC8` · radius 8/16/24 · full M3 set |
| Material Symbols | **SHIPPED** | `@import` Material Symbols Outlined · `Icon` component · Home + Result migrated from inline SVG |
| Home pixel-match | **SHIPPED** | pill CTA + circle orb · icon trust row · grid-cols-3 quick · atmospheric card · display-lg title |
| Identify + Result pixel-match | **SHIPPED** | glass result-card · decision pill · risk chip error-container · lookalike glass rows · next-actions grid-cols-2 · wizard grid-cols-2 aspect-square |
| Enciclopedia por familias | **SHIPPED** | `groupByFamily` toggle · banded family galleries (First-Nature pattern) |
| Key dicotómico educativo | **SHIPPED** | `DichotomousKey` component + `dichotomousKey.ts` lib · Education page · study hints only |
| Photo-first cascade | **CONFIRMED** | catalog HD first · no crossOrigin · lazy/eager priority — already SHIPPED, no residual |
| Season strip | **CONFIRMED** | `SeasonalTopStrip` already on Home — no residual |
| Mapa | **KEEP CURRENT** | user lock |
| product_unlock | **BLOCKED** | false |
| Competitive UX distillation | **SHIPPED** | 4 patterns (photo-first, families, season, dichotomous) — legal patterns only, no X1-X3 |

## Audit findings (this cycle)

1. Dual layout was a runtime CSS toggle → converted to **build-time factory** (clean two-app split)  
2. Body font was DM Sans → corrected to **Source Serif 4** per Stitch canonical  
3. Body bg was `#0a0f0b` radial → corrected to **OLED `#0F1410`**  
4. Glass was `rgba(28,33,28,0.72)` → corrected to **`rgba(26,36,32,0.6)` + blur20 + moss border**  
5. Cream accent missing → added **`#E8DCC8`** (text-cream)  
6. Inline SVGs in Home → migrated to **Material Symbols Outlined**  
7. Encyclopedia grid flat → added **family-banded galleries** toggle  
8. No educational key → added **dichotomous key** (himenium questions, study hints)  

## Residual next

1. Weaker local `/media` taxa (under 15kb) optional re-fetch (P3)  
2. Operator deploy residual (O1-O7)  
3. Identify wizard `getUserMedia` framing overlays (P2 competitive residual)  
4. Community human-consensus loop depth (P2)  

## product_unlock

Always **false**.

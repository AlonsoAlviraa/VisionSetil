# VisionSetil — Design system for Stitch (Option B Campo nocturno)

## Brand
- App: **VisionSetil** — field mushroom orientation (Spain / Iberia), not a forage app.
- Language: **Spanish UI**.
- Visual: **Campo nocturno** OLED dark: background `#0F1410`, cards `#1A2420` glass, moss accent `#8FBC8F`, cream text `#E8DCC8`, deadly risk `#C45C5C`, amber caution `#E6A23C`.
- **Never** lime/“safe to eat” green. **Never** 3D mushroom models — only real field photos or flat empty “sin foto real”.
- Sticky policy on every screen: **«Solo orientación · nunca consumo»** + open-set is a feature.

## Global chrome (all screens)
- Top: app title or page title; optional theme feels dark night-foray.
- **Bottom nav (5 tabs)** always: **Inicio · Identificar · Juegos · Enciclopedia · Más** (active state moss).
- Safe-area bottom padding for PWA.
- Typography: clean sans for UI; short scientific names in italics where relevant.

## Product map (must remain complete)
| Route | Screen purpose |
|-------|----------------|
| `/` Inicio | Conversion home: multi-view CTA, trust (open-set), short discover (not a wall of cards). |
| `/identificar` | Multi-view capture: slots Laminillas, Perfil, Hábitat, Detalle + soft coach + Analizar. |
| Result Identify | Orientation sticky, top-k, risk chips, lookalikes critical views, open-set reject state. |
| `/juegos` | Hub: Setadle, Wordle setas, Reto diario. |
| `/setadle` | Habitat/sort daily game board. |
| `/wordle` | Letter grid species wordle. |
| `/reto` | Quiz cards lookalike education. |
| `/enciclopedia` | Search + grid of real species photos + risk chips. |
| `/enciclopedia/:slug` | Ficha: gallery real photos, risk, IF nomenclature strip, multi-view coach. |
| `/mapa` | Spain/cotos map; “no identifica ni autoriza recolección”. |
| `/mas` | Grouped list: Educación, Lookalikes, Cuaderno, Offline, Comunidad, Expertos, Beta, ML, Login. |
| `/educacion` | Safety + multi-view education. |
| `/lookalikes` | Studio pairs + critical views. |
| `/historial` | Notebook list + optional pins (privacy). |
| `/offline` | Season/offline pack study. |
| `/comunidad` | Human second opinion. |
| `/revision-experta` | Expert handoff. |

## Home style note (user preference)
Prefer the **original B Identify aesthetic** for Home: calm night hero, multi-view chips, primary CTA, light trust row — **not** a dense grid of every feature. Secondary features live under **Más** and a small “Explorar” strip.

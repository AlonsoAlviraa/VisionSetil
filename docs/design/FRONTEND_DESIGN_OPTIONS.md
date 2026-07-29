# VisionSetil — 3 frontend design options

**Chosen direction (2026-07-29):** **B — Campo nocturno** (full product map + games).  
**Goal:** improve product polish while keeping **real field photos only**, **orientation-only** safety, multi-view Identify, Iberia encyclopedia, **all games and secondary surfaces**.

**Policy forever:** never edible green lights · open-set is a feature · no 3D model studio.

**Stitch project:** `12549746111619294405` (account VisionSetil FE redesign options)  
**Stitch screenshots (authoritative):**

| Option | Screenshot | HTML export |
|--------|------------|-------------|
| A | `docs/design/proposals/option-A-stitch.png` | `docs/design/stitch/option-A.html` |
| B | `docs/design/proposals/option-B-stitch.png` | `docs/design/stitch/option-B.html` |
| C | `docs/design/proposals/option-C-stitch.png` | `docs/design/stitch/option-C.html` |

Earlier draft mockups (Imagine): `option-A-bosque-claro.jpg` etc. Prefer **Stitch** versions for handoff.

---

## Option A — **Bosque claro** (atelier refinement)

| | |
|--|--|
| **Mood** | Cream / forest green, editorial, Iberia field guide |
| **Layout** | Soft mesh hero, large serif titles, photo-first cards, sticky orientation bar |
| **Identify** | Wizard as stepped cards; soft coach chips; ResultCard dense but calm |
| **Best for** | Continuity with current atelier + marketing.css |
| **Risk** | Feels “more of the same” if not tightened |

**Palette:** cream `#F7F4ED`, forest `#2D4A2B`, bark `#6B4A2E`, amber caution, deep red deadly (never lime “safe”).

---

## Option B — **Campo nocturno** (dark field PWA) ✅ CHOSEN

| | |
|--|--|
| **Mood** | Dark slate / moss, night foray, OLED-friendly |
| **Layout** | Bottom nav mobile, glass panels, high-contrast risk chips |
| **Identify** | Full-bleed capture stage; FAB primary; result as bottom sheet |
| **Best for** | Field use at dusk, mobile-first beta |
| **Product map** | **All surfaces:** Identify · Enciclopedia · Juegos (Setadle/Wordle/Reto) · Mapa · Educación · Lookalikes · Cuaderno · Offline · Comunidad · Expertos · Beta · ML · Login |
| **Implementation** | Dark default + `BottomNav` + `/juegos` + `/mas` hubs + expanded Home discover |

**Palette:** `#0F1410` bg, `#1A2420` cards, `#8FBC8F` accents, `#E8DCC8` text, deadly `#C45C5C`.

**Stitch B full set:** `option-B-home-full.png` · `option-B-games.png` · `option-B-map.png` · `option-B-mas.png` · base `option-B-stitch.png`

---

## Option C — **Guía de campo** (Swiss mycological journal)

| | |
|--|--|
| **Mood** | Paper white, ink black, single accent teal, grid rigor |
| **Layout** | Magazine columns, strong type hierarchy, fewer decorative meshes |
| **Identify** | Checklist + 4 slots in a tight grid; result as scientific dossier |
| **Best for** | Trust / expert credibility / Kew-adjacent nomenclature surfaces |
| **Risk** | Less “app fun”; games need a secondary playful skin |

**Palette:** `#FAFAF8`, ink `#1A1A1A`, teal info `#0E7490`, warning `#D97706`, deadly `#7F1D1D`.

---

## Shared product constraints (all options)

1. Real photos only (no 3D spin / fake mushroom models)  
2. Sticky orientation: “solo orientación · nunca consumo”  
3. Multi-view gills / front / detail / habitat coach  
4. Risk chips: deadly / high never green  
5. Open-set reject UI is first-class, not an error  
6. i18n es/en (ca/eu keep working)

---

## How to choose

Reply with **A**, **B**, or **C** (or “A with B’s bottom nav”, etc.).  
We’ll implement tokens + Home + Identify + Species detail first.

**Stitch:** when `STITCH_API_KEY` is set, we can regenerate these three as Stitch project screens for HTML export.

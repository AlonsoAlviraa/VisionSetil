# Graph Engineering — Product backlog (post v1.15.0)

**Policy:** orientation only · never auto product_unlock · never forage.  
**Design direction:** **B Campo nocturno** · **Map stays as current product** (user lock).  
**Architecture:** `docs/design/FRONTEND_ARCH_MIGRATION_GRAPH.md`

## Architecture migration (v1.15)

| # | Item | Status |
|---|------|--------|
| M0 | Migration graph doc | **SHIPPED** |
| M1 | navConfig SSOT | **SHIPPED** |
| M2 | LinkButton + PageShell | **SHIPPED** |
| M3 | CSS drop redesign/premium | **SHIPPED** |
| M4 | Media SpeciesImage-only | **PARTIAL** |
| M5a | Home/Más/Ency LinkButton | **SHIPPED** |
| M5b | Identify Button finish | **SHIPPED** v1.15.1 |
| M5c | Games Setadle/Wordle | **PARTIAL** (Quiz skin residual) |
| M5d | History Offline Community | **SHIPPED** v1.15.1 |
| M5e | Detail Education 404 | **SHIPPED** (Detail/404) |
| M5f–g | Map chrome Expert | **SHIPPED** v1.15.1 |
| M6 | CA/EU i18n parity | **SHIPPED** v1.16.0 |
| M7 | foodQuality slim index | **SHIPPED** v1.16.0 (virtualize → N2) |
| M8 | CTA architecture contracts | **SHIPPED** v1.16.0 |

## v1.17.0 — SHIPPED

| # | Item | Status |
|---|------|--------|
| N1 | CTA allowlist shrink (Offline, Ency, Map buttons) | **SHIPPED** |
| N2 | Encyclopedia content-visibility | **SHIPPED** |
| N3 | Ficha attribution + NC note | **SHIPPED** |
| N4 | DocumentTitle + meta description | **SHIPPED** |
| N5 | Operator deploy O1–O7 | human residual |

## v1.18.0 — SHIPPED (P1–P3)

| # | Item | Status |
|---|------|--------|
| P1 | Map external stay class; Expert/History/Quiz allowlist shrink | **SHIPPED** |
| P2 | Identify segmented mode toggle → Button | **SHIPPED** |
| P3 | History detail residual CTAs → Button/LinkButton | **SHIPPED** |
| P4 | Weak media re-harvest P3/P6 | **DEFERRED** operator/network |
| P5 | Operator deploy O1–O7 | human residual |
| P6 | Community consensus depth (C6) | Later (optional) |

## v1.19.0 — SHIPPED (Q1–Q5)

| # | Item | Status |
|---|------|--------|
| Q1 | Setadle + Wordle mode toggles → Button/LinkButton | **SHIPPED** |
| Q2 | Community residual → Button; Education already clean | **SHIPPED** |
| Q3 | LookalikeStudio + BetaFeedback residual | **SHIPPED** |
| Q4 | Home beta row; Login/Register already clean | **SHIPPED** |
| Q5 | ExternalLinkButton (Map permit/OSM, beta mailto) | **SHIPPED** |
| Q6 | Operator deploy O1–O7 | human residual |

## v1.20–v1.24 — SHIPPED (autonomous batch)

| # | Item | Status |
|---|------|--------|
| R1 / v1.20 | Home discover SSOT + EmptyState LinkButton | **SHIPPED** |
| R2 / v1.21 | Ency IntersectionObserver load-more + family CV | **SHIPPED** |
| v1.22 | Components CTA migration (EB, PWA, Pro, Habitat, Result, …) | **SHIPPED** |
| v1.23 | architectureCtaContracts covers components; allowlist empty | **SHIPPED** |
| R4 / v1.24 | MlDashboard → Button/LinkButton; product raw clear | **SHIPPED** |
| R3 | Weak media re-harvest | **DEFERRED** operator/network |
| R5 | Operator deploy O1–O7 | human residual |

## v1.25–v1.29 — SHIPPED (autonomous batch B)

| # | Item | Status |
|---|------|--------|
| T1 / v1.25 | GamesHub decorative CTA (no cn-btn) | **SHIPPED** |
| T2 / v1.26 | Identify remove-image → Button | **SHIPPED** |
| T3 / v1.27 | `inventoryMediaHealth` + audit doc | **SHIPPED** |
| T4 / v1.28 | Safety surface contracts home/identify/result | **SHIPPED** |
| T5 | Operator deploy | human residual |

## v1.30–v1.34 — SHIPPED (autonomous batch C)

| # | Item | Status |
|---|------|--------|
| U1 / v1.30 | CameraCapture controls → Button | **SHIPPED** |
| U2 / v1.31 | UploadZone multi-view policy note + testids | **SHIPPED** |
| U3 / v1.32 | i18n namespaces + uploadTipsPolicy ES/EN/CA/EU | **SHIPPED** |
| U4 / v1.33 | PageShell wave (Identify/History/Education/Offline/Expert/Beta/Games) | **SHIPPED** |
| U5 | Operator deploy | human residual |

## v1.35–v1.39 — SHIPPED (autonomous batch D)

| # | Item | Status |
|---|------|--------|
| V1 / v1.35 | Community + Lookalike + Encyclopedia PageShell | **SHIPPED** |
| V2 / v1.36 | Quiz + Setadle + Wordle PageShell | **SHIPPED** |
| V3 / v1.37 | Identify lightbox dialog + Camera Escape/aria | **SHIPPED** |
| V4 / v1.38 | architectureCtaContracts PageShell core list | **SHIPPED** |
| V5 | Operator deploy | human residual |

## v1.40–v1.44 — SHIPPED (autonomous batch E)

| # | Item | Status |
|---|------|--------|
| W1 / v1.40 | Home + Detail + Map PageShell (`bare` for map) | **SHIPPED** |
| W2 / v1.41 | Login + Register PageShell bare | **SHIPPED** |
| W3 / v1.42 | DocumentTitle coverage test + nav.notFound/register | **SHIPPED** |
| W4 / v1.43 | BatchCompare dialog Escape/focus a11y | **SHIPPED** |
| W5 | Operator deploy | human residual |

## v1.48–v1.52 — SHIPPED (3h loop report gate)

| # | Item | Status |
|---|------|--------|
| 1.48 | Detail collapsibles + games primary + offline sticky + libre tip | **SHIPPED** |
| 1.49 | Food collapse + history + community 44px | **SHIPPED** |
| 1.50 | Quiz/lookalike/edu FAQ | **SHIPPED** |
| 1.51 | Setadle/Wordle/Expert + MlDashboard PageShell + 404 | **SHIPPED** |
| 1.52 | ResultCard compact + map 44px + beta sticky | **SHIPPED** |

## Next cycle `v1.53+` (3h loop continues)

| # | Item | Owner | Notes |
|---|------|-------|-------|
| **Y1** | Identify post-result residual | Autonomous | |
| **Y2** | Ency virtualize residual | Autonomous | |
| **Y3** | PWA install hint a11y | Autonomous | |
| **Y4** | Family guide density | Autonomous | |
| **Y5** | Operator deploy O1–O7 | **Human** | skip |

## Operator residual (P0 — human)

| # | Item | Owner |
|---|------|-------|
| O1–O5 | Deploy HTTPS + form + cohort | Operator |
| O6 | Unlock decision | Operator |
| O7 | Kew CSV | Operator |

## Residual audit (v1.13.0) — SHIPPED

| # | Item | Status |
|---|------|--------|
| R1–R10 | CA/EU, ErrorBoundary, a11y, mojibake, photos lazy, DocumentTitle, rate lock, SQLite, Alembic, errors | **SHIPPED** |

## Runtime stability (v1.14.0) — SHIPPED this cycle

| # | Item | Status |
|---|------|--------|
| S1 | Windows watchdog keeps 8000/5173/5174 alive | **SHIPPED** |
| S2 | start-visionsetil.bat + VBS detach | **SHIPPED** |
| S3 | Eager bottom-nav routes (no dynamic GamesHub fail) | **SHIPPED** |
| S4 | Lazy retry + ErrorBoundary hard reload | **SHIPPED** |
| S5 | npm preview:app / stable scripts | **SHIPPED** |

## Product FE (Campo nocturno)

| # | Item | Status |
|---|------|--------|
| B0 | Stitch 16-screen pack + ref-app | **SHIPPED** |
| B1 | Dark default + bottom nav + /juegos /mas | **SHIPPED** |
| B2 | Home calm B hero | **SHIPPED** v1.10 |
| B3 | campo-nocturno.css night skin global | **SHIPPED** v1.10 |
| B4 | Map Stitch restyle | **SKIP** — keep live map |
| B5 | Identify/result pixel match Stitch | **SHIPPED** v1.11 (glass + risk chip + lookalikes) |
| B6 | Setadle/Wordle/Reto deeper skin | **SHIPPED** v1.11.0 (glass tiles + Wordle states + Setadle cards + quiz pills) |
| B7 | Species detail gallery night | **SHIPPED** v1.11.0 (glass sections + gallery tiles + cream italic title) |
| B8 | Dual App/Web layout modes | **SHIPPED** v1.10.2 |
| B9 | Más de-dupe + real photo cascade | **SHIPPED** v1.10.3 |
| B10 | Competitive audit → UX copy (no edible) | **SHIPPED** doc |
| B11 | Dual build split (2 Vite apps, 2 ports) | **SHIPPED** v1.11.0 |
| B12 | Stitch design tokens SSOT (OLED, glass, cream, radii) | **SHIPPED** v1.11.0 |
| B13 | Material Symbols Outlined migration | **SHIPPED** v1.11.0 |
| B14 | Home pixel-match Stitch (pill CTA, trust row, quick grid, atmospheric) | **SHIPPED** v1.11.0 |
| B15 | Encyclopedia family-banded galleries (First-Nature pattern) | **SHIPPED** v1.11.0 |
| B16 | Educational dichotomous key (MushroomExpert-lite) | **SHIPPED** v1.11.0 |

## Photo integrity residual

| # | Item | Status |
|---|------|--------|
| P1 | Prefer catalog Wiki/iNat over weak local | **SHIPPED** |
| P2 | Remove crossOrigin breaking commons | **SHIPPED** |
| P3 | Re-scrape sub-15kb local cards | residual |
| P4 | Night “sin foto” placeholder | **SHIPPED** |
| P5 | Open API harvest script + probe report | **SHIPPED** |
| P6 | Full-catalog `harvest_open_media_apis --refresh` + CC filter | residual (operator/network) |
| P7 | Surface license attribution on ficha when iNat NC | residual |

## Competitive UX residual (legal patterns only)

| # | Item | Status |
|---|------|--------|
| C1 | Photo-first cascade (Wiki/iNat first, fast paint) | **CONFIRMED SHIPPED** |
| C2 | Encyclopedia by families | **SHIPPED** v1.11.0 (B15) |
| C3 | Season strip on Home | **CONFIRMED SHIPPED** |
| C4 | Dichotomous key | **SHIPPED** v1.11.0 (B16) |
| C5 | getUserMedia framing overlays (multi-view wizard) | **CONFIRMED SHIPPED** (CameraCapture.tsx guided multi-view + live silhouettes) |
| C6 | Community human-consensus loop depth | residual |

## Forbidden residual (do not pick up)

| # | Item | Reason |
|---|------|--------|
| X1 | Scrape Picture Mushroom / Shroomify / paid APKs | copyright + ToS |
| X2 | Extract proprietary model weights from apps | illegal / unethical |
| X3 | Bulk hotlink without UA / rate limit | blocks + ToS |

## Standing orders

1. Read STATE + BACKLOG  
2. Skip O*  
3. Ship one visual fidelity cycle with tests  
4. Never flip product_unlock · never forage  
5. **Do not restyle Spain map** unless user reverses B4  
6. **Never scrape paid apps / proprietary content** (X1-X3) — distill UX patterns only

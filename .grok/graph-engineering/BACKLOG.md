# Graph Engineering — Product backlog (post v1.13.0)

**Policy:** orientation only · never auto product_unlock · never forage.  
**Design direction:** **B Campo nocturno** · **Map stays as current product** (user lock).

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

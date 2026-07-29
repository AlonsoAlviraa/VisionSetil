# Graph Engineering — Product backlog (post v1.10.0)

**Policy:** orientation only · never auto product_unlock · never forage.  
**Design direction:** **B Campo nocturno** · **Map stays as current product** (user lock).

## Operator residual (P0 — human)

| # | Item | Owner |
|---|------|-------|
| O1–O5 | Deploy HTTPS + form + cohort | Operator |
| O6 | Unlock decision | Operator |
| O7 | Kew CSV | Operator |

## Product FE (Campo nocturno)

| # | Item | Status |
|---|------|--------|
| B0 | Stitch 16-screen pack + ref-app | **SHIPPED** |
| B1 | Dark default + bottom nav + /juegos /mas | **SHIPPED** |
| B2 | Home calm B hero | **SHIPPED** v1.10 |
| B3 | campo-nocturno.css night skin global | **SHIPPED** v1.10 |
| B4 | Map Stitch restyle | **SKIP** — keep live map |
| B5 | Identify/result pixel match Stitch | residual iterate |
| B6 | Setadle/Wordle/Reto deeper skin | residual |
| B7 | Species detail gallery night | residual |
| B8 | Dual App/Web layout modes | **SHIPPED** v1.10.2 |
| B9 | Más de-dupe + real photo cascade | **SHIPPED** v1.10.3 |
| B10 | Competitive audit → UX copy (no edible) | **SHIPPED** doc |

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

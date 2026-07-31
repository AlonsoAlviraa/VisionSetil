# Media health inventory (offline)

**Date:** 2026-07-30  
**Cycle:** v1.27  
**Method:** `inventoryMediaHealth()` / `verifySpeciesMediaCatalog()` — no network, no forage.

## Policy

- Prefer catalog Wiki/iNat URLs over weak local cards (photo integrity P1 shipped).
- Full re-harvest of sub-15kb local cards remains **operator/network** residual (P3/P6).
- Product must always resolve a display URL (terminal SVG fallback).

## How to re-run

```bash
cd frontend
npx vitest run src/lib/speciesMediaVerify.test.ts
```

Or from a REPL/script:

```ts
import { inventoryMediaHealth } from './src/lib/speciesMediaVerify'
console.log(inventoryMediaHealth())
```

## Expected gates (unit)

| Metric | Gate |
|--------|------|
| `resolveCoverage` | `1` |
| `catalogRemoteCoverage` | `> 0.4` |
| `withLocalPath` | equals catalog count |
| `allStacksTerminal` | true |

## Residual

- Operator: optional `harvest_open_media_apis --refresh` for weak locals (never scrape paid apps).

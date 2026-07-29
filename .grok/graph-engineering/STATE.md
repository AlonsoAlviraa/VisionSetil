# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering (runtime stability · never crash UX)  
**Updated:** 2026-07-29  
**Goal:** Dev servers that stay up · primary routes never blank · never product_unlock · never forage

## Active graph version

`v1.14.0-stable-dev-runtime`

## Current status

| Area | Status | Notes |
|------|--------|--------|
| Residual audit FE/BE | **SHIPPED** | v1.13.0 |
| Dev watchdog (API+App+Web) | **SHIPPED** | `scripts/dev-watchdog.ps1` + `start-visionsetil.bat` |
| Primary routes eager | **SHIPPED** | Home, Identify, Enciclopedia, Juegos, Mapa, Más |
| Lazy secondary + retry | **SHIPPED** | detail/auth/games modes with reload on fail |
| Photos local-first + wiki sizes | **SHIPPED** | 250/500/1280; no 320/640 |
| Dual build | **SHIPPED** | 5173/5174 |
| product_unlock | **BLOCKED** | false |

## Residual next

1. Operator deploy O1–O7  
2. Native CA/EU copy polish  
3. Optional: `npm run stable` (build+preview) for demos without HMR  
4. P3 weak media re-harvest  

## How to run (operator / user)

1. Double-click **`start-visionsetil.bat`** at repo root  
2. Open **http://127.0.0.1:5173/** (never https)  
3. Watchdog log: `logs/dev-watchdog.log`  

## product_unlock

Always **false**.

# VisionSetil · Dual layout modes

Two presentation shells share the same routes, API and safety policy.

| Mode | Class | Target | Look |
|------|--------|--------|------|
| **App** | `app--mode-app` | iOS App Store, Google Play, PWA standalone, phones | Phone canvas · Stitch B Campo nocturno · bottom nav |
| **Web** | `app--mode-web` | Desktop / tablet browser | Wide page · large type · multi-column · top nav |

## Resolution order

1. URL: `?layout=app` or `?layout=web`
2. `localStorage.visionsetil_layout_mode`
3. Auto:
   - `display-mode: standalone` or iOS standalone → **app**
   - viewport width &lt; 900px → **app**
   - otherwise → **web**

## User control

Header toggle **App | Web** (`data-testid="layout-mode-toggle"`). Preference is persisted.

## Files

- `frontend/src/lib/layoutMode.ts` — resolve / store
- `frontend/src/hooks/useLayoutMode.ts` — React hook
- `frontend/src/components/LayoutModeToggle.tsx` — UI control
- `frontend/src/styles/campo-nocturno.css` — app shell (default)
- `frontend/src/styles/campo-nocturno-web.css` — web shell (`.app--mode-web`)

## Store packaging note

Capacitor / TWA / PWA standalone should land in **app** mode automatically. Browser marketing pages land in **web** mode on large screens.

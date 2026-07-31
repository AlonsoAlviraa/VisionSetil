/**
 * Dual-build split (v1.11) — build-time forced layout mode.
 *
 * Each Vite app (`vite --mode app` / `vite --mode web`) bakes its target via
 * `VITE_LAYOUT_MODE`, eliminating the runtime toggle for a clean two-app split.
 * The value is injected by `vite.config.ts` from the selected build target.
 *
 * Returns `null` when not set (single-app / legacy / test environment) so the
 * reactive `useLayoutMode` hook keeps driving mode resolution as before.
 */
import type { LayoutMode } from '../lib/layoutMode'

export const FORCED_LAYOUT_MODE: LayoutMode | null =
  import.meta.env.VITE_LAYOUT_MODE === 'app' ||
  import.meta.env.VITE_LAYOUT_MODE === 'web'
    ? (import.meta.env.VITE_LAYOUT_MODE as LayoutMode)
    : null

export function isForcedApp(): boolean {
  return FORCED_LAYOUT_MODE === 'app'
}

export function isForcedWeb(): boolean {
  return FORCED_LAYOUT_MODE === 'web'
}

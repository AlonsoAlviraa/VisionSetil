/**
 * Thin JS entry — Vite prefers vite.config.js over .ts when both exist.
 * Keep the real config in vite.config.ts (media middleware, PWA, proxy).
 */
import { defineConfig } from 'vite'
import { loadConfigFromFile } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Re-export TypeScript config by dynamic import of the compiled logic.
// Simpler: duplicate import of the .ts file via Vite's native TS config support
// by deleting this file — but npm scripts may rely on .js existence.
//
// Solution: implement the full config here by importing from the .ts module.
export { default } from './vite.config.ts'

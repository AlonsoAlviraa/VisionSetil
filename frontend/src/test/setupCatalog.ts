/** Vitest setup: hydrate code-split catalog before tests that import speciesCatalog. */
import { beforeAll } from 'vitest'
import { loadSpeciesCatalog } from '../data/speciesCatalog'

beforeAll(async () => {
  await loadSpeciesCatalog()
})

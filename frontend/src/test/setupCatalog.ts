/** Vitest setup: hydrate code-split catalog + photo map before tests. */
import { beforeAll } from 'vitest'
import { loadSpeciesCatalog } from '../data/speciesCatalog'
import { hydrateSpeciesPhotos } from '../lib/speciesImageService'

beforeAll(async () => {
  await Promise.all([loadSpeciesCatalog(), hydrateSpeciesPhotos()])
})

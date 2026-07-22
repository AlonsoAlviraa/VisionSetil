/**
 * Pure builders for procedural mushroom geometry parameters.
 * Separated from Three.js so unit tests can verify the math without WebGL.
 */

export type MushroomMorph = {
  stemHeight: number
  stemRadius: number
  capRadius: number
  capHeight: number
  tilt: number
  hue: number
}

/** Deterministic hash 0..1 from integer seed. */
export function seedUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Build a ring of mushroom morphs for a forest floor scene. */
export function buildMushroomRing(
  count: number,
  radius = 2.2,
  seed = 42,
): Array<MushroomMorph & { x: number; z: number; y: number }> {
  const n = Math.max(1, Math.floor(count))
  const out: Array<MushroomMorph & { x: number; z: number; y: number }> = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const rJitter = radius * (0.75 + seedUnit(seed + i) * 0.45)
    const stemHeight = 0.45 + seedUnit(seed + i * 3) * 0.55
    const stemRadius = 0.06 + seedUnit(seed + i * 5) * 0.05
    const capRadius = 0.22 + seedUnit(seed + i * 7) * 0.28
    const capHeight = 0.1 + seedUnit(seed + i * 11) * 0.14
    out.push({
      x: Math.cos(t) * rJitter,
      z: Math.sin(t) * rJitter,
      y: 0,
      stemHeight,
      stemRadius,
      capRadius,
      capHeight,
      tilt: (seedUnit(seed + i * 13) - 0.5) * 0.35,
      hue: 0.05 + seedUnit(seed + i * 17) * 0.12,
    })
  }
  return out
}

/** Spore particle positions in a rising column. */
export function buildSporeCloud(
  count: number,
  seed = 7,
): Array<{ x: number; y: number; z: number; speed: number }> {
  const n = Math.max(1, Math.floor(count))
  const pts: Array<{ x: number; y: number; z: number; speed: number }> = []
  for (let i = 0; i < n; i++) {
    const a = seedUnit(seed + i) * Math.PI * 2
    const r = seedUnit(seed + i * 2) * 1.8
    pts.push({
      x: Math.cos(a) * r,
      y: seedUnit(seed + i * 3) * 2.5,
      z: Math.sin(a) * r,
      speed: 0.15 + seedUnit(seed + i * 4) * 0.45,
    })
  }
  return pts
}

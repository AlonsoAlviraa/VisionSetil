/**
 * Always-available professional mycology SVG placeholders (no network).
 * Soft studio look — never broken, never emoji.
 */

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0
  return h
}

/** Cap palettes inspired by real Iberian fungi */
const CAPS = [
  '#b5451b', // amanita red
  '#6b4a2e', // bolete brown
  '#c4a35a', // chanterelle gold
  '#4a5c48', // olive deadly
  '#8b5a2b', // oak brown
  '#5a7d68', // moss green
  '#7a3e2e', // wine cap
  '#3d4a3c', // dark olive
]
const STEMS = ['#f2ebe0', '#e8dcc8', '#efe6d8', '#ddd2c2']
const BG_TOP = ['#f7f4ed', '#f0ebe3', '#f5f1e8', '#ebe6db']
const BG_BOT = ['#e0d8c8', '#d5cec0', '#e8e2d6', '#cfc6b6']

/** Data-URI SVG of a refined mushroom study plate. */
export function mycologyPlaceholderDataUri(taxon: string, risk?: string): string {
  const h = hash(taxon || 'fungi')
  let cap = CAPS[h % CAPS.length]
  const r = (risk || '').toLowerCase()
  if (r === 'deadly') cap = '#6b2f2a'
  if (r === 'poisonous' || r === 'toxic') cap = '#8b3a2a'
  const stem = STEMS[(h >> 3) % STEMS.length]
  const bg0 = BG_TOP[(h >> 5) % BG_TOP.length]
  const bg1 = BG_BOT[(h >> 7) % BG_BOT.length]
  const deadly = r === 'deadly'
  const spots = deadly || h % 4 === 0
  const spotCircles = spots
    ? Array.from({ length: deadly ? 8 : 5 }, (_, i) => {
        const a = (i / (deadly ? 8 : 5)) * Math.PI * 2 + 0.3
        const rx = 26 + (i % 3) * 3
        const ry = 12 + (i % 2) * 2
        const cx = 100 + Math.cos(a) * rx
        const cy = 72 + Math.sin(a) * ry
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${deadly ? 4.2 : 3.6}" fill="#f7f2ea" opacity="0.88"/>`
      }).join('')
    : ''

  const label = escapeXml((taxon || 'Fungi').slice(0, 32))

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </linearGradient>
    <radialGradient id="capg" cx="38%" cy="32%" r="72%">
      <stop offset="0%" stop-color="${cap}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${cap}" stop-opacity="0.78"/>
    </radialGradient>
    <linearGradient id="stemg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${stem}" stop-opacity="0.85"/>
      <stop offset="45%" stop-color="${stem}"/>
      <stop offset="100%" stop-color="${stem}" stop-opacity="0.75"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="b"/>
      <feOffset dy="1" result="o"/>
      <feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="200" height="200" fill="url(#bg)"/>
  <ellipse cx="100" cy="172" rx="52" ry="7" fill="#000" opacity="0.06"/>
  <g filter="url(#soft)">
    <rect x="91" y="96" width="18" height="68" rx="9" fill="url(#stemg)"/>
    <path d="M38 102 Q40 52 100 48 Q160 52 162 102 Z" fill="url(#capg)"/>
    <ellipse cx="100" cy="102" rx="62" ry="9" fill="#f3ebe0" opacity="0.92"/>
    ${spotCircles}
  </g>
  <text x="100" y="192" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="7.5" fill="#5c665f" font-style="italic" letter-spacing="0.3">${label}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  )
}

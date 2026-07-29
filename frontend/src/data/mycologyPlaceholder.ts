/**
 * Flat “no real photo” brand plate — NOT a 3D/studio mushroom illustration.
 * Product policy: prefer real field photos; never show fake 3D models as if photos.
 */

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0
  return h
}

/** Data-URI SVG: flat green plate + text only (no mushroom geometry). */
export function mycologyPlaceholderDataUri(taxon: string, risk?: string): string {
  const name = (taxon || 'Fungi').replace(/[<>&"']/g, '')
  const r = (risk || '').toLowerCase()
  const deadly = r === 'deadly'
  const toxic = r === 'poisonous' || r === 'toxic'
  const bg = deadly ? '#3a2424' : toxic ? '#3a3224' : '#2d3a2e'
  const accent = deadly ? '#c45c5c' : toxic ? '#c4a05c' : '#7a9b7a'
  const h = hash(name)
  const label =
    name.length > 36 ? `${name.slice(0, 34)}…` : name || 'Sin foto de campo'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360" role="img" aria-label="Sin foto real">
  <rect width="480" height="360" fill="${bg}"/>
  <rect x="24" y="24" width="432" height="312" rx="12" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>
  <text x="240" y="150" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" fill="rgba(255,255,255,0.55)">Sin foto real</text>
  <text x="240" y="185" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="rgba(255,255,255,0.88)">${label}</text>
  <text x="240" y="220" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="rgba(255,255,255,0.4)">VisionSetil · solo fotos de campo</text>
  <text x="24" y="348" font-family="system-ui,sans-serif" font-size="10" fill="rgba(255,255,255,0.2)">#${(h % 9999).toString(16)}</text>
</svg>`

  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

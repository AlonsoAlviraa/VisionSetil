/**
 * Identify photo path — shared JPEG edge cap + budgets.
 *
 * Used by free upload, MultiViewWizard gallery, and CameraCapture so both
 * shells (app :5173 / web :5174) ship the same encode contract.
 *
 * Policy: orientation only · never forage · never product_unlock.
 */

/** Long-edge ceiling for classify upload + preview decode (field phones). */
export const IDENTIFY_JPEG_MAX_EDGE = 1280

/** JPEG quality for capture / re-encode (balance size vs texture). */
export const IDENTIFY_JPEG_QUALITY = 0.82

/** Soft byte budget after re-encode (advisory; not a hard reject). */
export const IDENTIFY_JPEG_SOFT_MAX_BYTES = 1_200_000

/** Performance budgets documented for launch readiness / Lighthouse notes. */
export const IDENTIFY_PHOTO_PERF_BUDGETS = {
  jpegMaxEdge: IDENTIFY_JPEG_MAX_EDGE,
  jpegQuality: IDENTIFY_JPEG_QUALITY,
  softMaxBytes: IDENTIFY_JPEG_SOFT_MAX_BYTES,
  /** User-selected previews must not use lazy (blob: + above-fold). */
  previewLoading: 'eager' as const,
  /** Avoid continuous layout thrash: fixed aspect-ratio preview boxes. */
  previewAspectRatio: '4/3',
  /** Multi-view coach panel is progressive, never hard-block by default. */
  coachMode: 'soft_progressive',
} as const

function isBrowserImageApiAvailable(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof Image !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  )
}

/**
 * Downscale long edge to ≤ IDENTIFY_JPEG_MAX_EDGE and re-encode as JPEG.
 * Fail-open: returns the original File if canvas/decode is unavailable.
 */
export async function prepareIdentifyImageFile(file: File): Promise<File> {
  if (!file || !file.type.startsWith('image/')) return file
  if (!isBrowserImageApiAvailable()) return file

  // Tiny fixtures (e2e 1×1 PNG) — skip encode cost
  if (file.size > 0 && file.size < 512) return file

  const objectUrl = URL.createObjectURL(file)
  try {
    const dims = await loadImageNaturalSize(objectUrl)
    if (!dims) return file

    const { width, height } = dims
    const maxEdge = Math.max(width, height)
    const alreadyJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg'
    if (maxEdge <= IDENTIFY_JPEG_MAX_EDGE && alreadyJpeg && file.size <= IDENTIFY_JPEG_SOFT_MAX_BYTES) {
      return file
    }

    const scale = Math.min(1, IDENTIFY_JPEG_MAX_EDGE / maxEdge)
    const tw = Math.max(1, Math.round(width * scale))
    const th = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    const img = await loadHtmlImage(objectUrl)
    if (!img) return file
    ctx.drawImage(img, 0, 0, tw, th)

    const blob = await canvasToJpegBlob(canvas, IDENTIFY_JPEG_QUALITY)
    if (!blob) return file

    const base = file.name.replace(/\.[^.]+$/, '') || 'identify'
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function loadImageNaturalSize(
  src: string,
): Promise<{ width: number; height: number } | null> {
  return loadHtmlImage(src).then((img) => {
    if (!img) return null
    const width = img.naturalWidth || 0
    const height = img.naturalHeight || 0
    if (width < 1 || height < 1) return null
    return { width, height }
  })
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    } catch {
      resolve(null)
    }
  })
}

/** Pure helper for tests / contracts — scale factor for a given long edge. */
export function identifyJpegScale(width: number, height: number): number {
  const maxEdge = Math.max(width, height)
  if (maxEdge <= 0) return 1
  return Math.min(1, IDENTIFY_JPEG_MAX_EDGE / maxEdge)
}

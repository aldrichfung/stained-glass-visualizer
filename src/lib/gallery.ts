export interface GalleryImage {
  id: string
  name: string
  img: HTMLImageElement | HTMLCanvasElement
  /** object URL (uploaded) or data URL (demo) — used for thumbnails */
  url: string
}

let counter = 0

export function genImageId(): string {
  return `img-${Date.now().toString(36)}-${(counter++).toString(36)}`
}

export function imgDims(img: HTMLImageElement | HTMLCanvasElement): [number, number] {
  return 'naturalWidth' in img ? [img.naturalWidth, img.naturalHeight] : [img.width, img.height]
}

/** Load an image File into a GalleryImage; resolves null on decode failure. */
export function loadGalleryImage(f: File): Promise<GalleryImage | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => resolve({ id: genImageId(), name: f.name, img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/* ---- pad image copies -------------------------------------------------- */

export const PAD_IMAGE_MAX_DIM = 1280
export const PAD_IMAGE_QUALITY = 0.85

/**
 * Downscale-encode a gallery image into a JPEG data URL so a pad can own a
 * copy of it. Returns null when encoding is impossible (tainted canvas,
 * missing dimensions, storage-hostile size).
 */
export function snapshotImage(
  image: GalleryImage,
  maxDim = PAD_IMAGE_MAX_DIM,
  quality = PAD_IMAGE_QUALITY,
): string | null {
  try {
    const [w, h] = imgDims(image.img)
    if (!w || !h) return null
    const scale = Math.min(1, maxDim / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image.img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
}

/** Rebuild a GalleryImage from a pad's stored copy, under the original id. */
export function galleryImageFromDataURL(
  id: string,
  name: string,
  dataUrl: string,
): Promise<GalleryImage | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ id, name, img, url: dataUrl })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export const MAX_IMAGES = 5

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

/** Downscale cap for the image copy stored inside a pad preset — plenty for
 *  the ≤1400px bake pipeline, small enough that 4 pads fit the ~5MB
 *  localStorage quota with room to spare. */
export const PAD_IMAGE_MAX_DIM = 1280
export const PAD_IMAGE_QUALITY = 0.85

/** Snapshot an image as a downscaled JPEG dataURL (the pad's own durable
 *  copy). Returns null if the image can't be drawn (e.g. not decoded yet). */
export function snapshotImage(
  img: HTMLImageElement | HTMLCanvasElement,
  maxDim = PAD_IMAGE_MAX_DIM,
  quality = PAD_IMAGE_QUALITY,
): string | null {
  try {
    const [iw, ih] = imgDims(img)
    if (!iw || !ih) return null
    const scale = Math.min(1, maxDim / Math.max(iw, ih))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(iw * scale))
    canvas.height = Math.max(1, Math.round(ih * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
}

/** Rebuild a GalleryImage from a pad's stored copy (dataURL). The given id
 *  is reused so bake-cache keys stay consistent across sessions. */
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

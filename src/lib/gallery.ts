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

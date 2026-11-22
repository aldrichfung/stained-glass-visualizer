import { Delaunay } from 'd3-delaunay'
import { slic } from './slic'
import type { GlassConfig, PatternMode } from '../config'

/**
 * Tessellation: turns a reference image + pattern mode into a set of
 * polygonal glass cells with base colors sampled from the image.
 */

export interface Cell {
  /** flat [x0,y0,x1,y1,...] polygon */
  poly: Float32Array
  cx: number
  cy: number
  r: number
  g: number
  b: number
  band: number // 0..4
  phase: number
}

export interface Tessellation {
  cells: Cell[]
  width: number
  height: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomSites(w: number, h: number, k: number): Array<[number, number]> {
  const rand = mulberry32(1337)
  const pts: Array<[number, number]> = []
  for (let i = 0; i < k; i++) pts.push([rand() * w, rand() * h])
  return pts
}

function honeycombSites(w: number, h: number, k: number): Array<[number, number]> {
  // hex lattice sized so total count ≈ k
  const cellArea = (w * h) / k
  const s = Math.sqrt(cellArea / (Math.sqrt(3) / 2)) // horizontal pitch
  const vs = (s * Math.sqrt(3)) / 2
  const pts: Array<[number, number]> = []
  let row = 0
  for (let y = vs / 2; y < h + vs; y += vs, row++) {
    const off = row % 2 === 0 ? 0 : s / 2
    for (let x = off + s / 2; x < w + s; x += s) {
      pts.push([Math.min(w - 1, x), Math.min(h - 1, y)])
    }
  }
  return pts
}

/** Sample the mean image color inside a polygon (centroid + interior probes). */
function sampleColor(
  img: Uint8ClampedArray,
  w: number,
  poly: Float32Array,
  cx: number,
  cy: number,
): [number, number, number] {
  const probes: Array<[number, number]> = [[cx, cy]]
  const n = poly.length / 2
  const stride = Math.max(1, Math.floor(n / 4))
  for (let i = 0; i < n; i += stride) {
    probes.push([cx + (poly[i * 2] - cx) * 0.45, cy + (poly[i * 2 + 1] - cy) * 0.45])
  }
  let r = 0
  let g = 0
  let b = 0
  let cnt = 0
  for (const [px, py] of probes) {
    const x = Math.max(0, Math.min(w - 1, Math.round(px)))
    const y = Math.max(0, Math.min((img.length / 4 / w) - 1, Math.round(py)))
    const idx = (y * w + x) * 4
    r += img[idx]
    g += img[idx + 1]
    b += img[idx + 2]
    cnt++
  }
  return [r / cnt, g / cnt, b / cnt]
}

function assignBand(
  cx: number,
  cy: number,
  w: number,
  h: number,
  mode: GlassConfig['mapping'],
  rand: () => number,
): number {
  let t: number
  if (mode === 'radial') {
    const dx = (cx - w / 2) / (w / 2)
    const dy = (cy - h / 2) / (h / 2)
    t = Math.min(1, Math.sqrt(dx * dx + dy * dy))
  } else if (mode === 'horizontal') {
    t = cx / w
  } else {
    return Math.floor(rand() * 5)
  }
  return Math.min(4, Math.floor(t * 5))
}

function adjustColor(
  r: number,
  g: number,
  b: number,
  mode: GlassConfig['colorMode'],
): [number, number, number] {
  if (mode === 'true') return [r, g, b]
  const mx = Math.max(r, g, b) / 255
  const mn = Math.min(r, g, b) / 255
  const l = (mx + mn) / 2
  if (mode === 'mono') {
    // ember: map luminance to a warm glass ramp
    const v = Math.pow(l, 0.9)
    return [Math.round(255 * Math.min(1, v * 1.25)), Math.round(160 * v * v + 20 * v), Math.round(60 * v * v)]
  }
  // jewel: pull saturation up, lightness into a deep high-contrast band —
  // real stained glass crushes shadows and blazes in the lights
  let s = mx === mn ? 0 : l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn)
  s = Math.min(1, s * 0.4 + 0.66)
  const l2 = Math.min(0.58, Math.max(0.18, Math.pow(l, 1.25) * 0.62 + 0.16))
  const hue = hueOf(r / 255, g / 255, b / 255, mx, mn)
  return hslToRgb(hue, s, l2)
}

function hueOf(r: number, g: number, b: number, mx: number, mn: number): number {
  if (mx === mn) return 0
  const d = mx - mn
  let h: number
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (mx === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return h
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)]
}

export interface TessellateInput {
  imageData: ImageData
  pattern: PatternMode
  density: number
  mapping: GlassConfig['mapping']
  colorMode: GlassConfig['colorMode']
}

export function tessellate({ imageData, pattern, density, mapping, colorMode }: TessellateInput): Tessellation {
  const { width: w, height: h, data } = imageData
  const rand = mulberry32(42)

  let sites: Array<[number, number]>
  let siteColors: Array<[number, number, number]> | null = null

  if (pattern === 'structure') {
    // SLIC on a downsampled copy for speed; scale centers back up
    const scale = Math.min(1, 360 / Math.max(w, h))
    const sw = Math.max(2, Math.round(w * scale))
    const sh = Math.max(2, Math.round(h * scale))
    const small = new Uint8ClampedArray(sw * sh * 4)
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const sx = Math.min(w - 1, Math.round(x / scale))
        const sy = Math.min(h - 1, Math.round(y / scale))
        const si = (sy * w + sx) * 4
        const di = (y * sw + x) * 4
        small[di] = data[si]
        small[di + 1] = data[si + 1]
        small[di + 2] = data[si + 2]
        small[di + 3] = 255
      }
    }
    const clusters = slic(small, sw, sh, density)
    // jitter the sites so cells read as irregular glass, not a pixel grid
    const step = Math.sqrt((w * h) / Math.max(1, clusters.length))
    const jitter = mulberry32(7)
    sites = clusters.map(
      (c) =>
        [
          Math.min(w - 1, Math.max(0, c.x / scale + (jitter() - 0.5) * step * 0.9)),
          Math.min(h - 1, Math.max(0, c.y / scale + (jitter() - 0.5) * step * 0.9)),
        ] as [number, number],
    )
    siteColors = clusters.map((c) => [c.r, c.g, c.b] as [number, number, number])
  } else if (pattern === 'honeycomb') {
    sites = honeycombSites(w, h, density)
  } else {
    sites = randomSites(w, h, density)
  }

  if (sites.length < 3) {
    sites = randomSites(w, h, Math.max(20, density))
    siteColors = null
  }

  const delaunay = Delaunay.from(sites)
  const voronoi = delaunay.voronoi([0, 0, w, h])

  const cells: Cell[] = []
  for (let i = 0; i < sites.length; i++) {
    const polygon = voronoi.cellPolygon(i)
    if (!polygon || polygon.length < 4) continue
    const poly = new Float32Array((polygon.length - 1) * 2)
    let cx = 0
    let cy = 0
    for (let p = 0; p < polygon.length - 1; p++) {
      poly[p * 2] = polygon[p][0]
      poly[p * 2 + 1] = polygon[p][1]
      cx += polygon[p][0]
      cy += polygon[p][1]
    }
    const n = polygon.length - 1
    cx /= n
    cy /= n
    const [r0, g0, b0] = siteColors ? siteColors[i] : sampleColor(data, w, poly, cx, cy)
    const [r, g, b] = adjustColor(r0, g0, b0, colorMode)
    cells.push({ poly, cx, cy, r, g, b, band: assignBand(cx, cy, w, h, mapping, rand), phase: rand() * Math.PI * 2 })
  }
  return { cells, width: w, height: h }
}

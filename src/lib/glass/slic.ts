/**
 * Compact SLIC superpixel segmentation.
 * Returns cluster centers (x, y) and mean colors — used as Voronoi sites so
 * the glass cells follow the actual structure of the reference image.
 */

export interface SlicCluster {
  x: number
  y: number
  r: number
  g: number
  b: number
  count: number
}

export function slic(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetClusters: number,
  iterations = 6,
  compactness = 5,
): SlicCluster[] {
  const step = Math.max(2, Math.round(Math.sqrt((width * height) / targetClusters)))
  const nx = Math.max(1, Math.round(width / step))
  const ny = Math.max(1, Math.round(height / step))

  // seed centers on a grid, nudged to the lowest-gradient position in 3x3
  const centers: SlicCluster[] = []
  const px = (x: number, y: number, c: number) => data[(y * width + x) * 4 + c]
  for (let gy = 0; gy < ny; gy++) {
    for (let gx = 0; gx < nx; gx++) {
      let x = Math.min(width - 1, Math.round((gx + 0.5) * step))
      let y = Math.min(height - 1, Math.round((gy + 0.5) * step))
      let best = Infinity
      let bx = x
      let by = y
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = x + dx
          const cy = y + dy
          if (cx < 1 || cy < 1 || cx >= width - 1 || cy >= height - 1) continue
          const grad =
            Math.abs(px(cx + 1, cy, 0) - px(cx - 1, cy, 0)) +
            Math.abs(px(cx, cy + 1, 0) - px(cx, cy - 1, 0)) +
            Math.abs(px(cx + 1, cy, 1) - px(cx - 1, cy, 1)) +
            Math.abs(px(cx, cy + 1, 1) - px(cx, cy - 1, 1))
          if (grad < best) {
            best = grad
            bx = cx
            by = cy
          }
        }
      }
      centers.push({ x: bx, y: by, r: px(bx, by, 0), g: px(bx, by, 1), b: px(bx, by, 2), count: 0 })
    }
  }

  const labels = new Int32Array(width * height).fill(-1)
  const dist = new Float32Array(width * height)
  const inv = 1 / (compactness * compactness)

  for (let iter = 0; iter < iterations; iter++) {
    dist.fill(Infinity)
    for (let ci = 0; ci < centers.length; ci++) {
      const c = centers[ci]
      const x0 = Math.max(0, Math.floor(c.x - step))
      const x1 = Math.min(width - 1, Math.ceil(c.x + step))
      const y0 = Math.max(0, Math.floor(c.y - step))
      const y1 = Math.min(height - 1, Math.ceil(c.y + step))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * width + x
          const dr = px(x, y, 0) - c.r
          const dg = px(x, y, 1) - c.g
          const db = px(x, y, 2) - c.b
          const dc = dr * dr + dg * dg + db * db
          const dx = x - c.x
          const dy = y - c.y
          const ds = (dx * dx + dy * dy) / (step * step)
          const d = dc * inv + ds
          if (d < dist[i]) {
            dist[i] = d
            labels[i] = ci
          }
        }
      }
    }
    // recompute centers
    for (const c of centers) {
      c.x = 0
      c.y = 0
      c.r = 0
      c.g = 0
      c.b = 0
      c.count = 0
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = centers[labels[y * width + x]]
        c.x += x
        c.y += y
        c.r += px(x, y, 0)
        c.g += px(x, y, 1)
        c.b += px(x, y, 2)
        c.count++
      }
    }
    for (const c of centers) {
      if (c.count > 0) {
        c.x /= c.count
        c.y /= c.count
        c.r /= c.count
        c.g /= c.count
        c.b /= c.count
      }
    }
  }
  return centers.filter((c) => c.count > 0)
}

import type { GlassConfig, WindowShape } from '../config'

/**
 * Window geometry: computes the opening's bounding box (aspect-aware of the
 * uploaded image in `contain` fit mode) and builds the outline path for the
 * various window presets. Shared by the image-placement code and the renderer
 * so the glass, the clip, and the light all agree on the opening.
 */

export interface WindowBox {
  x0: number
  y0: number
  x1: number
  y1: number
  cx: number
  cy: number
  w: number
  h: number
}

const SHAPE_ASPECT: Record<WindowShape, number> = {
  arch: 0.62,
  romanesque: 0.66,
  lancets: 0.78,
  quatrefoil: 1.0,
  rose: 1.0,
  full: 1.0, // unused: 'full' returns early below
}

export function computeWindowBox(
  W: number,
  H: number,
  cfg: Pick<GlassConfig, 'windowShape' | 'windowSize' | 'windowAspect' | 'fitMode'>,
  imgAspect: number,
): WindowBox {
  const s = cfg.windowSize
  let w: number
  let h: number
  if (cfg.windowShape === 'full') {
    w = W
    h = H
  } else if (cfg.fitMode === 'contain' && imgAspect > 0) {
    // opening takes the image's aspect; size slider scales it
    h = H * 0.94 * s
    w = h * imgAspect
    if (w > W * 0.96) {
      w = W * 0.96
      h = w / imgAspect
    }
  } else {
    const baseA = SHAPE_ASPECT[cfg.windowShape]
    h = H * 0.92 * s
    w = h * baseA * cfg.windowAspect
    if (w > W * 0.97) {
      w = W * 0.97
      h = w / (baseA * cfg.windowAspect)
    }
  }
  const cx = W / 2
  const cy = H / 2
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, w, h }
}

/** Pointed-arch sub-path within a sub-box, reused by arch + lancets. */
function pointedArch(p: Path2D, x0: number, y0: number, x1: number, y1: number) {
  const w = x1 - x0
  const cx = (x0 + x1) / 2
  const ys = y0 + w * 0.62 // springing line
  p.moveTo(x0, y1)
  p.lineTo(x0, ys)
  p.quadraticCurveTo(x0 + w * 0.04, y0 + (ys - y0) * 0.06, cx, y0)
  p.quadraticCurveTo(x1 - w * 0.04, y0 + (ys - y0) * 0.06, x1, ys)
  p.lineTo(x1, y1)
  p.closePath()
}

export function buildWindowPath(
  shape: WindowShape,
  box: WindowBox,
  W: number,
  H: number,
): Path2D {
  const p = new Path2D()
  const { x0, y0, x1, y1, cx, cy, w, h } = box
  switch (shape) {
    case 'full':
      p.rect(0, 0, W, H)
      return p
    case 'rose':
      p.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
      return p
    case 'arch':
      pointedArch(p, x0, y0, x1, y1)
      return p
    case 'romanesque': {
      const r = w / 2
      const springY = y1 - r // round arch: vertical sides + semicircle
      p.moveTo(x0, y1)
      p.lineTo(x0, springY)
      p.arc(cx, springY, r, Math.PI, 0)
      p.lineTo(x1, y1)
      p.closePath()
      return p
    }
    case 'lancets': {
      const gap = w * 0.1
      const lw = (w - gap) / 2
      pointedArch(p, x0, y0 + h * 0.06, x0 + lw, y1)
      pointedArch(p, x0 + lw + gap, y0 + h * 0.06, x1, y1)
      return p
    }
    case 'quatrefoil': {
      // four-lobed outline via polar union of four circles
      const r = Math.min(w, h) / 2
      const d = r * 0.6
      const lobes = [
        [cx, cy - d],
        [cx + d, cy],
        [cx, cy + d],
        [cx - d, cy],
      ]
      const lr = d
      const N = 160
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2
        const dx = Math.cos(th)
        const dy = Math.sin(th)
        let best = 0
        for (const [ox, oy] of lobes) {
          const ccx = ox - cx
          const ccy = oy - cy
          const cLen2 = ccx * ccx + ccy * ccy
          const proj = ccx * dx + ccy * dy
          const disc = lr * lr - cLen2 + proj * proj
          if (disc <= 0) continue
          const rr = proj + Math.sqrt(disc)
          if (rr > best) best = rr
        }
        const px = cx + dx * best
        const py = cy + dy * best
        if (i === 0) p.moveTo(px, py)
        else p.lineTo(px, py)
      }
      p.closePath()
      return p
    }
  }
}

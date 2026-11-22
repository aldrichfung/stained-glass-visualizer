import type { Cell, Tessellation } from './tessellate'
import type { AudioFeatures } from '../audio/engine'
import type { GlassConfig } from '../config'

/**
 * Reactive stained-glass renderer.
 *
 * A static "glass panel" layer (darkened cells, hand-lit gradient, lead came)
 * is precomputed whenever the tessellation or static config changes. Each
 * frame we redraw that layer, then additively paint per-cell backlight glow
 * driven by the audio bands, plus an optional lead flash on beats.
 */

export class GlassRenderer {
  private cells: Cell[] = []
  private paths: Path2D[] = []
  private env: Float32Array = new Float32Array(0)
  private staticLayer: HTMLCanvasElement | null = null
  private width = 0
  private height = 0
  private staticKey = ''
  private lastFrame = 0

  /** Rebuild cells + static layer when the key changes. */
  setScene(tess: Tessellation | null, cfg: GlassConfig) {
    if (!tess) {
      this.cells = []
      this.paths = []
      this.staticLayer = null
      this.staticKey = ''
      return
    }
    this.width = tess.width
    this.height = tess.height
    this.cells = tess.cells
    this.env = new Float32Array(tess.cells.length)
    this.paths = tess.cells.map((c) => {
      const p = new Path2D()
      p.moveTo(c.poly[0], c.poly[1])
      for (let i = 1; i < c.poly.length / 2; i++) p.lineTo(c.poly[i * 2], c.poly[i * 2 + 1])
      p.closePath()
      return p
    })
    this.bakeStatic(cfg)
  }

  /** Re-bake only the static layer (lead width / base light changes). */
  refreshStatic(cfg: GlassConfig) {
    if (!this.cells.length) return
    const key = `${cfg.leadWidth}|${cfg.baseLight}`
    if (key !== this.staticKey) this.bakeStatic(cfg)
  }

  private bakeStatic(cfg: GlassConfig) {
    this.staticKey = `${cfg.leadWidth}|${cfg.baseLight}`
    const c = document.createElement('canvas')
    c.width = this.width
    c.height = this.height
    const g = c.getContext('2d')!
    g.fillStyle = '#050505'
    g.fillRect(0, 0, this.width, this.height)

    const ambient = 0.16 + cfg.baseLight * 0.4
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      // unlit glass: deeply darkened color
      g.fillStyle = `rgb(${Math.round(cell.r * ambient)},${Math.round(cell.g * ambient)},${Math.round(cell.b * ambient)})`
      g.fill(this.paths[i])
    }
    // hand-lit streaks: cheap top-left sheen per cell
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const grad = g.createLinearGradient(
        cell.cx - 30,
        cell.cy - 30,
        cell.cx + 30,
        cell.cy + 30,
      )
      grad.addColorStop(0, 'rgba(255,255,255,0.05)')
      grad.addColorStop(0.5, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fill(this.paths[i])
    }
    g.globalCompositeOperation = 'source-over'

    // lead came
    g.lineJoin = 'round'
    g.strokeStyle = '#0d0c0b'
    g.lineWidth = cfg.leadWidth + 1.5
    for (const p of this.paths) g.stroke(p)
    // metallic edge on the lead
    g.strokeStyle = 'rgba(140,130,110,0.28)'
    g.lineWidth = Math.max(0.75, cfg.leadWidth * 0.35)
    for (const p of this.paths) g.stroke(p)

    this.staticLayer = c
  }

  get ready() {
    return this.staticLayer !== null
  }

  get sceneWidth() {
    return this.width
  }

  get sceneHeight() {
    return this.height
  }

  render(ctx: CanvasRenderingContext2D, features: AudioFeatures, cfg: GlassConfig, now: number) {
    if (!this.staticLayer) return
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0.016
    this.lastFrame = now

    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.staticLayer, 0, 0)

    // backlight glow pass
    ctx.globalCompositeOperation = 'lighter'
    const t = now / 1000
    const react = cfg.reactivity
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const band = features.bands[cell.band]
      // slight per-cell shimmer keeps it organic
      const shimmer = 0.06 * Math.sin(t * 1.4 + cell.phase)
      const target = Math.min(1, band * react + shimmer + features.level * 0.08)
      const k = target > this.env[i] ? 1 - Math.exp(-dt * 22) : 1 - Math.exp(-dt * 7)
      this.env[i] += (target - this.env[i]) * k
      const v = this.env[i]
      if (v < 0.035) continue
      const a = Math.min(0.9, v)
      ctx.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${a.toFixed(3)})`
      ctx.fill(this.paths[i])
      // hot core for strong energy
      if (v > 0.55) {
        const hot = (v - 0.55) * 0.9
        ctx.fillStyle = `rgba(255,244,220,${hot.toFixed(3)})`
        ctx.fill(this.paths[i])
      }
    }

    // lead flash on beats
    if (cfg.beatPulse && features.beat > 0.04) {
      const a = Math.min(0.55, features.beat * cfg.pulseStrength)
      ctx.strokeStyle = `rgba(255,214,140,${a.toFixed(3)})`
      ctx.lineWidth = Math.max(0.75, cfg.leadWidth * 0.5)
      for (const p of this.paths) ctx.stroke(p)
    }

    ctx.globalCompositeOperation = 'source-over'
  }
}

import type { Cell, Tessellation } from './tessellate'
import type { AudioFeatures } from '../audio/engine'
import type { GlassConfig } from '../config'

/**
 * Reactive stained-glass renderer, backlit edition.
 *
 * Layers, back to front:
 *  1. staticLayer — unlit glass: darkened cells with edge thickening, streaky
 *     glass texture, mottling, lead came, and a faint ambient wash from the
 *     backlight so the panel reads as translucent even in silence.
 *  2. lightCanvas (1/4 res) — per-frame transmitted light: cell glow driven by
 *     the audio bands, drawn soft. Composited onto the main canvas scaled up
 *     (the upscaling blur doubles as bloom).
 *  3. rayCanvas — god rays: zoom-blur accumulation of the light pass toward
 *     the backlight position. Fog controls length/opacity of the streaks.
 *  4. atmosphere — fog veil gradients + drifting dust motes.
 *
 * The backlight sways slowly, so rays and shimmer drift across the glass.
 */

const LIGHT_SCALE = 0.25
const RAY_STEPS = 12

interface Mote {
  x: number
  y: number
  r: number
  speed: number
  phase: number
}

export class GlassRenderer {
  private cells: Cell[] = []
  private paths: Path2D[] = []
  private env: Float32Array = new Float32Array(0)
  private staticLayer: HTMLCanvasElement | null = null
  private lightCanvas: HTMLCanvasElement | null = null
  private rayCanvas: HTMLCanvasElement | null = null
  private raySrc: HTMLCanvasElement | null = null
  private motes: Mote[] = []
  private width = 0
  private height = 0
  private staticKey = ''
  private lastFrame = 0

  setScene(tess: Tessellation | null, cfg: GlassConfig) {
    if (!tess) {
      this.cells = []
      this.paths = []
      this.staticLayer = null
      this.lightCanvas = null
      this.rayCanvas = null
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
    this.lightCanvas = document.createElement('canvas')
    this.lightCanvas.width = Math.max(2, Math.round(tess.width * LIGHT_SCALE))
    this.lightCanvas.height = Math.max(2, Math.round(tess.height * LIGHT_SCALE))
    this.rayCanvas = document.createElement('canvas')
    this.rayCanvas.width = this.lightCanvas.width
    this.rayCanvas.height = this.lightCanvas.height
    this.raySrc = document.createElement('canvas')
    this.raySrc.width = this.lightCanvas.width
    this.raySrc.height = this.lightCanvas.height
    this.motes = makeMotes(42)
    this.bakeStatic(cfg)
  }

  refreshStatic(cfg: GlassConfig) {
    if (!this.cells.length) return
    const key = `${cfg.leadWidth}|${cfg.baseLight}`
    if (key !== this.staticKey) this.bakeStatic(cfg)
  }

  /** Light source position: behind the panel center, swaying slowly. */
  private lightPos(t: number): [number, number] {
    return [
      this.width / 2 + Math.sin(t * 0.11) * this.width * 0.07,
      this.height * 0.44 + Math.cos(t * 0.073) * this.height * 0.05,
    ]
  }

  private bakeStatic(cfg: GlassConfig) {
    this.staticKey = `${cfg.leadWidth}|${cfg.baseLight}`
    const c = document.createElement('canvas')
    c.width = this.width
    c.height = this.height
    const g = c.getContext('2d')!
    const W = this.width
    const H = this.height
    g.fillStyle = '#050505'
    g.fillRect(0, 0, W, H)

    // ambient wash from the backlight: glass is translucent even unlit
    const amb = g.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, Math.max(W, H) * 0.75)
    amb.addColorStop(0, `rgba(255,238,205,${0.10 + cfg.baseLight * 0.22})`)
    amb.addColorStop(0.55, `rgba(200,190,180,${0.04 + cfg.baseLight * 0.08})`)
    amb.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = amb
    g.fillRect(0, 0, W, H)

    // unlit glass base
    const ambient = 0.14 + cfg.baseLight * 0.34
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      g.fillStyle = `rgb(${Math.round(cell.r * ambient)},${Math.round(cell.g * ambient)},${Math.round(cell.b * ambient)})`
      g.fill(this.paths[i])
    }

    // glass material, per cell: mottling + streaks + edge thickening
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const seed = cell.phase
      const rnd = mulberry(Math.floor(seed * 1e6) + 17)
      g.save()
      g.clip(this.paths[i])

      // mottling: soft lighter/darker blobs
      for (let m = 0; m < 3; m++) {
        const mx = cell.cx + (rnd() - 0.5) * 60
        const my = cell.cy + (rnd() - 0.5) * 60
        const mr = 14 + rnd() * 30
        const up = rnd() > 0.5
        const grad = g.createRadialGradient(mx, my, 0, mx, my, mr)
        grad.addColorStop(0, up ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = grad
        g.fillRect(mx - mr, my - mr, mr * 2, mr * 2)
      }

      // streaky glass: a few long wisps following one direction
      const ang = rnd() * Math.PI
      const dx = Math.cos(ang)
      const dy = Math.sin(ang)
      g.lineWidth = 1.2 + rnd() * 1.6
      g.lineCap = 'round'
      for (let s = 0; s < 3; s++) {
        const off = (rnd() - 0.5) * 44
        const len = 26 + rnd() * 46
        const sx = cell.cx - dx * len * 0.5 - dy * off
        const sy = cell.cy - dy * len * 0.5 + dx * off
        g.strokeStyle = rnd() > 0.4 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.10)'
        g.beginPath()
        g.moveTo(sx, sy)
        g.quadraticCurveTo(
          sx + dx * len * 0.5 + (rnd() - 0.5) * 10,
          sy + dy * len * 0.5 + (rnd() - 0.5) * 10,
          sx + dx * len,
          sy + dy * len,
        )
        g.stroke()
      }
      g.restore()

      // edge thickening: glass is darker where it meets the lead
      g.strokeStyle = 'rgba(0,0,0,0.32)'
      g.lineWidth = 2.5
      g.stroke(this.paths[i])

      // faint top-left sheen
      const sheen = g.createLinearGradient(cell.cx - 30, cell.cy - 30, cell.cx + 30, cell.cy + 30)
      sheen.addColorStop(0, 'rgba(255,255,255,0.045)')
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)')
      g.fillStyle = sheen
      g.fill(this.paths[i])
    }

    // lead came
    g.lineJoin = 'round'
    g.strokeStyle = '#0d0c0b'
    g.lineWidth = cfg.leadWidth + 1.5
    for (const p of this.paths) g.stroke(p)
    g.strokeStyle = 'rgba(150,140,118,0.30)'
    g.lineWidth = Math.max(0.75, cfg.leadWidth * 0.35)
    for (const p of this.paths) g.stroke(p)

    this.staticLayer = c
  }

  get ready() {
    return this.staticLayer !== null && this.lightCanvas !== null
  }

  get sceneWidth() {
    return this.width
  }

  get sceneHeight() {
    return this.height
  }

  render(ctx: CanvasRenderingContext2D, features: AudioFeatures, cfg: GlassConfig, now: number) {
    if (!this.staticLayer || !this.lightCanvas || !this.rayCanvas) return
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0.016
    this.lastFrame = now
    const t = now / 1000
    const [lx, ly] = this.lightPos(t)

    // ---- 1. static glass -------------------------------------------------
    // (the caller owns the scene→canvas transform; we draw in scene coords)
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.staticLayer, 0, 0)

    // ---- 2. transmitted light pass (low res) ------------------------------
    const lc = this.lightCanvas
    const lg = lc.getContext('2d')!
    lg.setTransform(1, 0, 0, 1, 0, 0)
    lg.globalCompositeOperation = 'source-over'
    lg.clearRect(0, 0, lc.width, lc.height)
    lg.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0)
    lg.globalCompositeOperation = 'lighter'
    // ray source: only the brightest panes emit visible shafts
    const rs = this.raySrc!
    const rsg = rs.getContext('2d')!
    rsg.setTransform(1, 0, 0, 1, 0, 0)
    rsg.globalCompositeOperation = 'source-over'
    rsg.clearRect(0, 0, rs.width, rs.height)
    rsg.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0)
    rsg.globalCompositeOperation = 'lighter'

    const react = cfg.reactivity
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const band = features.bands[cell.band]
      // shimmer: cells nearer the light twinkle more as the source sways
      const dl = Math.hypot(cell.cx - lx, cell.cy - ly) / (Math.max(this.width, this.height) * 0.7)
      const proximity = Math.max(0, 1 - dl)
      const shimmer = (0.04 + 0.075 * proximity) * Math.sin(t * (1.1 + cell.phase * 0.35) + cell.phase)
      // faint translucency: backlight bleeds through near the source
      const bleed = proximity * proximity * cfg.baseLight * 0.22
      const target = Math.min(1, band * react + shimmer + bleed + features.level * 0.06)
      const k = target > this.env[i] ? 1 - Math.exp(-dt * 22) : 1 - Math.exp(-dt * 7)
      this.env[i] += (target - this.env[i]) * k
      const v = this.env[i]
      if (v < 0.03) continue
      const a = Math.min(0.85, v)
      lg.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${a.toFixed(3)})`
      lg.fill(this.paths[i])
      if (v > 0.62) {
        const hot = Math.min(0.4, (v - 0.62) * 0.55)
        lg.fillStyle = `rgba(255,244,220,${hot.toFixed(3)})`
        lg.fill(this.paths[i])
      }
      if (v > 0.42) {
        // this pane is bright enough to pierce the fog with a shaft
        const shaft = Math.min(0.8, (v - 0.42) * 1.4)
        rsg.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${shaft.toFixed(3)})`
        rsg.fill(this.paths[i])
      }
    }

    // composite light pass onto main (4x upscale = free bloom)
    ctx.globalCompositeOperation = 'lighter'
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = 0.9
    ctx.drawImage(lc, 0, 0, this.width, this.height)
    ctx.globalAlpha = 1

    // ---- 3. god rays via zoom-blur toward the light -----------------------
    const fog = cfg.fog
    const rc = this.rayCanvas
    const rg = rc.getContext('2d')!
    rg.setTransform(1, 0, 0, 1, 0, 0)
    rg.globalCompositeOperation = 'lighter'
    rg.clearRect(0, 0, rc.width, rc.height)
    const slx = lx * LIGHT_SCALE
    const sly = ly * LIGHT_SCALE
    const rayGain = 0.14 + fog * 0.4
    let zoom = 1
    for (let s = 0; s < RAY_STEPS; s++) {
      zoom *= 1.045
      const a = rayGain * (1 - s / RAY_STEPS) * 0.22
      rg.globalAlpha = a
      rg.drawImage(rs, slx - slx * zoom, sly - sly * zoom, rc.width * zoom, rc.height * zoom)
    }
    rg.globalAlpha = 1
    ctx.drawImage(rc, 0, 0, this.width, this.height)

    // ---- 4. atmosphere: fog veil + dust motes ------------------------------
    if (fog > 0.02) {
      const veil = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(this.width, this.height) * 0.7)
      veil.addColorStop(0, `rgba(255,240,214,${(fog * 0.13).toFixed(3)})`)
      veil.addColorStop(0.6, `rgba(215,215,225,${(fog * 0.05).toFixed(3)})`)
      veil.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, this.width, this.height)

      // dust motes drifting through the light
      ctx.fillStyle = '#fff4dc'
      for (const m of this.motes) {
        const mx = (m.x + t * m.speed) % 1
        const my = (m.y + Math.sin(t * 0.23 + m.phase) * 0.02 + 1) % 1
        const px = mx * this.width
        const py = my * this.height
        const dl = Math.hypot(px - lx, py - ly) / (Math.max(this.width, this.height) * 0.6)
        const vis = Math.max(0, 1 - dl)
        if (vis <= 0.02) continue
        const tw = 0.5 + 0.5 * Math.sin(t * 1.7 + m.phase * 3)
        ctx.globalAlpha = fog * vis * tw * 0.5
        ctx.beginPath()
        ctx.arc(px, py, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // ---- 5. lead flash on beats -------------------------------------------
    if (cfg.beatPulse && features.beat > 0.04) {
      const a = Math.min(0.5, features.beat * cfg.pulseStrength)
      ctx.strokeStyle = `rgba(255,216,150,${a.toFixed(3)})`
      ctx.lineWidth = Math.max(0.75, cfg.leadWidth * 0.5)
      for (const p of this.paths) ctx.stroke(p)
    }

    ctx.globalCompositeOperation = 'source-over'
  }
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeMotes(n: number): Mote[] {
  const rnd = mulberry(99)
  const motes: Mote[] = []
  for (let i = 0; i < n; i++) {
    motes.push({
      x: rnd(),
      y: rnd(),
      r: 0.6 + rnd() * 1.6,
      speed: 0.004 + rnd() * 0.012,
      phase: rnd() * Math.PI * 2,
    })
  }
  return motes
}

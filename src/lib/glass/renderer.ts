import type { Cell, Tessellation } from './tessellate'
import type { AudioFeatures } from '../audio/engine'
import type { GlassConfig } from '../config'

/**
 * Reactive stained-glass renderer, realism edition.
 *
 * The static bake carries the craft: two-tone color pooling per pane, dark
 * edge pooling where glass meets lead, ripple striations, seed bubbles,
 * hammered noise texture, a warm rim on the light-facing side of each pane,
 * dimensional lead came with solder joints and a rim light, and hand-cut
 * (subtly curved) cell edges.
 *
 * Per frame: a low-res transmitted-light pass driven by the audio bands is
 * composited as bloom, god rays are accumulated from the brightest panes,
 * fog veil + dust motes sell the volume, and a faint texture pass keeps the
 * glass surface visible even under strong light.
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
  private radii: Float32Array = new Float32Array(0)
  private env: Float32Array = new Float32Array(0)
  private staticLayer: HTMLCanvasElement | null = null
  private lightCanvas: HTMLCanvasElement | null = null
  private rayCanvas: HTMLCanvasElement | null = null
  private raySrc: HTMLCanvasElement | null = null
  private noiseTile: HTMLCanvasElement | null = null
  private windowPath: Path2D | null = null
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
      this.raySrc = null
      this.staticKey = ''
      return
    }
    this.width = tess.width
    this.height = tess.height
    this.cells = tess.cells
    this.env = new Float32Array(tess.cells.length)
    this.radii = new Float32Array(tess.cells.length)
    this.paths = tess.cells.map((c, i) => {
      // mean vertex distance → per-cell radius for gradients
      const n = c.poly.length / 2
      let acc = 0
      for (let v = 0; v < n; v++) {
        acc += Math.hypot(c.poly[v * 2] - c.cx, c.poly[v * 2 + 1] - c.cy)
      }
      this.radii[i] = acc / n
      return buildHandCutPath(c)
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
    if (!this.noiseTile) this.noiseTile = makeNoiseTile()
    this.motes = makeMotes(42)
    this.bakeStatic(cfg)
  }

  refreshStatic(cfg: GlassConfig) {
    if (!this.cells.length) return
    const key = `${cfg.leadWidth}|${cfg.baseLight}|${cfg.windowShape}`
    if (key !== this.staticKey) this.bakeStatic(cfg)
  }

  /** Window opening: gothic arch, rose circle, or full-bleed rectangle. */
  private buildWindowPath(shape: GlassConfig['windowShape']): Path2D {
    const W = this.width
    const H = this.height
    const p = new Path2D()
    if (shape === 'full') {
      p.rect(0, 0, W, H)
      return p
    }
    if (shape === 'rose') {
      const r = Math.min(W, H) * 0.46
      p.arc(W / 2, H / 2, r, 0, Math.PI * 2)
      return p
    }
    // pointed gothic arch
    const y0 = H * 0.05
    const y1 = H * 0.97
    const span = y1 - y0
    const ww = Math.min(W * 0.62, span * 0.66)
    const cx = W / 2
    const ys = y0 + ww * 0.62 // springing line
    p.moveTo(cx - ww / 2, y1)
    p.lineTo(cx - ww / 2, ys)
    p.quadraticCurveTo(cx - ww * 0.46, y0 + (ys - y0) * 0.06, cx, y0)
    p.quadraticCurveTo(cx + ww * 0.46, y0 + (ys - y0) * 0.06, cx + ww / 2, ys)
    p.lineTo(cx + ww / 2, y1)
    p.closePath()
    return p
  }

  private lightPos(t: number): [number, number] {
    return [
      this.width / 2 + Math.sin(t * 0.11) * this.width * 0.07,
      this.height * 0.44 + Math.cos(t * 0.073) * this.height * 0.05,
    ]
  }

  private bakeStatic(cfg: GlassConfig) {
    this.staticKey = `${cfg.leadWidth}|${cfg.baseLight}|${cfg.windowShape}`
    const c = document.createElement('canvas')
    c.width = this.width
    c.height = this.height
    const g = c.getContext('2d')!
    const W = this.width
    const H = this.height
    const lx = W / 2
    const ly = H * 0.44
    this.windowPath = this.buildWindowPath(cfg.windowShape)
    const framed = cfg.windowShape !== 'full'

    // ---- the dark church ---------------------------------------------------
    g.fillStyle = '#040302'
    g.fillRect(0, 0, W, H)
    // faint stone texture on the wall
    g.globalCompositeOperation = 'overlay'
    g.globalAlpha = 0.08
    g.drawImage(this.noiseTile!, 0, 0, W, H)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    // the nave falls to darkness at the edges
    const vign = g.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.85)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(0,0,0,0.72)')
    g.fillStyle = vign
    g.fillRect(0, 0, W, H)

    // everything glass-related happens inside the window opening
    g.save()
    g.clip(this.windowPath)

    // bright sky behind the window: daylight you could almost see through
    const sky = g.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.62)
    sky.addColorStop(0, `rgba(255,240,208,${0.34 + cfg.baseLight * 0.3})`)
    sky.addColorStop(0.5, `rgba(252,228,190,${0.16 + cfg.baseLight * 0.16})`)
    sky.addColorStop(1, `rgba(120,110,100,${0.05 + cfg.baseLight * 0.08})`)
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)

    // ---- panes ------------------------------------------------------------
    const ambient = 0.13 + cfg.baseLight * 0.36
    let avgR = 0
    let avgG = 0
    let avgB = 0
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const rad = this.radii[i]
      const rnd = mulberry(Math.floor(cell.phase * 1e6) + 31)
      const path = this.paths[i]

      const r = cell.r * ambient
      const gg = cell.g * ambient
      const b = cell.b * ambient

      // two-tone color pooling: shade varies across the piece
      const ang = rnd() * Math.PI * 2
      const gx = Math.cos(ang) * rad
      const gy = Math.sin(ang) * rad
      const twoTone = g.createLinearGradient(cell.cx - gx, cell.cy - gy, cell.cx + gx, cell.cy + gy)
      twoTone.addColorStop(0, `rgb(${Math.round(r * 0.55)},${Math.round(gg * 0.55)},${Math.round(b * 0.6)})`)
      twoTone.addColorStop(0.48, `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(b)})`)
      twoTone.addColorStop(1, `rgb(${Math.min(255, Math.round(r * 1.35 + 12))},${Math.min(255, Math.round(gg * 1.35 + 12))},${Math.min(255, Math.round(b * 1.3 + 10))})`)
      g.fillStyle = twoTone
      g.fill(path)

      // color pools darker where the glass meets the lead
      const pool = g.createRadialGradient(cell.cx, cell.cy, rad * 0.2, cell.cx, cell.cy, rad * 1.12)
      pool.addColorStop(0, 'rgba(0,0,0,0)')
      pool.addColorStop(0.82, 'rgba(0,0,0,0.14)')
      pool.addColorStop(1, 'rgba(0,0,0,0.36)')
      g.fillStyle = pool
      g.fill(path)

      // transmission: light passes *through* the pane — clearer glass lets
      // you almost see the bright sky on the other side
      const clarity = 0.3 + rnd() * 0.7
      const transmit = clarity * (0.22 + cfg.baseLight * 0.5)
      const tr = Math.min(255, Math.round(r + (255 - r) * transmit * 0.75 + 30 * transmit))
      const tg = Math.min(255, Math.round(gg + (240 - gg) * transmit * 0.72 + 26 * transmit))
      const tb = Math.min(255, Math.round(b + (214 - b) * transmit * 0.66 + 18 * transmit))
      g.globalCompositeOperation = 'lighter'
      g.fillStyle = `rgba(${tr},${tg},${tb},${(transmit * 0.75).toFixed(3)})`
      g.fill(path)
      g.globalCompositeOperation = 'source-over'

      avgR += cell.r
      avgG += cell.g
      avgB += cell.b

      g.save()
      g.clip(path)

      // hammered texture
      g.globalAlpha = 0.16
      g.globalCompositeOperation = 'overlay'
      const no = rnd() * 176
      g.drawImage(this.noiseTile!, cell.cx - rad - no * 0.3, cell.cy - rad - no * 0.2, rad * 2.6, rad * 2.6)
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1

      // ripple striations: concentric arcs, off-center
      const ripCx = cell.cx + (rnd() - 0.5) * rad * 0.7
      const ripCy = cell.cy + (rnd() - 0.5) * rad * 0.7
      const ripples = 2 + Math.floor(rnd() * 3)
      for (let rp = 0; rp < ripples; rp++) {
        const rr = rad * (0.3 + rp * 0.28 + rnd() * 0.1)
        g.strokeStyle = rnd() > 0.45 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'
        g.lineWidth = 0.9 + rnd() * 1.4
        g.beginPath()
        g.arc(ripCx, ripCy, rr, rnd() * Math.PI, Math.PI * (1 + rnd()))
        g.stroke()
      }

      // seed bubbles: tiny trapped air, bright rim + dark core
      const seeds = Math.floor(rnd() * 4)
      for (let s = 0; s < seeds; s++) {
        const sx = cell.cx + (rnd() - 0.5) * rad * 1.2
        const sy = cell.cy + (rnd() - 0.5) * rad * 1.2
        const sr = 0.7 + rnd() * 1.6
        g.fillStyle = 'rgba(0,0,0,0.25)'
        g.beginPath()
        g.arc(sx, sy, sr, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = 'rgba(255,255,255,0.22)'
        g.beginPath()
        g.arc(sx - sr * 0.3, sy - sr * 0.3, sr * 0.45, 0, Math.PI * 2)
        g.fill()
      }
      g.restore()

      // warm rim on the light-facing side of the piece
      const dlx = lx - cell.cx
      const dly = ly - cell.cy
      const dl = Math.hypot(dlx, dly) || 1
      const rimX = cell.cx + (dlx / dl) * rad * 1.05
      const rimY = cell.cy + (dly / dl) * rad * 1.05
      const rim = g.createRadialGradient(rimX, rimY, 0, rimX, rimY, rad * 1.1)
      rim.addColorStop(0, 'rgba(255,232,190,0.16)')
      rim.addColorStop(0.45, 'rgba(255,232,190,0.04)')
      rim.addColorStop(1, 'rgba(0,0,0,0)')
      g.save()
      g.clip(path)
      g.fillStyle = rim
      g.fillRect(cell.cx - rad * 2.2, cell.cy - rad * 2.2, rad * 4.4, rad * 4.4)
      g.restore()
    }

    // ---- lead came ----------------------------------------------------------
    g.lineJoin = 'round'
    g.lineCap = 'round'
    // body of the lead
    g.strokeStyle = '#080706'
    g.lineWidth = cfg.leadWidth + 2.5
    for (const p of this.paths) g.stroke(p)
    // rim light: shifted a touch toward the backlight → crescent highlight
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const dlx = lx - cell.cx
      const dly = ly - cell.cy
      const dl = Math.hypot(dlx, dly) || 1
      g.save()
      g.translate((dlx / dl) * 1.6, (dly / dl) * 1.6)
      g.strokeStyle = 'rgba(255,236,200,0.13)'
      g.lineWidth = Math.max(0.8, cfg.leadWidth * 0.55)
      g.stroke(this.paths[i])
      g.restore()
    }
    // dark heart of the lead
    g.strokeStyle = '#050404'
    g.lineWidth = Math.max(1, cfg.leadWidth * 0.7)
    for (const p of this.paths) g.stroke(p)

    // solder joints: blobs where cames meet
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const n = cell.poly.length / 2
      for (let v = 0; v < n; v++) {
        const vx = cell.poly[v * 2]
        const vy = cell.poly[v * 2 + 1]
        g.fillStyle = '#060505'
        g.beginPath()
        g.arc(vx, vy, cfg.leadWidth * 0.95 + 0.8, 0, Math.PI * 2)
        g.fill()
        const dlx = lx - vx
        const dly = ly - vy
        const dl = Math.hypot(dlx, dly) || 1
        g.fillStyle = 'rgba(255,238,205,0.22)'
        g.beginPath()
        g.arc(vx + (dlx / dl) * 1.1, vy + (dly / dl) * 1.1, Math.max(0.5, cfg.leadWidth * 0.32), 0, Math.PI * 2)
        g.fill()
      }
    }

    g.restore() // out of the window opening, back into the dark nave

    // colored light spilling from the window into the darkness
    if (framed && this.cells.length) {
      const n = this.cells.length
      const ar = Math.round(avgR / n)
      const ag = Math.round(avgG / n)
      const ab = Math.round(avgB / n)
      g.globalCompositeOperation = 'lighter'
      // halo around the opening
      const halo = g.createRadialGradient(lx, ly, Math.min(W, H) * 0.12, lx, ly, Math.max(W, H) * 0.68)
      halo.addColorStop(0, `rgba(${ar},${ag},${ab},${0.13 + cfg.baseLight * 0.1})`)
      halo.addColorStop(0.5, `rgba(${ar},${ag},${ab},0.05)`)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = halo
      g.fillRect(0, 0, W, H)
      // light pooling on the floor below the window
      const poolY = H * 0.97
      const floor = g.createRadialGradient(lx, poolY, 0, lx, poolY, W * 0.34)
      floor.addColorStop(0, `rgba(${ar},${ag},${ab},${0.10 + cfg.baseLight * 0.08})`)
      floor.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = floor
      g.save()
      g.translate(lx, poolY)
      g.scale(1, 0.22)
      g.translate(-lx, -poolY)
      g.fillRect(0, poolY - H * 0.5, W, H)
      g.restore()
      g.globalCompositeOperation = 'source-over'
    }

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
    if (!this.staticLayer || !this.lightCanvas || !this.rayCanvas || !this.raySrc) return
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0.016
    this.lastFrame = now
    const t = now / 1000
    const [lx, ly] = this.lightPos(t)

    // ---- 1. static glass ---------------------------------------------------
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.staticLayer, 0, 0)

    // ---- 2. transmitted light pass (low res) --------------------------------
    const lc = this.lightCanvas
    const lg = lc.getContext('2d')!
    lg.setTransform(1, 0, 0, 1, 0, 0)
    lg.globalCompositeOperation = 'source-over'
    lg.clearRect(0, 0, lc.width, lc.height)
    lg.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0)
    lg.globalCompositeOperation = 'lighter'
    const rs = this.raySrc
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
      const dl = Math.hypot(cell.cx - lx, cell.cy - ly) / (Math.max(this.width, this.height) * 0.7)
      const proximity = Math.max(0, 1 - dl)
      const shimmer = (0.04 + 0.075 * proximity) * Math.sin(t * (1.1 + cell.phase * 0.35) + cell.phase)
      const bleed = proximity * proximity * cfg.baseLight * 0.2
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
        const shaft = Math.min(0.8, (v - 0.42) * 1.4)
        rsg.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${shaft.toFixed(3)})`
        rsg.fill(this.paths[i])
      }
    }

    // texture stays in the light itself: nibble the glow with glass noise
    lg.globalCompositeOperation = 'destination-out'
    lg.setTransform(1, 0, 0, 1, 0, 0)
    lg.globalAlpha = 0.10
    lg.drawImage(this.noiseTile!, 0, 0, lc.width, lc.height)
    lg.globalAlpha = 1

    // composite light pass onto main, only inside the window opening
    ctx.globalCompositeOperation = 'lighter'
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = 0.9
    if (this.windowPath) {
      ctx.save()
      ctx.clip(this.windowPath)
      ctx.drawImage(lc, 0, 0, this.width, this.height)
      ctx.restore()
    } else {
      ctx.drawImage(lc, 0, 0, this.width, this.height)
    }
    ctx.globalAlpha = 1

    // ---- 3. god rays ---------------------------------------------------------
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

    // ---- 4. atmosphere --------------------------------------------------------
    if (fog > 0.02) {
      const veil = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(this.width, this.height) * 0.7)
      veil.addColorStop(0, `rgba(255,240,214,${(fog * 0.13).toFixed(3)})`)
      veil.addColorStop(0.6, `rgba(215,215,225,${(fog * 0.05).toFixed(3)})`)
      veil.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, this.width, this.height)

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

    // ---- 5. lead flash on beats ----------------------------------------------
    if (cfg.beatPulse && features.beat > 0.04) {
      ctx.globalCompositeOperation = 'lighter'
      const a = Math.min(0.5, features.beat * cfg.pulseStrength)
      ctx.strokeStyle = `rgba(255,216,150,${a.toFixed(3)})`
      ctx.lineWidth = Math.max(0.75, cfg.leadWidth * 0.5)
      for (const p of this.paths) ctx.stroke(p)
    }

    ctx.globalCompositeOperation = 'source-over'
  }
}

/** Hand-cut look: each straight edge becomes a gently curved quadratic. */
function buildHandCutPath(cell: Cell): Path2D {
  const pts = cell.poly
  const n = pts.length / 2
  const rnd = mulberry(Math.floor(cell.phase * 1e6) + 7)
  const p = new Path2D()
  p.moveTo(pts[0], pts[1])
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2]
    const ay = pts[i * 2 + 1]
    const bx = pts[((i + 1) % n) * 2]
    const by = pts[((i + 1) % n) * 2 + 1]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    const bulge = (rnd() - 0.5) * 0.13 * len
    const cx = (ax + bx) / 2 - (dy / len) * bulge
    const cy = (ay + by) / 2 + (dx / len) * bulge
    p.quadraticCurveTo(cx, cy, bx, by)
  }
  p.closePath()
  return p
}

/** Tileable-ish smooth value-noise tile for the hammered glass texture. */
function makeNoiseTile(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const rnd = mulberry(2024)
  // octave 1: 16px blobs, octave 2: 48px blobs
  for (const cells of [16, 48]) {
    const small = document.createElement('canvas')
    small.width = cells
    small.height = cells
    const sg = small.getContext('2d')!
    const img = sg.createImageData(cells, cells)
    for (let i = 0; i < cells * cells; i++) {
      const v = Math.floor(rnd() * 255)
      img.data[i * 4] = v
      img.data[i * 4 + 1] = v
      img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
    sg.putImageData(img, 0, 0)
    g.imageSmoothingEnabled = true
    g.globalAlpha = cells === 16 ? 0.65 : 0.35
    g.drawImage(small, 0, 0, size, size)
  }
  g.globalAlpha = 1
  return c
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

import { Delaunay } from 'd3-delaunay'
import type { Cell, Tessellation } from './tessellate'
import type { AudioFeatures } from '../audio/engine'
import type { GlassConfig } from '../config'
import { buildWindowPath, computeWindowBox, type WindowBox } from './window'

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
const FADE_MS = 450

/** A canvas that works on the main thread and inside a Worker. */
export type Canvas2D = HTMLCanvasElement | OffscreenCanvas

export function makeCanvas(w: number, h: number): Canvas2D {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  return new OffscreenCanvas(w, h)
}

function ctx2d(c: Canvas2D): CanvasRenderingContext2D {
  return c.getContext('2d') as unknown as CanvasRenderingContext2D
}

/** Bake-relevant config identity — when this changes, the static layer must be repainted. */
export function staticKeyOf(cfg: GlassConfig): string {
  return `${cfg.leadWidth}|${cfg.baseLight}|${cfg.windowShape}|${cfg.fitMode}|${cfg.windowSize}|${cfg.windowAspect}`
}

/** Mean vertex distance per cell — radius for gradients and texture placement. */
export function cellRadii(cells: Cell[]): Float32Array {
  const radii = new Float32Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const n = c.poly.length / 2
    let acc = 0
    for (let v = 0; v < n; v++) acc += Math.hypot(c.poly[v * 2] - c.cx, c.poly[v * 2 + 1] - c.cy)
    radii[i] = acc / n
  }
  return radii
}

/** A fully baked, ready-to-adopt scene produced off the main thread. */
export interface PreparedScene {
  key: string
  cells: Cell[]
  radii: Float32Array
  bitmap: ImageBitmap
  width: number
  height: number
  imgAspect: number
}

/** Place the image into the scene: cover (crop to fill) or contain (whole
 *  image inside the window opening, dark surround). Worker-safe. */
export function imageDataFromImage(
  img: CanvasImageSource,
  iw: number,
  ih: number,
  w: number,
  h: number,
  cfg: Pick<GlassConfig, 'fitMode' | 'windowShape' | 'windowSize' | 'windowAspect'>,
): ImageData {
  const c = makeCanvas(w, h)
  const g = ctx2d(c)
  g.fillStyle = '#050505'
  g.fillRect(0, 0, w, h)
  if (cfg.fitMode === 'contain' && cfg.windowShape !== 'full') {
    const box = computeWindowBox(w, h, cfg, iw / ih)
    const scale = Math.min(box.w / iw, box.h / ih)
    const dw = iw * scale
    const dh = ih * scale
    g.drawImage(img, box.cx - dw / 2, box.cy - dh / 2, dw, dh)
  } else {
    const scale = Math.max(w / iw, h / ih)
    const dw = iw * scale
    const dh = ih * scale
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  }
  return g.getImageData(0, 0, w, h)
}

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
  // glow groups: adjacent panes merged into one fill call at high density
  private groupPaths: Path2D[] = []
  private gBand: Uint8Array = new Uint8Array(0)
  private gDecay: Float32Array = new Float32Array(0)
  private gPhase: Float32Array = new Float32Array(0)
  private gGate: Float32Array = new Float32Array(0)
  private gCx: Float32Array = new Float32Array(0)
  private gCy: Float32Array = new Float32Array(0)
  private gR: Float32Array = new Float32Array(0)
  private gG: Float32Array = new Float32Array(0)
  private gB: Float32Array = new Float32Array(0)
  private grand: () => number = Math.random
  private prevFlux: Float32Array = new Float32Array(24)
  private env: Float32Array = new Float32Array(0)
  private staticLayer: CanvasImageSource | null = null
  private lightCanvas: Canvas2D | null = null
  private rayCanvas: Canvas2D | null = null
  private raySrc: Canvas2D | null = null
  private noiseTile: CanvasImageSource | null = null
  private fadeFrom: CanvasImageSource | null = null
  private fadeStart = 0
  private windowPath: Path2D | null = null
  private box: WindowBox | null = null
  private imageAspect = 1
  private motes: Mote[] = []
  private width = 0
  private height = 0
  private staticKey = ''
  private lastFrame = 0
  private rayTick = 0

  setScene(tess: Tessellation | null, cfg: GlassConfig, imgAspect = 1) {
    if (!tess) {
      this.cells = []
      this.paths = []
      this.groupPaths = []
      this.env = new Float32Array(0)
      this.staticLayer = null
      this.lightCanvas = null
      this.rayCanvas = null
      this.raySrc = null
      this.staticKey = ''
      return
    }
    this.width = tess.width
    this.height = tess.height
    this.imageAspect = imgAspect
    this.cells = tess.cells
    this.radii = cellRadii(tess.cells)
    this.paths = tess.cells.map(buildHandCutPath)
    this.buildGroups()
    const lw = Math.max(2, Math.round(tess.width * LIGHT_SCALE))
    const lh = Math.max(2, Math.round(tess.height * LIGHT_SCALE))
    this.lightCanvas = makeCanvas(lw, lh)
    this.rayCanvas = makeCanvas(lw, lh)
    this.raySrc = makeCanvas(lw, lh)
    if (!this.noiseTile) this.noiseTile = makeNoiseTile()
    this.motes = makeMotes(42)
    this.bakeStatic(cfg)
  }

  /**
   * Adopt a scene baked off the main thread (worker): swap in the baked
   * static layer and rebuild only the cheap runtime structures (paths,
   * groups, light buffers) — the expensive painting already happened. With
   * `fade`, the previous static layer crossfades into the new one.
   */
  adoptScene(scene: PreparedScene, cfg: GlassConfig, fade: boolean) {
    const prev = this.staticLayer
    const sameDims = this.width === scene.width && this.height === scene.height
    this.width = scene.width
    this.height = scene.height
    this.imageAspect = scene.imgAspect
    this.cells = scene.cells
    this.radii = scene.radii
    this.paths = scene.cells.map(buildHandCutPath)
    this.buildGroups()
    const lw = Math.max(2, Math.round(scene.width * LIGHT_SCALE))
    const lh = Math.max(2, Math.round(scene.height * LIGHT_SCALE))
    this.lightCanvas = makeCanvas(lw, lh)
    this.rayCanvas = makeCanvas(lw, lh)
    this.raySrc = makeCanvas(lw, lh)
    if (!this.noiseTile) this.noiseTile = makeNoiseTile()
    this.motes = makeMotes(42)
    this.box = computeWindowBox(scene.width, scene.height, cfg, scene.imgAspect)
    this.windowPath = buildWindowPath(cfg.windowShape, this.box, scene.width, scene.height)
    this.staticLayer = scene.bitmap
    this.staticKey = staticKeyOf(cfg)
    this.fadeFrom = fade && prev && sameDims ? prev : null
    this.fadeStart = performance.now()
  }

  /**
   * Adaptive glow grouping: at high cell counts, adjacent panes are merged
   * into groups of 2–3 that light up in unison — one merged Path2D per group
   * means one fill call instead of three. The static bake (texture, lead,
   * pooling) stays per-pane at full detail; only the dynamic glow is grouped.
   */
  private buildGroups() {
    const n = this.cells.length
    const targetSize = n <= 1300 ? 1 : n <= 2100 ? 2 : 3
    this.grand = mulberry(1337 + n)

    const members: number[][] = []
    if (targetSize === 1) {
      for (let i = 0; i < n; i++) members.push([i])
    } else {
      // greedy neighbor merging over Delaunay adjacency
      const pts = new Float64Array(n * 2)
      for (let i = 0; i < n; i++) {
        pts[i * 2] = this.cells[i].cx
        pts[i * 2 + 1] = this.cells[i].cy
      }
      const del = new Delaunay(pts)
      const assigned = new Uint8Array(n)
      for (let i = 0; i < n; i++) {
        if (assigned[i]) continue
        const group = [i]
        assigned[i] = 1
        for (const j of del.neighbors(i)) {
          if (group.length >= targetSize) break
          if (!assigned[j]) {
            assigned[j] = 1
            group.push(j)
          }
        }
        members.push(group)
      }
    }

    const m = members.length
    this.groupPaths = new Array(m)
    this.gBand = new Uint8Array(m)
    this.gDecay = new Float32Array(m)
    this.gPhase = new Float32Array(m)
    this.gGate = new Float32Array(m)
    this.gCx = new Float32Array(m)
    this.gCy = new Float32Array(m)
    this.gR = new Float32Array(m)
    this.gG = new Float32Array(m)
    this.gB = new Float32Array(m)
    this.env = new Float32Array(m)

    for (let gi = 0; gi < m; gi++) {
      const group = members[gi]
      const mp = new Path2D()
      let r = 0
      let g = 0
      let b = 0
      let cx = 0
      let cy = 0
      for (const ci of group) {
        mp.addPath(this.paths[ci])
        const c = this.cells[ci]
        r += c.r
        g += c.g
        b += c.b
        cx += c.cx
        cy += c.cy
      }
      const k = group.length
      this.groupPaths[gi] = mp
      this.gBand[gi] = this.cells[group[0]].band
      this.gDecay[gi] = 0.55 + this.grand() * 1.1
      this.gPhase[gi] = this.cells[group[0]].phase
      this.gGate[gi] = 1
      this.gCx[gi] = cx / k
      this.gCy[gi] = cy / k
      this.gR[gi] = Math.round(r / k)
      this.gG[gi] = Math.round(g / k)
      this.gB[gi] = Math.round(b / k)
    }
  }

  refreshStatic(cfg: GlassConfig) {
    if (!this.cells.length) return
    if (staticKeyOf(cfg) !== this.staticKey) this.bakeStatic(cfg)
  }

  /** Light source position: behind the window center, swaying slowly. */
  private lightPos(t: number): [number, number] {
    const cx = this.box ? this.box.cx : this.width / 2
    const cy = this.box ? this.box.y0 + this.box.h * 0.42 : this.height * 0.44
    return [cx + Math.sin(t * 0.11) * this.width * 0.07, cy + Math.cos(t * 0.073) * this.height * 0.05]
  }

  /** Main-thread bake (fallback path / first paint). */
  private bakeStatic(cfg: GlassConfig) {
    if (!this.cells.length) return
    this.staticKey = staticKeyOf(cfg)
    if (!this.noiseTile) this.noiseTile = makeNoiseTile()
    const result = bakeStaticLayer({
      cells: this.cells,
      paths: this.paths,
      radii: this.radii,
      noiseTile: this.noiseTile,
      cfg,
      width: this.width,
      height: this.height,
      imageAspect: this.imageAspect,
    })
    this.staticLayer = result.layer
    this.box = result.box
    this.windowPath = result.windowPath
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

    // ---- 1. static glass (crossfade when a new scene was just adopted) -----
    ctx.globalCompositeOperation = 'source-over'
    if (this.fadeFrom) {
      const f = Math.min(1, (now - this.fadeStart) / FADE_MS)
      ctx.drawImage(this.fadeFrom, 0, 0)
      if (f < 1) {
        ctx.globalAlpha = f
        ctx.drawImage(this.staticLayer, 0, 0)
        ctx.globalAlpha = 1
      } else {
        ctx.drawImage(this.staticLayer, 0, 0)
        this.fadeFrom = null
      }
    } else {
      ctx.drawImage(this.staticLayer, 0, 0)
    }

    // ---- 2. transmitted light pass (low res) --------------------------------
    const lc = this.lightCanvas
    const lg = ctx2d(lc)
    lg.setTransform(1, 0, 0, 1, 0, 0)
    lg.globalCompositeOperation = 'source-over'
    lg.clearRect(0, 0, lc.width, lc.height)
    lg.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0)
    lg.globalCompositeOperation = 'lighter'
    const rs = this.raySrc
    const rsg = ctx2d(rs)
    rsg.setTransform(1, 0, 0, 1, 0, 0)
    rsg.globalCompositeOperation = 'source-over'
    rsg.clearRect(0, 0, rs.width, rs.height)
    rsg.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0)
    rsg.globalCompositeOperation = 'lighter'

    // punch/strobe dynamics: sustained glow vs onset spikes are independent,
    // and each group's envelope has its own decay rate + sparkle gate
    const react = cfg.reactivity
    const punch = cfg.punch
    const strobe = cfg.strobe
    const sustainedGain = react * (1 - 0.55 * punch)
    const spikeGain = react * punch * 2.4
    const attackRate = 16 + strobe * 26
    const releaseBase = 3.5 + strobe * 18
    const maxDim = Math.max(this.width, this.height)
    const flux = features.flux
    const prev = this.prevFlux
    const ng = this.groupPaths.length
    for (let gi = 0; gi < ng; gi++) {
      const band = this.gBand[gi]
      // sparkle gate: a rising flux edge re-rolls this group's gate — most
      // panes catch the transient fully, some sit it out → lively mosaic
      if (flux[band] > 0.25 && prev[band] <= 0.25) {
        this.gGate[gi] = this.grand() < 0.7 ? 1 : 0.3
      }
      const dl = Math.hypot(this.gCx[gi] - lx, this.gCy[gi] - ly) / (maxDim * 0.7)
      const proximity = Math.max(0, 1 - dl)
      const phase = this.gPhase[gi]
      const shimmer = (0.04 + 0.075 * proximity) * Math.sin(t * (1.1 + phase * 0.35) + phase)
      const bleed = proximity * proximity * cfg.baseLight * 0.2
      let target =
        features.bands[band] * sustainedGain +
        flux[band] * spikeGain * this.gGate[gi] +
        shimmer +
        bleed +
        features.level * 0.05
      target = target < 0 ? 0 : target > 1 ? 1 : target
      const e = this.env[gi]
      const k =
        target > e ? 1 - Math.exp(-dt * attackRate) : 1 - Math.exp(-dt * releaseBase * this.gDecay[gi])
      const v = e + (target - e) * k
      this.env[gi] = v
      if (v < 0.03) continue
      const path = this.groupPaths[gi]
      const a = Math.min(0.85, v)
      lg.fillStyle = `rgba(${this.gR[gi]},${this.gG[gi]},${this.gB[gi]},${a.toFixed(3)})`
      lg.fill(path)
      if (v > 0.62) {
        const hot = Math.min(0.4, (v - 0.62) * 0.55)
        lg.fillStyle = `rgba(255,244,220,${hot.toFixed(3)})`
        lg.fill(path)
      }
      if (v > 0.42) {
        const shaft = Math.min(0.8, (v - 0.42) * 1.4)
        rsg.fillStyle = `rgba(${this.gR[gi]},${this.gG[gi]},${this.gB[gi]},${shaft.toFixed(3)})`
        rsg.fill(path)
      }
    }
    prev.set(flux)

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
    // accumulated at half frame rate: rays move slowly, so reusing the last
    // accumulation on alternate frames is invisible but saves 12 draws
    const fog = cfg.fog
    const rc = this.rayCanvas
    this.rayTick++
    if (this.rayTick % 2 === 0) {
      const rg = ctx2d(rc)
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
    }
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
      // clip to the window: with contain fit, panes outside the opening are
      // unlit black glass and their lead must not flash in the dark nave
      ctx.save()
      if (this.windowPath) ctx.clip(this.windowPath)
      for (const p of this.groupPaths) ctx.stroke(p)
      ctx.restore()
    }

    ctx.globalCompositeOperation = 'source-over'
  }
}

/** Bake the full static layer — dark nave, glass panes, lead came — into a
 *  standalone canvas. Everything it needs arrives through `deps`, so the same
 *  code runs on the main thread (first paint / fallback) and inside a Worker. */
export function bakeStaticLayer(deps: {
  cells: Cell[]
  paths: Path2D[]
  radii: Float32Array
  noiseTile: CanvasImageSource
  cfg: GlassConfig
  width: number
  height: number
  imageAspect: number
}): { layer: Canvas2D; box: WindowBox; windowPath: Path2D | null } {
  const { cells, paths, radii, noiseTile, cfg, imageAspect } = deps
  const W = deps.width
  const H = deps.height
  const c = makeCanvas(W, H)
  const g = ctx2d(c)
  const box = computeWindowBox(W, H, cfg, imageAspect)
  const windowPath = buildWindowPath(cfg.windowShape, box, W, H)
  const lx = box.cx
  const ly = box.y0 + box.h * 0.42
  const framed = cfg.windowShape !== 'full'

  // ---- the dark church -----------------------------------------------------
  g.fillStyle = '#040302'
  g.fillRect(0, 0, W, H)
  // faint stone texture on the wall
  g.globalCompositeOperation = 'overlay'
  g.globalAlpha = 0.08
  g.drawImage(noiseTile, 0, 0, W, H)
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
  if (windowPath) g.clip(windowPath)

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
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const rad = radii[i]
    const rnd = mulberry(Math.floor(cell.phase * 1e6) + 31)
    const path = paths[i]

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
    g.drawImage(noiseTile, cell.cx - rad - no * 0.3, cell.cy - rad - no * 0.2, rad * 2.6, rad * 2.6)
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
  for (const p of paths) g.stroke(p)
  // rim light: shifted a touch toward the backlight → crescent highlight
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const dlx = lx - cell.cx
    const dly = ly - cell.cy
    const dl = Math.hypot(dlx, dly) || 1
    g.save()
    g.translate((dlx / dl) * 1.6, (dly / dl) * 1.6)
    g.strokeStyle = 'rgba(255,236,200,0.13)'
    g.lineWidth = Math.max(0.8, cfg.leadWidth * 0.55)
    g.stroke(paths[i])
    g.restore()
  }
  // dark heart of the lead
  g.strokeStyle = '#050404'
  g.lineWidth = Math.max(1, cfg.leadWidth * 0.7)
  for (const p of paths) g.stroke(p)

  // solder joints: blobs where cames meet
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
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
  if (framed && cells.length) {
    const n = cells.length
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
    const poolY = box.y1
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


  return { layer: c, box, windowPath }
}


/** Hand-cut look: each straight edge becomes a gently curved quadratic. */
export function buildHandCutPath(cell: Cell): Path2D {
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
export function makeNoiseTile(size = 256): Canvas2D {
  const c = makeCanvas(size, size)
  const g = ctx2d(c)
  const rnd = mulberry(2024)
  // octave 1: 16px blobs, octave 2: 48px blobs
  for (const cells of [16, 48]) {
    const small = makeCanvas(cells, cells)
    const sg = ctx2d(small)
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

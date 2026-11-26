/**
 * Procedural "rose window" demo image so the visualizer is alive before the
 * user uploads a reference. Drawn once at 1024x1024.
 */
export function createDemoImage(size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const cx = size / 2
  const cy = size / 2

  g.fillStyle = '#0a0a12'
  g.fillRect(0, 0, size, size)

  const palette = [
    '#d4243b', '#f2a007', '#1f9e8e', '#2456c4', '#7b2fbf',
    '#e2631d', '#0f7a3d', '#c9b458', '#b01e5a', '#2ba8c4',
  ]

  // concentric petal rings
  const rings = 5
  for (let ring = rings; ring >= 1; ring--) {
    const rOut = (ring / rings) * size * 0.48
    const rIn = ((ring - 1) / rings) * size * 0.48
    const petals = 6 + ring * 6
    for (let p = 0; p < petals; p++) {
      const a0 = (p / petals) * Math.PI * 2 + ring * 0.3
      const a1 = ((p + 1) / petals) * Math.PI * 2 + ring * 0.3
      const col = palette[(p + ring * 3) % palette.length]
      g.beginPath()
      g.arc(cx, cy, rOut, a0, a1)
      g.arc(cx, cy, rIn, a1, a0, true)
      g.closePath()
      const grad = g.createRadialGradient(cx, cy, rIn, cx, cy, rOut)
      grad.addColorStop(0, shade(col, 0.55))
      grad.addColorStop(0.8, col)
      grad.addColorStop(1, shade(col, 1.25))
      g.fillStyle = grad
      g.fill()
    }
  }

  // glowing heart
  const heart = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.12)
  heart.addColorStop(0, '#fff3d6')
  heart.addColorStop(0.5, '#f2c14e')
  heart.addColorStop(1, 'rgba(242,193,78,0)')
  g.fillStyle = heart
  g.beginPath()
  g.arc(cx, cy, size * 0.12, 0, Math.PI * 2)
  g.fill()

  // corner field: deep indigo with faint speckle
  g.globalCompositeOperation = 'destination-over'
  g.fillStyle = '#101228'
  g.fillRect(0, 0, size, size)
  g.globalCompositeOperation = 'source-over'
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const d = Math.hypot(x - cx, y - cy)
    if (d < size * 0.49) continue
    g.fillStyle = `rgba(120,140,220,${Math.random() * 0.25})`
    g.fillRect(x, y, 2, 2)
  }
  return c
}

function shade(hex: string, f: number): string {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * f))
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * f))
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * f))
  return `rgb(${r},${g},${b})`
}

/** Deterministic RNG so built-in images (and their baked scenes) are
 *  identical across sessions — the e2e pixel oracles depend on it. */
function seededRand(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pad B default: sapphire diamond lattice — radial rings of faceted gems. */
function createDiamondImage(size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const rnd = seededRand(71)
  const palette = ['#12245e', '#1e3fae', '#2456c4', '#2ba8c4', '#7fb2e5']

  g.fillStyle = '#070b1c'
  g.fillRect(0, 0, size, size)

  const rings = 6
  for (let ring = rings; ring >= 1; ring--) {
    const radius = (ring / rings) * size * 0.46
    const count = 5 + ring * 5
    const dw = (size * 0.52 * Math.PI) / count / 2.6
    const dh = dw * (1.3 + rnd() * 0.4)
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + ring * 0.23
      const x = cx + Math.cos(ang) * radius
      const y = cy + Math.sin(ang) * radius
      const col = palette[Math.floor(rnd() * palette.length)]
      const grad = g.createLinearGradient(x, y - dh, x, y + dh)
      grad.addColorStop(0, shade(col, 1.45))
      grad.addColorStop(0.5, col)
      grad.addColorStop(1, shade(col, 0.5))
      g.fillStyle = grad
      g.beginPath()
      g.moveTo(x, y - dh)
      g.lineTo(x + dw, y)
      g.lineTo(x, y + dh)
      g.lineTo(x - dw, y)
      g.closePath()
      g.fill()
      // facet line
      g.strokeStyle = 'rgba(255,255,255,0.14)'
      g.lineWidth = 1.2
      g.beginPath()
      g.moveTo(x - dw, y)
      g.lineTo(x + dw, y)
      g.stroke()
    }
  }
  // icy heart
  const heart = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.1)
  heart.addColorStop(0, '#eaf4ff')
  heart.addColorStop(0.6, '#7fb2e5')
  heart.addColorStop(1, 'rgba(127,178,229,0)')
  g.fillStyle = heart
  g.beginPath()
  g.arc(cx, cy, size * 0.1, 0, Math.PI * 2)
  g.fill()
  return c
}

/** Pad C default: emerald shard mosaic — angular hand-cut triangular shards. */
function createShardImage(size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const rnd = seededRand(137)
  const palette = ['#0b5a2e', '#0f7a3d', '#1f9e8e', '#53c46a', '#c9d44a']

  g.fillStyle = '#06120a'
  g.fillRect(0, 0, size, size)

  // jittered grid, each cell split into two triangles
  const cells = 9
  const step = size / cells
  const pts: [number, number][][] = []
  for (let gy = 0; gy <= cells; gy++) {
    const row: [number, number][] = []
    for (let gx = 0; gx <= cells; gx++) {
      const edge = gx === 0 || gy === 0 || gx === cells || gy === cells
      row.push([
        gx * step + (edge ? 0 : (rnd() - 0.5) * step * 0.9),
        gy * step + (edge ? 0 : (rnd() - 0.5) * step * 0.9),
      ])
    }
    pts.push(row)
  }
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const [a, b, cc, d] = [pts[gy][gx], pts[gy][gx + 1], pts[gy + 1][gx + 1], pts[gy + 1][gx]]
      for (const tri of [[a, b, cc], [a, cc, d]] as [number, number][][]) {
        const col = palette[Math.floor(rnd() * palette.length)]
        const tx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3
        const ty = (tri[0][1] + tri[1][1] + tri[2][1]) / 3
        const grad = g.createRadialGradient(tx, ty, 0, tx, ty, step)
        grad.addColorStop(0, shade(col, 1.35))
        grad.addColorStop(1, shade(col, 0.55))
        g.fillStyle = grad
        g.beginPath()
        g.moveTo(tri[0][0], tri[0][1])
        g.lineTo(tri[1][0], tri[1][1])
        g.lineTo(tri[2][0], tri[2][1])
        g.closePath()
        g.fill()
      }
    }
  }
  return c
}

/** Pad D default: violet & gold halo — bold concentric bands with ray spokes. */
function createRingImage(size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const rnd = seededRand(211)
  const bands = ['#3b1160', '#7b2fbf', '#c9b458', '#b01e5a', '#f2a007', '#7b2fbf']

  g.fillStyle = '#120718'
  g.fillRect(0, 0, size, size)

  // ray spokes behind the bands
  const spokes = 36
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * Math.PI * 2
    g.fillStyle = i % 2 ? 'rgba(201,180,88,0.16)' : 'rgba(123,47,191,0.22)'
    g.beginPath()
    g.moveTo(cx, cy)
    g.arc(cx, cy, size * 0.49, a0, a0 + Math.PI / spokes)
    g.closePath()
    g.fill()
  }
  // concentric bands, outermost first
  const rings = 6
  for (let ring = rings; ring >= 1; ring--) {
    const r = (ring / rings) * size * 0.47
    const col = bands[(rings - ring) % bands.length]
    const grad = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r)
    grad.addColorStop(0, shade(col, 1.3))
    grad.addColorStop(1, shade(col, 0.6))
    g.fillStyle = grad
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fill()
    // gold beads along the boundary
    const beads = 10 + ring * 6
    for (let i = 0; i < beads; i++) {
      const ang = (i / beads) * Math.PI * 2 + ring * 0.17
      g.fillStyle = rnd() > 0.3 ? '#f2c14e' : '#fff3d6'
      g.beginPath()
      g.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, size * 0.006 + rnd() * size * 0.004, 0, Math.PI * 2)
      g.fill()
    }
  }
  // ember heart
  const heart = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.09)
  heart.addColorStop(0, '#fff3d6')
  heart.addColorStop(0.6, '#f2a007')
  heart.addColorStop(1, 'rgba(242,160,7,0)')
  g.fillStyle = heart
  g.beginPath()
  g.arc(cx, cy, size * 0.09, 0, Math.PI * 2)
  g.fill()
  return c
}

/** Each pad owns a hardcoded default image: A keeps the classic rose window,
 *  B/C/D get their own designs so untouched pads are visually distinct when
 *  cycling. Deterministic — same image on every load. */
export function createPadDefaultImage(pad: number, size = 1024): HTMLCanvasElement {
  switch (pad) {
    case 1:
      return createDiamondImage(size)
    case 2:
      return createShardImage(size)
    case 3:
      return createRingImage(size)
    default:
      return createDemoImage(size)
  }
}

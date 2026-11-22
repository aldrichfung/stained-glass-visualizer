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

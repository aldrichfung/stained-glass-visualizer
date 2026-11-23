import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../lib/audio/engine'
import type { GlassConfig } from '../lib/config'
import { tessellate } from '../lib/glass/tessellate'
import { GlassRenderer } from '../lib/glass/renderer'
import { computeWindowBox } from '../lib/glass/window'

interface Props {
  engine: AudioEngine
  config: GlassConfig
  image: HTMLImageElement | HTMLCanvasElement | null
}

function imgDims(img: HTMLImageElement | HTMLCanvasElement): [number, number] {
  return 'naturalWidth' in img ? [img.naturalWidth, img.naturalHeight] : [img.width, img.height]
}

/** Place the image into the scene: cover (crop to fill) or contain (whole
 *  image inside the window opening, dark surround). */
function imageToData(
  img: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  cfg: GlassConfig,
): ImageData {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#050505'
  g.fillRect(0, 0, w, h)
  const [iw, ih] = imgDims(img)
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

export function VisualizerCanvas({ engine, config, image }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef(new GlassRenderer())
  const configRef = useRef(config)
  configRef.current = config
  const engineRef = useRef(engine)
  engineRef.current = engine
  const imageRef = useRef(image)
  imageRef.current = image
  const rebuildKeyRef = useRef('')

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let disposed = false

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      // working resolution: cap for tessellation cost
      const w = Math.min(1400, Math.round(rect.width * dpr))
      const h = Math.min(1400, Math.round(rect.height * dpr))
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const cfg = configRef.current
      const img = imageRef.current
      if (!img) return
      const imageData = imageToData(img, w, h, cfg)
      const tess = tessellate({
        imageData,
        pattern: cfg.pattern,
        density: cfg.density,
        mapping: cfg.mapping,
        colorMode: cfg.colorMode,
      })
      const [iw, ih] = imgDims(img)
      rendererRef.current.setScene(tess, cfg, iw / ih)
    }

    const maybeRebuild = () => {
      const cfg = configRef.current
      const rect = canvas.getBoundingClientRect()
      const key = [
        cfg.pattern,
        cfg.density,
        cfg.mapping,
        cfg.colorMode,
        cfg.windowShape,
        cfg.fitMode,
        cfg.windowSize,
        cfg.windowAspect,
        imageRef.current ? ('naturalWidth' in imageRef.current ? imageRef.current.src : 'demo') : 'none',
        Math.round(rect.width),
        Math.round(rect.height),
      ].join('|')
      if (key !== rebuildKeyRef.current) {
        rebuildKeyRef.current = key
        rebuild()
      }
      rendererRef.current.refreshStatic(cfg)
    }

    const frame = (now: number) => {
      if (disposed) return
      maybeRebuild()
      const features = engineRef.current.getFeatures(now)
      // debug/tuning hook: lets us sample analyzer stats from the console
      ;(window as unknown as { __features?: unknown }).__features = features
      ;(window as unknown as { __engine?: unknown }).__engine = engineRef.current
      ;(window as unknown as { __renderer?: unknown }).__renderer = rendererRef.current
      const cfg = configRef.current
      if (rendererRef.current.ready) {
        const sw = rendererRef.current.sceneWidth
        const sh = rendererRef.current.sceneHeight
        ctx.setTransform(canvas.width / sw, 0, 0, canvas.height / sh, 0, 0)
        rendererRef.current.render(ctx, features, cfg, now)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(() => {
      rebuildKeyRef.current = ''
    })
    ro.observe(canvas)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="viz absolute inset-0 h-full w-full" aria-hidden="true" />
}

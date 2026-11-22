import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../lib/audio/engine'
import type { GlassConfig } from '../lib/config'
import { tessellate } from '../lib/glass/tessellate'
import { GlassRenderer } from '../lib/glass/renderer'

interface Props {
  engine: AudioEngine
  config: GlassConfig
  image: HTMLImageElement | HTMLCanvasElement | null
}

/** Cover-fit the image into a working-resolution canvas and read pixels. */
function imageToData(img: HTMLImageElement | HTMLCanvasElement, w: number, h: number): ImageData {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
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
      const imageData = imageToData(img, w, h)
      const tess = tessellate({
        imageData,
        pattern: cfg.pattern,
        density: cfg.density,
        mapping: cfg.mapping,
        colorMode: cfg.colorMode,
      })
      rendererRef.current.setScene(tess, cfg)
    }

    const maybeRebuild = () => {
      const cfg = configRef.current
      const rect = canvas.getBoundingClientRect()
      const key = [
        cfg.pattern,
        cfg.density,
        cfg.mapping,
        cfg.colorMode,
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
      const cfg = configRef.current
      engineRef.current.sensitivity = cfg.sensitivity
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

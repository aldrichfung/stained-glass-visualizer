import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../lib/audio/engine'
import type { GlassConfig } from '../lib/config'
import { tessellate } from '../lib/glass/tessellate'
import { GlassRenderer, imageDataFromImage, type PreparedScene } from '../lib/glass/renderer'
import { BakeQueue, bakeKeyOf, sceneKeyOf } from '../lib/glass/bakeQueue'
import { imgDims, type GalleryImage } from '../lib/gallery'

interface Props {
  engine: AudioEngine
  config: GlassConfig
  images: GalleryImage[]
  activeIndex: number
}

/** Bakes fire only after the config has been still for this long — a slider
 *  drag produces one bake at the end, not one per intermediate tick. */
const BAKE_DEBOUNCE_MS = 200

/**
 * Frame loop + scene-cache orchestration.
 *
 * Every baked scene (one per image × config × size) is cached as a
 * PreparedScene. The expensive pipeline (image placement, tessellation,
 * static paint) runs in a Web Worker on OffscreenCanvas, so cycling images
 * — or even changing glass settings mid-song — never blocks the main
 * thread: the frame loop keeps rendering the current scene and crossfades
 * the moment the baked replacement arrives. All gallery images are prebaked
 * in the background, so a scheduled transition is a cache hit, not a bake.
 *
 * Storm safety: bake requests are debounced (only a settled config triggers
 * work), queued jobs for superseded configs are cancelled, and the active
 * image jumps ahead of gallery preloads — a slider drag produces a handful
 * of bakes, not a backlog.
 *
 * Fallback: without Worker/OffscreenCanvas we build synchronously on the
 * main thread (a brief hitch on change, debounced the same way).
 */
export function VisualizerCanvas({ engine, config, images, activeIndex }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef(new GlassRenderer())
  const configRef = useRef(config)
  configRef.current = config
  const engineRef = useRef(engine)
  engineRef.current = engine
  const imagesRef = useRef(images)
  imagesRef.current = images
  const activeRef = useRef(activeIndex)
  activeRef.current = activeIndex

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const renderer = rendererRef.current
    let queue: BakeQueue | null = null
    if (BakeQueue.supported()) {
      try {
        queue = new BakeQueue()
      } catch {
        queue = null // construction failed — stay on the sync fallback
      }
    }
    const cache = new Map<string, PreparedScene>()
    const pending = new Set<string>()
    let adoptedKey = ''
    let prevAdoptedKey = '' // protected too: its bitmap may be mid-crossfade
    let sizeKey = ''
    let lastSuffix = ''
    let suffixChangedAt = 0
    let desiredKey = ''
    let desiredSince = 0
    let raf = 0
    let disposed = false

    const CACHE_CAP = 8

    const cachePut = (key: string, scene: PreparedScene) => {
      if (cache.has(key)) {
        scene.bitmap.close()
        return
      }
      cache.set(key, scene)
      // evict oldest (Map insertion order), never the adopted scene
      while (cache.size > CACHE_CAP) {
        let evicted = false
        for (const [k, s] of cache) {
          if (k === adoptedKey || k === prevAdoptedKey) continue
          s.bitmap.close()
          cache.delete(k)
          evicted = true
          break
        }
        if (!evicted) break
      }
    }

    /** Main-thread build — first paint and the no-worker fallback. */
    const syncBuild = (key: string, img: GalleryImage, w: number, h: number, cfg: GlassConfig) => {
      const [iw, ih] = imgDims(img.img)
      const imageData = imageDataFromImage(img.img, iw, ih, w, h, cfg)
      const tess = tessellate({
        imageData,
        pattern: cfg.pattern,
        density: cfg.density,
        mapping: cfg.mapping,
        colorMode: cfg.colorMode,
      })
      renderer.setScene(tess, cfg, iw / ih)
      prevAdoptedKey = adoptedKey
      adoptedKey = key
    }

    const requestBake = (
      key: string,
      img: GalleryImage,
      w: number,
      h: number,
      cfg: GlassConfig,
      priority: 'active' | 'preload',
    ) => {
      if (!queue || pending.has(key) || cache.has(key)) return
      pending.add(key)
      const [iw, ih] = imgDims(img.img)
      queue
        .request(key, img.id, img.img, iw, ih, w, h, cfg, priority)
        .then((scene) => {
          pending.delete(key)
          // stale results are still cached (A→B→A becomes a hit), they are
          // just never adopted unless they match the current key again
          if (!disposed) cachePut(key, scene)
          else scene.bitmap.close()
        })
        .catch(() => {
          pending.delete(key)
        })
    }

    const frame = (now: number) => {
      if (disposed) return
      try {
        const cfg = configRef.current
        const imgs = imagesRef.current
        const rect = canvas.getBoundingClientRect()

        if (rect.width >= 2 && rect.height >= 2 && imgs.length) {
          const dpr = Math.min(2, window.devicePixelRatio || 1)
          // assigning canvas.width resets the bitmap — only do it on change
          const cw = Math.round(rect.width * dpr)
          const ch = Math.round(rect.height * dpr)
          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
          }
          // working resolution: cap for tessellation cost
          const w = Math.min(1400, cw)
          const h = Math.min(1400, ch)
          const newSizeKey = `${w}x${h}`
          if (newSizeKey !== sizeKey) {
            sizeKey = newSizeKey
            adoptedKey = '' // size change → every scene is stale
          }

          // config-or-size identity: when it changes, cancel queued work for
          // superseded variants and restart the debounce clock
          const suffix = `${sceneKeyOf(cfg)}|${w}x${h}`
          if (suffix !== lastSuffix) {
            lastSuffix = suffix
            suffixChangedAt = now
            desiredKey = ''
            queue?.cancelWhere((job) => !job.key.endsWith(suffix))
          }

          // release worker-side images that left the gallery
          queue?.syncImages(imgs.map((im) => im.id))

          const idx = Math.min(Math.max(0, activeRef.current), imgs.length - 1)
          const active = imgs[idx]
          const key = bakeKeyOf(active.id, cfg, w, h)

          if (key !== adoptedKey) {
            const hit = cache.get(key)
            if (hit) {
              renderer.adoptScene(hit, cfg, renderer.ready)
              prevAdoptedKey = adoptedKey
              adoptedKey = key
              desiredKey = ''
            } else if (!renderer.ready) {
              // first paint only: build synchronously so the user isn't
              // staring at black while the worker warms up
              syncBuild(key, active, w, h, cfg)
            } else {
              // not cached — request it once the config has settled
              if (key !== desiredKey) {
                desiredKey = key
                desiredSince = now
              }
              if (now - desiredSince >= BAKE_DEBOUNCE_MS) {
                if (queue) requestBake(key, active, w, h, cfg, 'active')
                else syncBuild(key, active, w, h, cfg)
              }
            }
          }

          // prebake the gallery once the config is stable — by the time the
          // cycle timer advances, every scene is a cache hit. The active
          // image is included: after a sync first-paint its scene isn't in
          // the cache yet, and this fills the gap for return visits.
          if (queue && now - suffixChangedAt >= BAKE_DEBOUNCE_MS) {
            for (const im of imgs) {
              requestBake(
                bakeKeyOf(im.id, cfg, w, h),
                im,
                w,
                h,
                cfg,
                im.id === active.id ? 'active' : 'preload',
              )
            }
          }
        }

        const features = engineRef.current.getFeatures(now)
        // debug/tuning hook: lets us sample analyzer stats from the console
        ;(window as unknown as { __features?: unknown }).__features = features
        ;(window as unknown as { __engine?: unknown }).__engine = engineRef.current
        ;(window as unknown as { __renderer?: unknown }).__renderer = renderer
        if (renderer.ready) {
          const sw = renderer.sceneWidth
          const sh = renderer.sceneHeight
          ctx.setTransform(canvas.width / sw, 0, 0, canvas.height / sh, 0, 0)
          renderer.render(ctx, features, cfg, now)
        }
      } catch (err) {
        // a single bad frame must never kill the loop
        console.error('viz frame error', err)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(() => {
      sizeKey = ''
    })
    ro.observe(canvas)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      queue?.terminate()
      for (const s of cache.values()) s.bitmap.close()
      cache.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="viz absolute inset-0 h-full w-full" aria-hidden="true" />
}

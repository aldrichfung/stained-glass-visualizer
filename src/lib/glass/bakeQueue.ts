/**
 * Sequential bake queue feeding the bake worker. One job in flight at a time
 * (bakes are ~hundreds of ms and memory-heavy, so parallelism buys little),
 * with per-key dedupe so the per-frame preload loop can re-request freely.
 */
import type { GlassConfig } from '../config'
import { staticKeyOf, type PreparedScene } from './renderer'

/** Everything that changes the baked scene: tessellation + paint + size. */
export function sceneKeyOf(cfg: GlassConfig): string {
  return `${staticKeyOf(cfg)}|${cfg.pattern}|${cfg.density}|${cfg.colorMode}|${cfg.mapping}`
}

export function bakeKeyOf(imageId: string, cfg: GlassConfig, w: number, h: number): string {
  return `${imageId}|${sceneKeyOf(cfg)}|${w}x${h}`
}

interface Job {
  key: string
  img: CanvasImageSource
  iw: number
  ih: number
  w: number
  h: number
  cfg: GlassConfig
  resolve: (s: PreparedScene) => void
  reject: (e: unknown) => void
}

export class BakeQueue {
  private worker: Worker
  private queue: Job[] = []
  private active = false
  private byKey = new Map<string, Promise<PreparedScene>>()
  private nextId = 1

  constructor() {
    this.worker = new Worker(new URL('./bakeWorker.ts', import.meta.url), { type: 'module' })
  }

  /** Off-thread baking needs both Worker and OffscreenCanvas 2d. */
  static supported(): boolean {
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
  }

  request(
    key: string,
    img: CanvasImageSource,
    iw: number,
    ih: number,
    w: number,
    h: number,
    cfg: GlassConfig,
  ): Promise<PreparedScene> {
    const hit = this.byKey.get(key)
    if (hit) return hit
    const p = new Promise<PreparedScene>((resolve, reject) => {
      this.queue.push({ key, img, iw, ih, w, h, cfg, resolve, reject })
    })
    this.byKey.set(key, p)
    // once settled, the caller's own cache is the dedupe layer
    p.catch(() => {}).finally(() => {
      if (this.byKey.get(key) === p) this.byKey.delete(key)
    })
    this.pump()
    return p
  }

  private pump() {
    if (this.active) return
    const job = this.queue.shift()
    if (!job) return
    this.active = true
    const id = this.nextId++

    const cleanup = () => {
      this.worker.removeEventListener('message', onMsg)
      this.worker.removeEventListener('error', onErr)
      this.active = false
    }
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data
      if (m.id !== id) return
      cleanup()
      if (m.ok) {
        job.resolve({
          key: job.key,
          cells: m.cells,
          radii: m.radii,
          bitmap: m.bitmap,
          width: m.width,
          height: m.height,
          imgAspect: m.imgAspect,
        })
      } else {
        job.reject(new Error(m.error))
      }
      this.pump()
    }
    const onErr = (e: ErrorEvent) => {
      cleanup()
      job.reject(new Error(e.message || 'bake worker error'))
      this.pump()
    }
    this.worker.addEventListener('message', onMsg)
    this.worker.addEventListener('error', onErr)

    // ImageBitmap is neutered on transfer — mint a fresh one per job.
    createImageBitmap(job.img as HTMLImageElement | HTMLCanvasElement).then(
      (bitmap) => {
        this.worker.postMessage(
          { id, key: job.key, bitmap, iw: job.iw, ih: job.ih, w: job.w, h: job.h, cfg: job.cfg },
          [bitmap],
        )
      },
      (err) => {
        cleanup()
        job.reject(err)
        this.pump()
      },
    )
  }

  terminate() {
    this.worker.terminate()
    this.queue.length = 0
    this.byKey.clear()
  }
}

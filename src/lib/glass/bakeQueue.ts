/**
 * Sequential bake queue feeding the bake worker.
 *
 * - One job in flight at a time (bakes are ~hundreds of ms and memory-heavy,
 *   so parallelism buys little).
 * - Per-key dedupe: re-requesting an in-flight key returns the same promise.
 * - Latest-wins: `cancelWhere` drops queued (not yet started) stale jobs —
 *   a settings storm can never pile up work for superseded configs.
 * - Active-first: jobs for the visible image jump ahead of gallery preloads.
 * - Worker-side image cache: each source image is decoded and shipped once;
 *   later jobs carry only its id, so a config change costs zero main-thread
 *   decode and zero transfer.
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

export type BakePriority = 'active' | 'preload'

/** debug counters, readable from the console as window.__bakeStats */
function bumpStat(field: 'requested' | 'cancelled') {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __bakeStats?: { requested: number; cancelled: number } }
  w.__bakeStats = w.__bakeStats || { requested: 0, cancelled: 0 }
  w.__bakeStats[field]++
}

interface Job {
  id: number
  key: string
  imageId: string
  img: CanvasImageSource
  iw: number
  ih: number
  w: number
  h: number
  cfg: GlassConfig
  priority: BakePriority
  resolve: (s: PreparedScene) => void
  reject: (e: unknown) => void
}

export class BakeQueue {
  private worker: Worker
  private queue: Job[] = []
  private active = false
  private byKey = new Map<string, Promise<PreparedScene>>()
  private nextId = 1
  /** images the worker is believed to hold already */
  private workerImages = new Set<string>()

  constructor() {
    this.worker = new Worker(new URL('./bakeWorker.ts', import.meta.url), { type: 'module' })
  }

  /** Off-thread baking needs both Worker and OffscreenCanvas 2d. */
  static supported(): boolean {
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
  }

  request(
    key: string,
    imageId: string,
    img: CanvasImageSource,
    iw: number,
    ih: number,
    w: number,
    h: number,
    cfg: GlassConfig,
    priority: BakePriority = 'preload',
  ): Promise<PreparedScene> {
    const hit = this.byKey.get(key)
    if (hit) return hit
    bumpStat('requested')
    const p = new Promise<PreparedScene>((resolve, reject) => {
      const job: Job = {
        id: this.nextId++,
        key,
        imageId,
        img,
        iw,
        ih,
        w,
        h,
        cfg,
        priority,
        resolve,
        reject,
      }
      if (priority === 'active') {
        // jump ahead of preload jobs, behind other active jobs
        let i = 0
        while (i < this.queue.length && this.queue[i].priority === 'active') i++
        this.queue.splice(i, 0, job)
      } else {
        this.queue.push(job)
      }
    })
    this.byKey.set(key, p)
    // once settled, the caller's own cache is the dedupe layer
    p.catch(() => {}).finally(() => {
      if (this.byKey.get(key) === p) this.byKey.delete(key)
    })
    this.pump()
    return p
  }

  /** Drop queued (not yet running) jobs matching `pred` — e.g. every job
   *  baked for a superseded config. Their promises reject as cancelled;
   *  callers treat that as "never mind". */
  cancelWhere(pred: (job: { key: string; imageId: string }) => boolean) {
    if (!this.queue.length) return
    const keep: Job[] = []
    for (const job of this.queue) {
      if (pred(job)) {
        bumpStat('cancelled')
        job.reject(new Error('cancelled: superseded'))
      } else keep.push(job)
    }
    this.queue = keep
  }

  /** Tell the worker to release images that left the gallery. */
  syncImages(imageIds: string[]) {
    const keep = new Set(imageIds)
    for (const id of [...this.workerImages]) {
      if (!keep.has(id)) {
        this.worker.postMessage({ type: 'drop', imageId: id })
        this.workerImages.delete(id)
      }
    }
  }

  private pump() {
    if (this.active) return
    const job = this.queue.shift()
    if (!job) return
    this.active = true

    const cleanup = () => {
      this.worker.removeEventListener('message', onMsg)
      this.worker.removeEventListener('error', onErr)
      this.active = false
    }
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data
      if (m.id !== job.id) return
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
        if (m.missing) this.workerImages.delete(job.imageId) // re-ship next time
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

    const send = (bitmap?: ImageBitmap) => {
      this.worker.postMessage(
        {
          id: job.id,
          key: job.key,
          imageId: job.imageId,
          bitmap,
          iw: job.iw,
          ih: job.ih,
          w: job.w,
          h: job.h,
          cfg: job.cfg,
        },
        bitmap ? [bitmap] : [],
      )
    }

    if (this.workerImages.has(job.imageId)) {
      send() // worker already holds the decoded image — nothing to ship
    } else {
      // first bake for this image: decode once, transfer, worker keeps it.
      // ImageBitmap is neutered on transfer, which is fine — the source
      // image stays with the gallery for thumbnails and future decodes.
      createImageBitmap(job.img as HTMLImageElement | HTMLCanvasElement).then(
        (bitmap) => {
          this.workerImages.add(job.imageId)
          send(bitmap)
        },
        (err) => {
          cleanup()
          job.reject(err)
          this.pump()
        },
      )
    }
  }

  terminate() {
    this.worker.terminate()
    this.queue.length = 0
    this.byKey.clear()
    this.workerImages.clear()
  }
}

/// <reference lib="webworker" />
/**
 * Bake worker: the expensive half of scene building — image placement,
 * tessellation, and the full static-layer paint — runs here on
 * OffscreenCanvas, so the main thread never drops a frame when images cycle.
 *
 * In:  a reference to a cached source image (shipped once per image as a
 *      transferable ImageBitmap, then reused across bakes) + full config.
 * Out: the baked static layer as a transferable ImageBitmap plus the cell
 *      data (with poly buffers transferred) the renderer needs for the
 *      per-frame light pass. Path2D can't cross the boundary, so the main
 *      thread re-derives the cheap hand-cut paths from the polys.
 */
import { tessellate } from './tessellate'
import {
  bakeStaticLayer,
  buildHandCutPath,
  cellRadii,
  imageDataFromImage,
  makeNoiseTile,
  type Canvas2D,
} from './renderer'
import type { GlassConfig } from '../config'

export interface BakeRequest {
  id: number
  key: string
  imageId: string
  /** shipped on the first job for an image, omitted afterwards */
  bitmap?: ImageBitmap
  iw: number
  ih: number
  w: number
  h: number
  cfg: GlassConfig
}

export type WorkerMessage = BakeRequest | { type: 'drop'; imageId: string }

const scope = self as unknown as DedicatedWorkerGlobalScope

let noiseTile: Canvas2D | null = null

/** Decoded source images live here for the worker's lifetime. */
const images = new Map<string, { bitmap: ImageBitmap; iw: number; ih: number }>()

scope.onmessage = (ev: MessageEvent<WorkerMessage>) => {
  const m = ev.data
  if ('type' in m && m.type === 'drop') {
    const entry = images.get(m.imageId)
    if (entry) {
      entry.bitmap.close()
      images.delete(m.imageId)
    }
    return
  }
  const req = m as BakeRequest
  try {
    if (req.bitmap) {
      const prev = images.get(req.imageId)
      if (prev) prev.bitmap.close()
      images.set(req.imageId, { bitmap: req.bitmap, iw: req.iw, ih: req.ih })
    }
    const entry = images.get(req.imageId)
    if (!entry) {
      // the main thread believes we have this image but we don't (e.g. it
      // raced a drop) — say so explicitly so the queue re-ships it
      scope.postMessage({ id: req.id, key: req.key, ok: false, missing: true, error: 'missing image' })
      return
    }
    const imageData = imageDataFromImage(entry.bitmap, entry.iw, entry.ih, req.w, req.h, req.cfg)
    const tess = tessellate({
      imageData,
      pattern: req.cfg.pattern,
      density: req.cfg.density,
      mapping: req.cfg.mapping,
      colorMode: req.cfg.colorMode,
    })
    const radii = cellRadii(tess.cells)
    const paths = tess.cells.map(buildHandCutPath)
    if (!noiseTile) noiseTile = makeNoiseTile()
    const { layer } = bakeStaticLayer({
      cells: tess.cells,
      paths,
      radii,
      noiseTile,
      cfg: req.cfg,
      width: tess.width,
      height: tess.height,
      imageAspect: entry.iw / entry.ih,
    })
    const bitmap = (layer as OffscreenCanvas).transferToImageBitmap()
    const transfers: Transferable[] = [bitmap, radii.buffer as ArrayBuffer]
    for (const cell of tess.cells) transfers.push(cell.poly.buffer as ArrayBuffer)
    scope.postMessage(
      {
        id: req.id,
        key: req.key,
        ok: true,
        cells: tess.cells,
        radii,
        bitmap,
        width: tess.width,
        height: tess.height,
        imgAspect: entry.iw / entry.ih,
      },
      transfers,
    )
  } catch (err) {
    scope.postMessage({ id: req.id, key: req.key, ok: false, error: String(err) })
  }
}

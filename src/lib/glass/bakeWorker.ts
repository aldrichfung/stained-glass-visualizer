/// <reference lib="webworker" />
/**
 * Bake worker: the expensive half of scene building — image placement,
 * tessellation, and the full static-layer paint — runs here on
 * OffscreenCanvas, so the main thread never drops a frame when images cycle.
 *
 * In:  a transferable ImageBitmap of the source image + full config.
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
  bitmap: ImageBitmap
  iw: number
  ih: number
  w: number
  h: number
  cfg: GlassConfig
}

const scope = self as unknown as DedicatedWorkerGlobalScope

let noiseTile: Canvas2D | null = null

scope.onmessage = (ev: MessageEvent<BakeRequest>) => {
  const m = ev.data
  try {
    const imageData = imageDataFromImage(m.bitmap, m.iw, m.ih, m.w, m.h, m.cfg)
    m.bitmap.close()
    const tess = tessellate({
      imageData,
      pattern: m.cfg.pattern,
      density: m.cfg.density,
      mapping: m.cfg.mapping,
      colorMode: m.cfg.colorMode,
    })
    const radii = cellRadii(tess.cells)
    const paths = tess.cells.map(buildHandCutPath)
    if (!noiseTile) noiseTile = makeNoiseTile()
    const { layer } = bakeStaticLayer({
      cells: tess.cells,
      paths,
      radii,
      noiseTile,
      cfg: m.cfg,
      width: tess.width,
      height: tess.height,
      imageAspect: m.iw / m.ih,
    })
    const bitmap = (layer as OffscreenCanvas).transferToImageBitmap()
    const transfers: Transferable[] = [bitmap, radii.buffer as ArrayBuffer]
    for (const cell of tess.cells) transfers.push(cell.poly.buffer as ArrayBuffer)
    scope.postMessage(
      {
        id: m.id,
        key: m.key,
        ok: true,
        cells: tess.cells,
        radii,
        bitmap,
        width: tess.width,
        height: tess.height,
        imgAspect: m.iw / m.ih,
      },
      transfers,
    )
  } catch (err) {
    scope.postMessage({ id: m.id, key: m.key, ok: false, error: String(err) })
  }
}

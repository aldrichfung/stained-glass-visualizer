import type { GlassConfig } from './config'

/**
 * A performance pad preset: a full config snapshot plus its OWN copy of the
 * image (imageData, downscaled JPEG dataURL). Copy semantics: deleting the
 * gallery image — or reloading the browser — can never break a pad. imageId
 * links back to the gallery entry when it still exists (instant loads and
 * cache reuse); imageData is the durable fallback used to materialize the
 * image back into the gallery when the reference dangles.
 *
 * Legacy pads (saved before imageData existed) have imageData: null and
 * degrade to the old reference behavior.
 */
export interface Preset {
  config: GlassConfig
  /** gallery id at save time; stable per image, content-immutable */
  imageId: string | null
  /** display name of the image at save time */
  imageName?: string | null
  /** the pad's own copy of the image (downscaled JPEG dataURL), if capturable */
  imageData?: string | null
}

export const PAD_COUNT = 4
export const PAD_LABELS = ['A', 'B', 'C', 'D'] as const

export type PresetSlots = (Preset | null)[]

const STORAGE_KEY = 'sgv-presets-v1'

export function emptyPresets(): PresetSlots {
  return [null, null, null, null]
}

export function loadPresets(): PresetSlots {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyPresets()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return emptyPresets()
    const slots = emptyPresets()
    for (let i = 0; i < PAD_COUNT; i++) {
      const p = parsed[i]
      if (p && typeof p === 'object' && p.config && typeof p.config === 'object') {
        slots[i] = {
          config: p.config as GlassConfig,
          imageId: typeof p.imageId === 'string' ? p.imageId : null,
          imageName: typeof p.imageName === 'string' ? p.imageName : null,
          imageData: typeof p.imageData === 'string' ? p.imageData : null,
        }
      }
    }
    return slots
  } catch {
    return emptyPresets()
  }
}

/** Persist pads. Returns false when the quota forced dropping the embedded
 *  image copies (configs still persist; images degrade to references). */
export function savePresets(slots: PresetSlots): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
    return true
  } catch {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(slots.map((p) => (p ? { ...p, imageData: null } : null))),
      )
    } catch {
      // storage unavailable entirely — presets stay session-only
    }
    return false
  }
}

/** Short panel-facing summary, e.g. "rose · jewel". The bound image's name
 *  (imageName) is rendered on a second line by the pad row. */
export function presetSummary(p: Preset): string {
  return `${p.config.windowShape} · ${p.config.colorMode}`
}

import { DEFAULT_CONFIG, type GlassConfig } from './config'

/**
 * A performance pad preset: a full config snapshot plus an optional image
 * binding. Pads OWN their image: imageData holds a downscaled JPEG copy
 * captured at save time, so deleting the gallery image or reloading the
 * page never breaks a saved pad — loading materializes the copy back into
 * the gallery under its original id. A pad saved while the built-in demo
 * image was active has no binding (imageId null) and loads the demo.
 */
export interface Preset {
  config: GlassConfig
  imageId: string | null
  imageName?: string
  imageData?: string | null
}

export const PAD_COUNT = 4
export const PAD_LABELS = ['A', 'B', 'C', 'D'] as const

export type PresetSlots = (Preset | null)[]

const STORAGE_KEY = 'sgv-presets-v1'
const ACTIVE_PAD_KEY = 'sgv-active-pad'
const SET_TIP_KEY = 'sgv-set-tip-dismissed'

export function emptyPresets(): PresetSlots {
  return [null, null, null, null]
}

/** Keep only keys that exist in the current config schema (drops legacy keys). */
function sanitizeConfig(raw: Record<string, unknown>): GlassConfig {
  const clean = { ...DEFAULT_CONFIG }
  for (const k of Object.keys(clean) as (keyof GlassConfig)[]) {
    if (k in raw && typeof raw[k] === typeof clean[k]) {
      ;(clean as Record<string, unknown>)[k] = raw[k]
    }
  }
  return clean
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
          config: sanitizeConfig(p.config as Record<string, unknown>),
          imageId: typeof p.imageId === 'string' ? p.imageId : null,
          imageName: typeof p.imageName === 'string' ? p.imageName : undefined,
          imageData: typeof p.imageData === 'string' ? p.imageData : null,
        }
      }
    }
    return slots
  } catch {
    return emptyPresets()
  }
}

/**
 * Persist pads. Returns false when storage is full/unavailable — on quota
 * failure the write is retried without the embedded image copies (pads keep
 * working, images just can't survive deletion/reload).
 */
export function savePresets(slots: PresetSlots): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
    return true
  } catch {
    try {
      const slim = slots.map((p) => (p ? { ...p, imageData: null } : p))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
      return false
    } catch {
      return false
    }
  }
}

/** The always-targeted pad. Defaults to A (0); persisted across sessions. */
export function loadActivePad(): number {
  try {
    const n = parseInt(localStorage.getItem(ACTIVE_PAD_KEY) ?? '', 10)
    return n >= 0 && n < PAD_COUNT ? n : 0
  } catch {
    return 0
  }
}

export function saveActivePad(i: number) {
  try {
    localStorage.setItem(ACTIVE_PAD_KEY, String(i))
  } catch {
    // ignore
  }
}

/** "Do not remind again" for the Set (config mode) explainer popup. */
export function loadSetTipDismissed(): boolean {
  try {
    return localStorage.getItem(SET_TIP_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSetTipDismissed() {
  try {
    localStorage.setItem(SET_TIP_KEY, '1')
  } catch {
    // ignore
  }
}

/** Short panel-facing summary, e.g. "rose · jewel". */
export function presetSummary(p: Preset): string {
  return `${p.config.windowShape} · ${p.config.colorMode}`
}

import type { GlassConfig } from './config'

/**
 * A performance pad preset: a full config snapshot plus an optional image
 * reference. The image id is only meaningful within a session (gallery
 * images aren't persisted), so a dangling reference gracefully falls back
 * to whatever image is currently active.
 */
export interface Preset {
  config: GlassConfig
  imageId: string | null
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
        slots[i] = { config: p.config as GlassConfig, imageId: typeof p.imageId === 'string' ? p.imageId : null }
      }
    }
    return slots
  } catch {
    return emptyPresets()
  }
}

export function savePresets(slots: PresetSlots) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
  } catch {
    // storage full or unavailable — presets stay session-only
  }
}

/** Short panel-facing summary, e.g. "rose · jewel". */
export function presetSummary(p: Preset): string {
  return `${p.config.windowShape} · ${p.config.colorMode}`
}

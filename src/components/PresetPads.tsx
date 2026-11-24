import { useEffect, useRef, useState } from 'react'
import { PAD_LABELS, type PresetSlots } from '../lib/presets'

/** external flash request: pulse pad i (k is a nonce so repeats re-fire) */
export interface PadFlash {
  i: number
  k: number
}

interface Props {
  pads: PresetSlots
  /** index of the preset the current config was loaded from, if unmodified */
  activePad: number | null
  /** panel-armed "assign to pad" mode: next pad tap stores instead of triggering */
  assignMode: boolean
  /** flash requests from outside (keyboard triggers, panel saves) */
  flash: PadFlash | null
  onTrigger: (i: number) => void
  onAssign: (i: number) => void
}

/**
 * Shelved, not deleted: hold-to-assign. Revisit if we want gear-style
 * quick-overwrite without the panel; disabled because the mobile sheet
 * obscures the pads, making the gesture unreachable exactly when needed.
 */
const HOLD_ASSIGN_ENABLED = false
const HOLD_MS = 500

/**
 * Performance pads A–D. Tap a filled pad to trigger its look; tap an empty
 * pad (or any pad in assign mode) to store the current look there.
 * Desktop keys 1–4 mirror the pads.
 */
export function PresetPads({ pads, activePad, assignMode, flash, onTrigger, onAssign }: Props) {
  const holdTimer = useRef<number | null>(null)
  const heldRef = useRef(false)
  /** brief pulse on any pad interaction (tap, keyboard, panel save) */
  const [flashIdx, setFlashIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!flash) return
    setFlashIdx(flash.i)
    const t = window.setTimeout(() => setFlashIdx(null), 340)
    return () => window.clearTimeout(t)
  }, [flash])

  // --- shelved hold-to-assign path (see HOLD_ASSIGN_ENABLED) ---------------
  const pressStart = (i: number) => {
    heldRef.current = false
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true
      onAssign(i)
    }, HOLD_MS)
  }
  const pressCancel = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }
  // --------------------------------------------------------------------------

  const tap = (i: number) => {
    // the parent pulses the pad via the flash prop on assign/trigger
    if (HOLD_ASSIGN_ENABLED && heldRef.current) return // a hold already fired
    if (assignMode || !pads[i]) onAssign(i)
    else onTrigger(i)
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {assignMode && (
        <p className="rounded-full border border-accent/50 bg-panel/90 px-3 py-1 font-mono text-[10px] tracking-wider text-accent backdrop-blur">
          TAP A PAD TO SAVE THIS LOOK
        </p>
      )}
      <div
        className={`flex gap-2.5 rounded-2xl border px-3 py-2 backdrop-blur transition-colors ${
          assignMode ? 'border-accent/70 bg-panel/95' : 'border-widget/50 bg-panel/70'
        }`}
      >
        {PAD_LABELS.map((label, i) => {
          const filled = pads[i] !== null
          const isActive = activePad === i
          return (
            <button
              key={label}
              aria-label={
                filled ? `Pad ${label}: trigger preset` : `Pad ${label}: empty, press to assign`
              }
              title={
                filled ? `Pad ${label} — tap to trigger` : `Pad ${label} — tap to store current look`
              }
              onPointerDown={HOLD_ASSIGN_ENABLED ? () => pressStart(i) : undefined}
              onPointerLeave={HOLD_ASSIGN_ENABLED ? pressCancel : undefined}
              onClick={() => tap(i)}
              onContextMenu={(e) => e.preventDefault()}
              className={`relative flex h-14 w-14 select-none items-center justify-center rounded-xl border font-mono text-lg transition-all active:scale-95 ${
                isActive
                  ? 'border-accent bg-accent/20 text-accent shadow-[0_0_18px_rgba(255,200,120,0.35)]'
                  : filled
                    ? 'border-widget bg-widget/60 text-ink hover:border-accent/60'
                    : 'border-dashed border-widget text-dim/60 hover:border-dim hover:text-dim'
              } ${assignMode ? 'animate-pulse' : ''} ${flashIdx === i ? 'animate-padflash' : ''}`}
              style={{ touchAction: 'manipulation' }}
            >
              {label}
              <span className="absolute right-1 top-0.5 hidden font-mono text-[9px] text-dim/70 md:block">
                {i + 1}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

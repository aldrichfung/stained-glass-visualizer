import { useRef } from 'react'
import { PAD_LABELS, type PresetSlots } from '../lib/presets'

interface Props {
  pads: PresetSlots
  /** index of the preset the current config was loaded from, if unmodified */
  activePad: number | null
  /** panel-armed "assign to pad" mode: next pad tap stores instead of triggering */
  assignMode: boolean
  onTrigger: (i: number) => void
  onAssign: (i: number) => void
}

const HOLD_MS = 500

/**
 * Performance pads A–D. Tap triggers the stored look; hold (or assign mode
 * from the panel) stores the current look. Desktop keys 1–4 mirror the pads.
 */
export function PresetPads({ pads, activePad, assignMode, onTrigger, onAssign }: Props) {
  const holdTimer = useRef<number | null>(null)
  const heldRef = useRef(false)

  const pressStart = (i: number) => {
    heldRef.current = false
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true
      onAssign(i)
    }, HOLD_MS)
  }
  const pressEnd = (i: number) => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    if (heldRef.current) return // hold already fired
    if (assignMode || !pads[i]) onAssign(i)
    else onTrigger(i)
  }
  const pressCancel = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  return (
    <div
      className={`absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2.5 rounded-2xl border px-3 py-2 backdrop-blur transition-colors ${
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
            title={filled ? `Pad ${label} — hold to overwrite` : `Pad ${label} — tap to store current look`}
            onPointerDown={() => pressStart(i)}
            onPointerUp={() => pressEnd(i)}
            onPointerLeave={pressCancel}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative flex h-14 w-14 select-none items-center justify-center rounded-xl border font-mono text-lg transition-all active:scale-95 ${
              isActive
                ? 'border-accent bg-accent/20 text-accent shadow-[0_0_18px_rgba(255,200,120,0.35)]'
                : filled
                  ? 'border-widget bg-widget/60 text-ink hover:border-accent/60'
                  : 'border-dashed border-widget text-dim/60 hover:border-dim hover:text-dim'
            } ${assignMode ? 'animate-pulse' : ''}`}
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
  )
}

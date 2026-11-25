import { PAD_LABELS, type PresetSlots } from '../lib/presets'

interface Props {
  pads: PresetSlots
  /** the always-targeted pad — exactly one pad is highlighted at all times */
  activePad: number
  /** pad in Set (config) mode, if any: pulses and confirms on next press */
  armedPad: number | null
  onTrigger: (i: number) => void
}

/**
 * Performance pads A–D. A press always LOADS the pad (empty pads load the
 * default look) — pads never save on press. Saving lives in the control
 * panel's Set flow. Desktop keys 1–4 mirror the pads.
 */
export function PresetPads({ pads, activePad, armedPad, onTrigger }: Props) {
  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2.5 rounded-2xl border border-widget/50 bg-panel/70 px-3 py-2 backdrop-blur transition-colors">
      {PAD_LABELS.map((label, i) => {
        const filled = pads[i] !== null
        const isActive = activePad === i
        const isArmed = armedPad === i
        return (
          <button
            key={label}
            aria-label={
              isArmed
                ? `Pad ${label}: press again to save this look`
                : filled
                  ? `Pad ${label}: load preset`
                  : `Pad ${label}: empty, loads default look`
            }
            title={isArmed ? `Pad ${label} — press again to confirm` : `Pad ${label}`}
            onClick={() => onTrigger(i)}
            className={`relative flex h-14 w-14 select-none items-center justify-center rounded-xl border font-mono text-lg transition-all active:scale-95 ${
              isActive
                ? 'border-accent bg-accent/20 text-accent shadow-[0_0_18px_rgba(255,200,120,0.35)]'
                : filled
                  ? 'border-widget bg-widget/60 text-ink hover:border-accent/60'
                  : 'border-dashed border-widget text-dim/60 hover:border-dim hover:text-dim'
            } ${isArmed ? 'animate-pulse border-accent' : ''}`}
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

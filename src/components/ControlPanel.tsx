import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  COLOR_LABELS,
  FIT_LABELS,
  MAPPING_LABELS,
  PATTERN_LABELS,
  WINDOW_LABELS,
  type ColorMode,
  type EnergyMapping,
  type FitMode,
  type GlassConfig,
  type PatternMode,
  type WindowShape,
} from '../lib/config'
import {
  AudioLines,
  FileMusic,
  HelpCircle,
  Mic,
  MonitorSpeaker,
  Pause,
  Play,
  Plus,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import type { ListenMode } from '../lib/audio/engine'
import { PAD_LABELS, isPresetCustom, type PresetSlots } from '../lib/presets'

export interface AudioState {
  fileName: string | null
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  demoActive: boolean
  listenMode: ListenMode | null
}

interface Props {
  config: GlassConfig
  onConfig: (patch: Partial<GlassConfig>) => void
  audio: AudioState
  onAudioFile: (f: File) => void
  onTogglePlay: () => void
  onSeek: (t: number) => void
  onVolume: (v: number) => void
  onToggleDemo: () => void
  presets: PresetSlots
  /** the always-targeted pad — exactly one at all times */
  activePad: number
  /** pressing a pad row loads it */
  onTriggerPad: (i: number) => void
  /** Set immediately saves the current settings onto the targeted pad */
  onSetPad: (i: number) => void
  onClearPad: (i: number) => void
  /** per-pad image binding: upload saves ONLY the image onto that pad */
  onPadImageFile: (i: number, f: File) => void
  /** removes just the pad's image (config stays); the pad falls back to its built-in default */
  onRemovePadImage: (i: number) => void
  /** auto-cycle driver: off, every autoSec seconds, or every beatDiv beats */
  autoMode: 'off' | 'timed' | 'beat'
  /** set when the user edits settings mid-cycle — resumed by Set or the toggle */
  autoPaused: boolean
  autoSec: number
  /** beat mode: advance every N detected beats (one of 2/4/8/16/32) */
  beatDiv: number
  onAutoToggle: () => void
  onAutoSec: (n: number) => void
  onBeatDiv: (n: number) => void
  /** when provided, shows a close button (desktop docked panel) */
  onClose?: () => void
  onListenDevice: () => void
  onListenMic: () => void
  onStopListen: () => void
  /** false on browsers without display capture (e.g. iOS) — hides the button */
  canDeviceCapture: boolean
  listenError: string | null
}

function fmt(t: number) {
  if (!isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

/** beat-mode divider choices — must mirror Home.tsx */
const BEAT_DIVS = [2, 4, 8, 16, 32] as const

/** Small circular "?" affordance; reveals its text as a small overlay on tap. */
function Hint({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={`${label} — what does this do?`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-dim/50 text-dim/70 transition-colors hover:border-accent hover:text-accent"
      >
        <HelpCircle className="h-2.5 w-2.5" />
      </button>
      {open && (
        <span className="absolute left-0 top-5 z-30 block w-52 rounded-md border border-widget bg-void/95 p-2 font-mono text-[10px] normal-case leading-relaxed tracking-normal text-dim shadow-lg shadow-black/50">
          {text}
        </span>
      )}
    </span>
  )
}

function Row({
  label,
  value,
  hint,
  children,
}: {
  label: string
  value?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-dim">
          {label}
          {hint && <Hint label={label} text={hint} />}
        </span>
        {value && <span className="font-mono text-[11px] text-accent">{value}</span>}
      </div>
      {children}
    </div>
  )
}

export function ControlPanel(p: Props) {
  const audioInput = useRef<HTMLInputElement>(null)
  const c = p.config

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 slim-scroll">
      {p.onClose && (
        <div className="-mb-3 flex justify-end">
          <button
            type="button"
            aria-label="Close controls"
            onClick={p.onClose}
            className="rounded-md p-1.5 text-dim transition-colors hover:bg-widget hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* AUDIO */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink/80">Audio</h2>
        <input
          ref={audioInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) p.onAudioFile(f)
            e.target.value = ''
          }}
        />
        <Button
          variant="outline"
          className="h-11 w-full justify-start gap-2 border-widget bg-widget/40 text-ink hover:bg-widget hover:text-ink"
          onClick={() => audioInput.current?.click()}
        >
          <FileMusic className="h-4 w-4 text-accent" />
          <span className="truncate text-sm">{p.audio.fileName ?? 'Choose audio file…'}</span>
        </Button>

        {p.audio.listenMode ? (
          <div className="flex items-center gap-2 rounded-md border border-lime/40 bg-lime/10 p-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lime" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {p.audio.listenMode === 'device' ? 'Listening — device audio' : 'Listening — microphone'}
            </span>
            <Button
              size="icon"
              aria-label="Stop listening"
              onClick={p.onStopListen}
              className="h-8 w-8 shrink-0 bg-widget text-ink hover:bg-[#4f4f4f]"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                aria-label={p.audio.playing && !p.audio.demoActive ? 'Pause' : 'Play'}
                className="h-11 w-11 shrink-0 bg-widget text-ink hover:bg-[#4f4f4f] disabled:opacity-40"
                disabled={!p.audio.fileName}
                onClick={p.onTogglePlay}
              >
                {p.audio.playing && !p.audio.demoActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="min-w-0 flex-1 space-y-1">
                <Slider
                  value={[p.audio.duration ? (p.audio.currentTime / p.audio.duration) * 100 : 0]}
                  max={100}
                  step={0.1}
                  disabled={!p.audio.fileName}
                  onValueChange={([v]) => p.audio.duration && p.onSeek((v / 100) * p.audio.duration)}
                  aria-label="Seek"
                />
                <div className="flex justify-between font-mono text-[10px] text-dim">
                  <span>{fmt(p.audio.currentTime)}</span>
                  <span>{fmt(p.audio.duration)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 shrink-0 text-dim" />
              <Slider
                value={[p.audio.volume * 100]}
                max={100}
                onValueChange={([v]) => p.onVolume(v / 100)}
                aria-label="Volume"
              />
            </div>
          </>
        )}

        <Button
          variant="outline"
          className={`h-11 w-full justify-start gap-2 border-widget text-ink hover:bg-widget hover:text-ink ${
            p.audio.demoActive ? 'bg-lime/20 text-lime' : 'bg-widget/40'
          }`}
          onClick={p.onToggleDemo}
        >
          <Sparkles className={`h-4 w-4 ${p.audio.demoActive ? 'text-lime' : 'text-accent'}`} />
          <span className="text-sm">{p.audio.demoActive ? 'Stop demo tone' : 'Play demo tone'}</span>
        </Button>

        {!p.audio.listenMode && (
          <div className="space-y-1.5">
            {p.canDeviceCapture && (
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2 border-widget bg-widget/40 text-ink hover:bg-widget hover:text-ink"
                onClick={p.onListenDevice}
              >
                <MonitorSpeaker className="h-4 w-4 text-accent" />
                <span className="text-sm">Listen to device audio</span>
              </Button>
            )}
            <Button
              variant="outline"
              className="h-11 w-full justify-start gap-2 border-widget bg-widget/40 text-ink hover:bg-widget hover:text-ink"
              onClick={p.onListenMic}
            >
              <Mic className="h-4 w-4 text-accent" />
              <span className="text-sm">Listen via microphone</span>
            </Button>
            <p className="text-[11px] leading-snug text-dim">
              {p.canDeviceCapture
                ? 'React to Spotify, YouTube, or anything playing on this device. Choose “Entire Screen” in the picker and tick “Also share system audio”.'
                : 'React to any music playing out loud — the visualizer listens through your microphone.'}
            </p>
            {IS_ANDROID && (
              <p className="rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] leading-snug text-amber-300">
                Heads-up: a known Chrome bug on Android can leave your browser audio quiet after mic
                listening. If that happens, restarting the phone restores it. Firefox is unaffected.
              </p>
            )}
            {p.listenError && (
              <p className="rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] leading-snug text-amber-300">
                {p.listenError}
              </p>
            )}
          </div>
        )}
      </section>

      <Separator className="bg-widget" />

      {/* PERFORMANCE PADS — pressing a pad loads it; Set maps the current settings onto it.
          Each row owns its image: + uploads straight onto the pad, the corner X removes
          just the image, the row X clears the whole pad. */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink/80">Performance pads</h2>
        <div className="space-y-1.5">
          {PAD_LABELS.map((label, i) => {
            const preset = p.presets[i]
            const isActive = p.activePad === i
            // status chip: red = default look, green = a custom look (any
            // setting or image differing from default) is saved on this pad
            const custom = preset ? isPresetCustom(preset) : false
            const hasImage = !!preset?.imageId && !!preset?.imageData
            return (
              <div
                key={label}
                role="button"
                tabIndex={0}
                aria-label={`Pad ${label}: load`}
                aria-current={isActive}
                onClick={() => p.onTriggerPad(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    p.onTriggerPad(i)
                  }
                }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
                  isActive ? 'border-accent/70 bg-accent/10' : 'border-widget bg-widget/30'
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label={`Image file for pad ${label}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) p.onPadImageFile(i, f)
                    e.target.value = ''
                  }}
                />
                <span
                  aria-label={`Pad ${label}: ${custom ? 'custom look saved' : 'default look'}`}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-xs ${
                    custom
                      ? 'border-green-500/70 bg-green-500/15 text-green-400'
                      : 'border-red-500/60 bg-red-500/10 text-red-400'
                  }`}
                >
                  {label}
                </span>
                {hasImage ? (
                  <span className="group relative h-10 w-10 shrink-0">
                    <img
                      src={preset!.imageData!}
                      alt={`Pad ${label} image`}
                      title={preset!.imageName ?? 'pad image'}
                      className="h-10 w-10 rounded-md border border-widget object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove image from pad ${label}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        p.onRemovePadImage(i)
                      }}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-void/90 text-dim opacity-60 transition-opacity hover:text-ink md:opacity-0 md:group-hover:opacity-100"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Upload image to pad ${label}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.currentTarget.parentElement
                        ?.querySelector<HTMLInputElement>(`input[aria-label="Image file for pad ${label}"]`)
                        ?.click()
                    }}
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-widget font-mono text-[11px] text-dim transition-colors hover:border-accent hover:text-accent"
                  >
                    <Plus className="h-4 w-4" />
                    upload image
                  </button>
                )}
                {hasImage && <span className="flex-1" />}
                {preset && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Clear pad ${label}`}
                    className="h-7 w-7 shrink-0 text-dim hover:bg-widget/60 hover:text-ink"
                    onClick={(e) => {
                      e.stopPropagation()
                      p.onClearPad(i)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
        {/* auto-cycle: one button walks off → timed → beat → off; the slider
            follows the mode — seconds in timed, beats-per-switch in beat */}
        <div className="flex items-center gap-2.5 pt-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              p.autoMode === 'off'
                ? 'Start auto-cycle'
                : p.autoPaused
                  ? 'Resume auto-cycle'
                  : p.autoMode === 'timed'
                    ? 'Switch auto-cycle to beat mode'
                    : 'Stop auto-cycle'
            }
            onClick={p.onAutoToggle}
            className={`h-8 w-8 shrink-0 ${p.autoMode !== 'off' ? 'text-accent' : 'text-dim'} hover:bg-widget/60`}
          >
            {p.autoMode === 'off' || p.autoPaused ? (
              <Play className="h-4 w-4" />
            ) : p.autoMode === 'timed' ? (
              <AudioLines className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </Button>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-dim">
            auto-cycle
          </span>
          {p.autoMode === 'beat' ? (
            <Slider
              aria-label="Beat divider"
              min={0}
              max={BEAT_DIVS.length - 1}
              step={1}
              value={[Math.max(0, BEAT_DIVS.indexOf(p.beatDiv as (typeof BEAT_DIVS)[number]))]}
              onValueChange={([i]) => p.onBeatDiv(BEAT_DIVS[i])}
              className="flex-1"
            />
          ) : (
            <Slider
              aria-label="Auto-cycle interval"
              min={1}
              max={10}
              step={1}
              value={[p.autoSec]}
              onValueChange={([v]) => p.onAutoSec(v)}
              className="flex-1"
            />
          )}
          <span
            aria-label="Auto-cycle value"
            className={`shrink-0 text-right font-mono text-[11px] text-ink ${p.autoMode === 'beat' ? 'w-14' : 'w-7'}`}
          >
            {p.autoMode === 'beat' ? `${p.beatDiv} beats` : `${p.autoSec}s`}
          </span>
        </div>
        {p.autoMode !== 'off' && p.autoPaused && (
          <p className="font-mono text-[10px] text-amber-400/80">
            paused while editing — Set a pad or press play to resume
          </p>
        )}
      </section>

      <Separator className="bg-widget" />

      {/* GLASS */}
      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink/80">Glass</h2>
        <Row label="Setting">
          <Select
            value={c.windowShape}
            onValueChange={(v) => p.onConfig({ windowShape: v as WindowShape })}
          >
            <SelectTrigger className="h-11 border-widget bg-widget/40 text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-widget bg-panel text-ink">
              {(Object.keys(WINDOW_LABELS) as WindowShape[]).map((k) => (
                <SelectItem key={k} value={k} className="focus:bg-widget">
                  {WINDOW_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Image fit">
          <Select
            value={c.fitMode}
            onValueChange={(v) => p.onConfig({ fitMode: v as FitMode })}
          >
            <SelectTrigger className="h-11 border-widget bg-widget/40 text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-widget bg-panel text-ink">
              {(Object.keys(FIT_LABELS) as FitMode[]).map((k) => (
                <SelectItem key={k} value={k} className="focus:bg-widget">
                  {FIT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Window size" value={`${Math.round(c.windowSize * 100)}%`}>
          <Slider
            value={[c.windowSize * 100]}
            min={50}
            max={100}
            step={2}
            onValueChange={([v]) => p.onConfig({ windowSize: v / 100 })}
            aria-label="Window size"
          />
        </Row>
        <div className={c.fitMode === 'contain' ? 'pointer-events-none opacity-35' : ''}>
          <Row
            label="Window aspect"
            value={c.fitMode === 'contain' ? 'from image' : `${c.windowAspect.toFixed(2)}×`}
          >
            <Slider
              value={[c.windowAspect * 100]}
              min={60}
              max={160}
              step={5}
              disabled={c.fitMode === 'contain'}
              onValueChange={([v]) => p.onConfig({ windowAspect: v / 100 })}
              aria-label="Window aspect"
            />
          </Row>
        </div>
        <Row label="Pattern">
          <Select value={c.pattern} onValueChange={(v) => p.onConfig({ pattern: v as PatternMode })}>
            <SelectTrigger className="h-11 border-widget bg-widget/40 text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-widget bg-panel text-ink">
              {(Object.keys(PATTERN_LABELS) as PatternMode[]).map((k) => (
                <SelectItem key={k} value={k} className="focus:bg-widget">
                  {PATTERN_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Cell density" value={`${c.density}`}>
          <Slider
            value={[c.density]}
            min={150}
            max={2600}
            step={50}
            onValueChange={([v]) => p.onConfig({ density: v })}
            aria-label="Cell density"
          />
        </Row>
        <Row label="Grid thickness" value={`${c.leadWidth}px`}>
          <Slider
            value={[c.leadWidth]}
            min={1}
            max={10}
            step={0.5}
            onValueChange={([v]) => p.onConfig({ leadWidth: v })}
            aria-label="Grid thickness"
          />
        </Row>
      </section>

      <Separator className="bg-widget" />

      {/* REACTION */}
      <section className="space-y-4 pb-2">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink/80">Reaction</h2>
        <Row label="Color treatment">
          <Select value={c.colorMode} onValueChange={(v) => p.onConfig({ colorMode: v as ColorMode })}>
            <SelectTrigger className="h-11 border-widget bg-widget/40 text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-widget bg-panel text-ink">
              {(Object.keys(COLOR_LABELS) as ColorMode[]).map((k) => (
                <SelectItem key={k} value={k} className="focus:bg-widget">
                  {COLOR_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Frequency mapping">
          <Select value={c.mapping} onValueChange={(v) => p.onConfig({ mapping: v as EnergyMapping })}>
            <SelectTrigger className="h-11 border-widget bg-widget/40 text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-widget bg-panel text-ink">
              {(Object.keys(MAPPING_LABELS) as EnergyMapping[]).map((k) => (
                <SelectItem key={k} value={k} className="focus:bg-widget">
                  {MAPPING_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Reactivity" value={`${Math.round(c.reactivity * 100)}%`}>
          <Slider
            value={[c.reactivity * 100]}
            min={0}
            max={200}
            step={5}
            onValueChange={([v]) => p.onConfig({ reactivity: v / 100 })}
            aria-label="Reactivity"
          />
        </Row>
        <Row label="Punch" value={`${Math.round(c.punch * 100)}%`} hint="Low: smooth sustained glow · High: sharp onset spikes per hit">
          <Slider
            value={[c.punch * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => p.onConfig({ punch: v / 100 })}
            aria-label="Punch"
          />
        </Row>
        <Row label="Strobe" value={`${Math.round(c.strobe * 100)}%`} hint="How fast each pane flashes and falls after a hit">
          <Slider
            value={[c.strobe * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => p.onConfig({ strobe: v / 100 })}
            aria-label="Strobe"
          />
        </Row>
        {c.strobe > 0.8 && (
          <p className="border border-lime/40 bg-lime/10 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-lime">
            ⚠ Photosensitivity notice: high strobe produces rapid flashing light.
          </p>
        )}
        <Row label="Fog / haze" value={`${Math.round(c.fog * 100)}%`}>
          <Slider
            value={[c.fog * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => p.onConfig({ fog: v / 100 })}
            aria-label="Fog level"
          />
        </Row>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-dim">Beat pulse</span>
          <Switch
            checked={c.beatPulse}
            onCheckedChange={(v) => p.onConfig({ beatPulse: v })}
            aria-label="Beat pulse"
          />
        </div>
        <div className={c.beatPulse ? '' : 'opacity-40'}>
          <Row label="Pulse Strength" value={`${Math.round(c.pulseStrength * 100)}%`}>
            <Slider
              value={[c.pulseStrength * 100]}
              min={0}
              max={100}
              step={5}
              disabled={!c.beatPulse}
              onValueChange={([v]) => p.onConfig({ pulseStrength: v / 100 })}
              aria-label="Pulse Strength"
            />
          </Row>
        </div>
      </section>

      {/* build stamp: settle "am I on the new build?" at a glance */}
      <p className="pt-2 text-center font-mono text-[9px] text-dim/40">
        build {__BUILD_SHA__} · {__BUILD_TIME__.slice(0, 16).replace('T', ' ')}Z
      </p>
      </div>

      {/* anchored Set — saves current settings + image onto the targeted pad */}
      <div className="shrink-0 border-t border-widget/60 bg-panel p-3">
        <Button
          aria-label={`Set pad ${PAD_LABELS[p.activePad]}`}
          onClick={() => p.onSetPad(p.activePad)}
          className="h-11 w-full gap-2 bg-accent font-mono text-xs uppercase tracking-[0.2em] text-void hover:bg-accent/85"
        >
          Set · pad {PAD_LABELS[p.activePad]}
        </Button>
      </div>
    </div>
  )
}

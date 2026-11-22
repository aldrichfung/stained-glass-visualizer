import { useRef } from 'react'
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
  FileMusic,
  ImageIcon,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
} from 'lucide-react'

export interface AudioState {
  fileName: string | null
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  demoActive: boolean
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
  imageName: string | null
  onImageFile: (f: File) => void
  onResetImage: () => void
}

function fmt(t: number) {
  if (!isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-dim">{label}</span>
        {value && <span className="font-mono text-[11px] text-accent">{value}</span>}
      </div>
      {children}
    </div>
  )
}

export function ControlPanel(p: Props) {
  const audioInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const c = p.config

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4 slim-scroll">
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
      </section>

      <Separator className="bg-widget" />

      {/* IMAGE */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink/80">Reference image</h2>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) p.onImageFile(f)
            e.target.value = ''
          }}
        />
        <Button
          variant="outline"
          className="h-11 w-full justify-start gap-2 border-widget bg-widget/40 text-ink hover:bg-widget hover:text-ink"
          onClick={() => imageInput.current?.click()}
        >
          <ImageIcon className="h-4 w-4 text-accent" />
          <span className="truncate text-sm">{p.imageName ?? 'Upload reference image…'}</span>
        </Button>
        {p.imageName && (
          <Button
            variant="ghost"
            className="h-9 w-full justify-start gap-2 text-dim hover:bg-widget/60 hover:text-ink"
            onClick={p.onResetImage}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="text-xs">Restore built-in rose window</span>
          </Button>
        )}
        <p className="font-mono text-[10px] leading-relaxed text-dim/70">
          Tip: you can also drag &amp; drop audio or image files anywhere onto the canvas.
        </p>
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
        <Row label="Lead thickness" value={`${c.leadWidth}px`}>
          <Slider
            value={[c.leadWidth]}
            min={1}
            max={10}
            step={0.5}
            onValueChange={([v]) => p.onConfig({ leadWidth: v })}
            aria-label="Lead thickness"
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
        <Row label="Punch" value={`${Math.round(c.punch * 100)}%`}>
          <Slider
            value={[c.punch * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => p.onConfig({ punch: v / 100 })}
            aria-label="Punch"
          />
        </Row>
        <p className="-mt-2 font-mono text-[10px] leading-relaxed text-dim/70">
          Low: smooth sustained glow · High: sharp onset spikes per hit
        </p>
        <Row label="Strobe" value={`${Math.round(c.strobe * 100)}%`}>
          <Slider
            value={[c.strobe * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => p.onConfig({ strobe: v / 100 })}
            aria-label="Strobe"
          />
        </Row>
        <p className="-mt-2 font-mono text-[10px] leading-relaxed text-dim/70">
          How fast each pane flashes and falls after a hit
        </p>
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
        {c.beatPulse && (
          <Row label="Pulse strength" value={`${Math.round(c.pulseStrength * 100)}%`}>
            <Slider
              value={[c.pulseStrength * 100]}
              min={0}
              max={100}
              step={5}
              onValueChange={([v]) => p.onConfig({ pulseStrength: v / 100 })}
              aria-label="Pulse strength"
            />
          </Row>
        )}
      </section>
    </div>
  )
}

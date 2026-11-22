import { useCallback, useEffect, useRef, useState } from 'react'
import '../App.css'
import { AudioEngine } from '../lib/audio/engine'
import { DEFAULT_CONFIG, type GlassConfig } from '../lib/config'
import { createDemoImage } from '../lib/demoImage'
import { VisualizerCanvas } from '../components/VisualizerCanvas'
import { ControlPanel, type AudioState } from '../components/ControlPanel'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { SlidersHorizontal } from 'lucide-react'

export default function Home() {
  const engineRef = useRef<AudioEngine | null>(null)
  if (!engineRef.current) engineRef.current = new AudioEngine()
  const engine = engineRef.current

  const [config, setConfig] = useState<GlassConfig>(DEFAULT_CONFIG)
  const [image, setImage] = useState<HTMLCanvasElement | HTMLImageElement | null>(null)
  const [imageName, setImageName] = useState<string | null>(null)
  const [audio, setAudio] = useState<AudioState>({
    fileName: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 0.9,
    demoActive: false,
  })
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [panelOpen, setPanelOpen] = useState(false)

  // built-in rose window on first mount
  useEffect(() => {
    setImage(createDemoImage())
    engine.audio.volume = 0.9
  }, [engine])

  // transport state polling
  useEffect(() => {
    const id = window.setInterval(() => {
      setAudio((a) => ({
        ...a,
        playing: engine.playing,
        currentTime: engine.audio.currentTime,
        duration: engine.audio.duration || 0,
        demoActive: engine.demoActive,
      }))
    }, 250)
    return () => clearInterval(id)
  }, [engine])

  const patchConfig = useCallback(
    (patch: Partial<GlassConfig>) => setConfig((c) => ({ ...c, ...patch })),
    [],
  )

  const loadAudioFile = useCallback(
    (f: File) => {
      engine.loadFile(f)
      setAudio((a) => ({ ...a, fileName: f.name }))
      void engine.play().catch(() => {})
    },
    [engine],
  )

  const loadImageFile = useCallback((f: File) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      setImage(img)
      setImageName(f.name)
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (!f) return
      if (f.type.startsWith('audio/')) loadAudioFile(f)
      else if (f.type.startsWith('image/')) loadImageFile(f)
    },
    [loadAudioFile, loadImageFile],
  )

  const panel = (
    <ControlPanel
      config={config}
      onConfig={patchConfig}
      audio={audio}
      onAudioFile={loadAudioFile}
      onTogglePlay={() => {
        if (audio.playing && !audio.demoActive) engine.pause()
        else void engine.play().catch(() => {})
      }}
      onSeek={(t) => {
        engine.audio.currentTime = t
      }}
      onVolume={(v) => {
        engine.audio.volume = v
        setAudio((a) => ({ ...a, volume: v }))
      }}
      onToggleDemo={() => {
        engine.toggleDemo()
      }}
      imageName={imageName}
      onImageFile={loadImageFile}
      onResetImage={() => {
        setImage(createDemoImage())
        setImageName(null)
      }}
    />
  )

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden bg-void"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current++
        setDragging(true)
      }}
      onDragLeave={() => {
        dragDepth.current--
        if (dragDepth.current <= 0) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <VisualizerCanvas engine={engine} config={config} image={image} />

      {/* header */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
        <div>
          <h1 className="font-mono text-sm tracking-[0.3em] text-ink">STAINED GLASS</h1>
          <p className="mt-0.5 font-mono text-[11px] text-dim">
            audio-reactive rose engine · drop audio + image
          </p>
        </div>
        <a
          href="https://github.com/aldrichfung/stained-glass-visualizer"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto font-mono text-[11px] text-accent underline-offset-4 hover:underline"
        >
          github
        </a>
      </header>

      {/* desktop panel */}
      <aside className="absolute bottom-0 right-0 top-0 z-20 hidden w-[300px] border-l border-widget/60 bg-panel/90 backdrop-blur md:block">
        {panel}
      </aside>

      {/* mobile panel trigger */}
      <div className="absolute bottom-4 right-4 z-20 md:hidden">
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetTrigger asChild>
            <Button
              size="icon"
              aria-label="Open controls"
              className="h-12 w-12 rounded-full bg-panel text-accent shadow-lg shadow-black/60 hover:bg-widget"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="h-[78dvh] border-widget bg-panel p-0 text-ink"
          >
            {panel}
          </SheetContent>
        </Sheet>
      </div>

      {/* drag overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-accent/70 bg-void/70">
          <p className="font-mono text-sm tracking-widest text-accent">DROP AUDIO OR IMAGE</p>
        </div>
      )}
    </div>
  )
}

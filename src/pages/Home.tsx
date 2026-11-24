import { useCallback, useEffect, useRef, useState } from 'react'
import '../App.css'
import { AudioEngine } from '../lib/audio/engine'
import { DEFAULT_CONFIG, type GlassConfig } from '../lib/config'
import { createDemoImage } from '../lib/demoImage'
import { MAX_IMAGES, loadGalleryImage, type GalleryImage } from '../lib/gallery'
import { loadPresets, savePresets, type PresetSlots } from '../lib/presets'
import { VisualizerCanvas } from '../components/VisualizerCanvas'
import { PresetPads } from '../components/PresetPads'
import { ControlPanel, type AudioState } from '../components/ControlPanel'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { SlidersHorizontal } from 'lucide-react'

function demoGalleryImage(): GalleryImage {
  const canvas = createDemoImage()
  return { id: 'demo', name: 'Built-in rose window', img: canvas, url: canvas.toDataURL() }
}

export default function Home() {
  const engineRef = useRef<AudioEngine | null>(null)
  if (!engineRef.current) engineRef.current = new AudioEngine()
  const engine = engineRef.current

  const [config, setConfig] = useState<GlassConfig>(DEFAULT_CONFIG)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [audio, setAudio] = useState<AudioState>({
    fileName: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 0.9,
    demoActive: false,
    listenMode: null,
  })
  const [listenError, setListenError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(true)
  // performance pads A–D: user-saved looks, persisted in this browser
  const [presets, setPresets] = useState<PresetSlots>(loadPresets)
  const [activePad, setActivePad] = useState<number | null>(null)
  const [assignMode, setAssignMode] = useState(false)

  // built-in rose window on first mount
  useEffect(() => {
    setImages([demoGalleryImage()])
    engine.audio.volume = 0.9
  }, [engine])

  // Esc closes the desktop panel and cancels pad-assign mode (dropdowns and
  // sheets handle their own Esc first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDesktopPanelOpen(false)
        setAssignMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // persist pads whenever they change
  useEffect(() => {
    savePresets(presets)
  }, [presets])

  // transport state polling
  useEffect(() => {
    const id = window.setInterval(() => {
      setAudio((a) => ({
        ...a,
        playing: engine.playing,
        currentTime: engine.audio.currentTime,
        duration: engine.audio.duration || 0,
        demoActive: engine.demoActive,
        listenMode: engine.listenMode,
      }))
    }, 250)
    return () => clearInterval(id)
  }, [engine])

  // gallery cycling: only while music plays (any source), 1–10s per image
  useEffect(() => {
    if (images.length < 2 || !audio.playing) return
    const ms = Math.max(1, Math.min(10, config.cycleSec)) * 1000
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % images.length)
    }, ms)
    return () => clearInterval(id)
  }, [images.length, audio.playing, config.cycleSec])

  const patchConfig = useCallback(
    (patch: Partial<GlassConfig>) => {
      setActivePad(null) // manual tweak = no longer "on" a pad
      setConfig((c) => ({ ...c, ...patch }))
    },
    [],
  )

  // ---- performance pads ---------------------------------------------------
  const assignPad = useCallback(
    (i: number) => {
      setAssignMode(false)
      setPresets((prev) => {
        const next = [...prev]
        next[i] = { config, imageId: images[activeIndex]?.id ?? null }
        return next
      })
      setActivePad(i)
    },
    [config, images, activeIndex],
  )

  const triggerPad = useCallback(
    (i: number) => {
      const p = presets[i]
      if (!p) {
        setAssignMode(true) // empty pad: tap arms assignment
        return
      }
      // merge over defaults so presets saved by older versions stay valid
      setConfig({ ...DEFAULT_CONFIG, ...p.config })
      if (p.imageId) {
        const idx = images.findIndex((im) => im.id === p.imageId)
        if (idx >= 0) setActiveIndex(idx) // missing image: keep current
      }
      setActivePad(i)
    },
    [presets, images],
  )

  const clearPad = useCallback((i: number) => {
    setPresets((prev) => {
      const next = [...prev]
      next[i] = null
      return next
    })
    setActivePad((ap) => (ap === i ? null : ap))
  }, [])

  // desktop: keys 1–4 trigger pads (never while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
        return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= presets.length) triggerPad(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presets.length, triggerPad])

  const loadAudioFile = useCallback(
    (f: File) => {
      engine.loadFile(f)
      setAudio((a) => ({ ...a, fileName: f.name }))
      void engine.play().catch(() => {})
    },
    [engine],
  )

  // Device audio capture (screen/tab share). Picker defaults to Entire
  // Screen with system audio — one grant per session covers every source:
  // Spotify app, YouTube tab, Apple Music, anything the OS plays.
  const startDeviceListen = useCallback(async () => {
    setListenError(null)
    engine.ensureRunning()
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          systemAudio: 'include',
        },
        displaySurface: 'monitor',
        surfaceSwitching: 'include',
        selfBrowserSurface: 'exclude',
      } as DisplayMediaStreamOptions)
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop())
        setListenError(
          'No audio came through. Please try again — in the picker, choose "Entire Screen" and tick "Also share system audio" (or pick a browser tab and tick "Also share tab audio").',
        )
        return
      }
      // video is mandatory for the API but we only need the sound
      stream.getVideoTracks().forEach((t) => t.stop())
      engine.listen(stream, 'device')
    } catch (err) {
      // user dismissed the picker — not an error worth shouting about
      if ((err as DOMException)?.name === 'NotAllowedError') return
      setListenError('Screen/audio capture is not available in this browser. Try Chrome or Edge on desktop, or use the microphone instead.')
    }
  }, [engine])

  const startMicListen = useCallback(async () => {
    setListenError(null)
    engine.ensureRunning()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      engine.listen(stream, 'mic')
    } catch (err) {
      if ((err as DOMException)?.name === 'NotAllowedError') {
        setListenError('Microphone permission was denied. Allow mic access in your browser settings and try again.')
      } else {
        setListenError('No microphone is available on this device.')
      }
    }
  }, [engine])

  const stopListen = useCallback(() => {
    engine.stopListen()
    setListenError(null)
  }, [engine])

  // first upload replaces the built-in demo; the gallery caps at 5
  const addImageFiles = useCallback((files: File[]) => {
    const accepted = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGES)
    if (!accepted.length) return
    void Promise.all(accepted.map(loadGalleryImage)).then((loaded) => {
      const ok = loaded.filter((x): x is GalleryImage => x !== null)
      if (!ok.length) return
      setImages((prev) => {
        const base = prev.length === 1 && prev[0].id === 'demo' ? [] : prev
        const room = Math.max(0, MAX_IMAGES - base.length)
        ok.slice(room).forEach((o) => URL.revokeObjectURL(o.url))
        return [...base, ...ok.slice(0, room)]
      })
    })
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const idx = prev.findIndex((im) => im.id === id)
      if (idx < 0) return prev
      const removed = prev[idx]
      if (removed.id !== 'demo') URL.revokeObjectURL(removed.url)
      const next = prev.filter((im) => im.id !== id)
      setActiveIndex((ai) => {
        const shifted = ai > idx ? ai - 1 : ai
        return Math.max(0, Math.min(shifted, next.length - 1))
      })
      // never leave the gallery empty — fall back to the demo window
      return next.length ? next : [demoGalleryImage()]
    })
  }, [])

  const resetImages = useCallback(() => {
    setImages((prev) => {
      prev.forEach((im) => {
        if (im.id !== 'demo') URL.revokeObjectURL(im.url)
      })
      return [demoGalleryImage()]
    })
    setActiveIndex(0)
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer.files ?? [])
      const audioFile = files.find((f) => f.type.startsWith('audio/'))
      if (audioFile) loadAudioFile(audioFile)
      const imageFiles = files.filter((f) => f.type.startsWith('image/'))
      if (imageFiles.length) addImageFiles(imageFiles)
    },
    [loadAudioFile, addImageFiles],
  )

  const panel = (onClose?: () => void) => (
    <ControlPanel
      onClose={onClose}
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
      images={images}
      activeImageIndex={activeIndex}
      onImageFiles={addImageFiles}
      onSelectImage={setActiveIndex}
      onRemoveImage={removeImage}
      onResetImages={resetImages}
      presets={presets}
      activePad={activePad}
      onAssignPad={assignPad}
      onTriggerPad={triggerPad}
      onClearPad={clearPad}
      onListenDevice={startDeviceListen}
      onListenMic={startMicListen}
      onStopListen={stopListen}
      canDeviceCapture={typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia}
      listenError={listenError}
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
      <VisualizerCanvas engine={engine} config={config} images={images} activeIndex={activeIndex} presets={presets} />

      {/* performance pads A–D */}
      <PresetPads
        pads={presets}
        activePad={activePad}
        assignMode={assignMode}
        onTrigger={triggerPad}
        onAssign={assignPad}
      />

      {/* header */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
        <div>
          <h1 className="font-mono text-sm tracking-[0.3em] text-ink">STAINED GLASS</h1>
          <p className="mt-0.5 font-mono text-[11px] text-dim">
            audio-reactive rose engine · drop audio + images
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] text-dim">Made by Aldrich Fung &amp; Kimi ❤️</p>
          <a
            href="https://github.com/aldrichfung/stained-glass-visualizer"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto font-mono text-[11px] text-accent underline-offset-4 hover:underline"
          >
            github
          </a>
        </div>
      </header>

      {/* desktop panel — slides away when closed */}
      <aside
        aria-hidden={!desktopPanelOpen}
        inert={!desktopPanelOpen}
        className={`absolute bottom-0 right-0 top-0 z-20 hidden w-[300px] border-l border-widget/60 bg-panel/90 backdrop-blur transition-[transform,visibility] duration-200 ease-out md:block ${
          desktopPanelOpen ? 'visible translate-x-0' : 'invisible translate-x-full'
        }`}
      >
        {panel(() => setDesktopPanelOpen(false))}
      </aside>

      {/* desktop reopen button */}
      {!desktopPanelOpen && (
        <div className="absolute bottom-4 left-4 z-20 hidden md:block">
          <Button
            size="icon"
            aria-label="Open controls"
            onClick={() => setDesktopPanelOpen(true)}
            className="h-12 w-12 rounded-full bg-panel text-accent shadow-lg shadow-black/60 hover:bg-widget"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* mobile panel trigger */}
      <div className="absolute bottom-4 left-4 z-20 md:hidden">
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
            {panel()}
          </SheetContent>
        </Sheet>
      </div>

      {/* drag overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-accent/70 bg-void/70">
          <p className="font-mono text-sm tracking-widest text-accent">DROP AUDIO OR IMAGES</p>
        </div>
      )}
    </div>
  )
}

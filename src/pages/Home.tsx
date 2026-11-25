import { useCallback, useEffect, useRef, useState } from 'react'
import '../App.css'
import { AudioEngine } from '../lib/audio/engine'
import { DEFAULT_CONFIG, type GlassConfig } from '../lib/config'
import { createDemoImage } from '../lib/demoImage'
import {
  loadGalleryImage,
  snapshotImage,
  galleryImageFromDataURL,
  type GalleryImage,
} from '../lib/gallery'
import {
  PAD_LABELS,
  loadPresets,
  savePresets,
  loadActivePad,
  saveActivePad,
  loadSetTipDismissed,
  saveSetTipDismissed,
  type PresetSlots,
} from '../lib/presets'
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
  // performance pads A–D: user-saved looks, persisted in this browser.
  // Exactly one pad is targeted at all times — pad A on a fresh install.
  const [presets, setPresets] = useState<PresetSlots>(loadPresets)
  const [activePad, setActivePad] = useState<number>(loadActivePad)
  // Set (config) mode: the armed pad pulses; pressing it again confirms
  const [setArmed, setSetArmed] = useState<number | null>(null)
  const [setTipDismissed, setSetTipDismissed] = useState(loadSetTipDismissed)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const showToast = useCallback((text: string) => setToast({ id: Date.now(), text }), [])

  // apply a pad's look (config + image). Empty pads and pads saved without an
  // image fall back to the default look on the built-in rose window.
  const applyPadLook = useCallback(
    (i: number, silent = false) => {
      const L = PAD_LABELS[i]
      const p = presets[i]
      if (!p) {
        setConfig({ ...DEFAULT_CONFIG })
        setActiveIndex(0)
        if (!silent) showToast(`${L} empty · default look loaded`)
        return
      }
      // merge over defaults so presets saved by older versions stay valid
      setConfig({ ...DEFAULT_CONFIG, ...p.config })
      if (!p.imageId) {
        setActiveIndex(0) // pad saved with the demo image: default rendering
        if (!silent) showToast(`Loaded ${L} · default image`)
        return
      }
      const idx = images.findIndex((im) => im.id === p.imageId)
      if (idx >= 0) {
        setActiveIndex(idx)
        if (!silent) showToast(`Loaded ${L} · ${images[idx].name}`)
        return
      }
      if (p.imageData) {
        // the pad owns a copy of its image: materialize it back into the
        // single-slot gallery under the same id (replacing any current image)
        const { imageId, imageData } = p
        const name = p.imageName ?? 'pad image'
        void galleryImageFromDataURL(imageId, name, imageData).then((gi) => {
          if (!gi) {
            if (!silent) showToast(`Loaded ${L} · stored image unreadable`)
            return
          }
          setImages((prev) => {
            const existing = prev.findIndex((x) => x.id === gi.id)
            if (existing >= 0) {
              setActiveIndex(existing)
              return prev
            }
            const demo = prev.filter((x) => x.id === 'demo')
            prev.forEach((x) => {
              if (x.id !== 'demo' && !x.url.startsWith('data:')) URL.revokeObjectURL(x.url)
            })
            setActiveIndex(demo.length)
            return [...demo, gi]
          })
          if (!silent) showToast(`Loaded ${L} · ${name}`)
        })
        return
      }
      // legacy pad saved before pads owned image copies
      setActiveIndex(0)
      if (!silent)
        showToast(`Loaded ${L} · ${p.imageName ?? 'saved image'} gone, showing default image`)
    },
    [presets, images, showToast],
  )

  // built-in rose window on first mount; the targeted pad's look applies
  useEffect(() => {
    setImages([demoGalleryImage()])
    engine.audio.volume = 0.9
    applyPadLook(loadActivePad(), true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  // Esc closes the desktop panel and cancels Set mode (dropdowns and
  // sheets handle their own Esc first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDesktopPanelOpen(false)
        setSetArmed(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // persist pads whenever they change
  useEffect(() => {
    if (!savePresets(presets)) showToast('Storage full — pads saved without their image copies')
  }, [presets, showToast])

  // persist the targeted pad
  useEffect(() => {
    saveActivePad(activePad)
  }, [activePad])

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

  const patchConfig = useCallback((patch: Partial<GlassConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
  }, [])

  // ---- performance pads ---------------------------------------------------
  // Set (config) mode: Set arms a pad; pressing the flashing pad again saves
  // the current look onto it. Pressing any other pad cancels the arm.
  const confirmSet = useCallback(
    (i: number) => {
      setSetArmed(null)
      const im = images[activeIndex]
      const hasUserImage = !!im && im.id !== 'demo'
      const imageData = hasUserImage ? snapshotImage(im) : null
      setPresets((prev) => {
        const next = [...prev]
        next[i] = {
          config,
          imageId: hasUserImage ? im.id : null,
          imageName: hasUserImage ? im.name : undefined,
          imageData: hasUserImage ? imageData : null,
        }
        return next
      })
      setActivePad(i)
      showToast(
        hasUserImage
          ? imageData
            ? `Saved ${PAD_LABELS[i]} · ${im.name}`
            : `Saved ${PAD_LABELS[i]} · ${im.name} (image copy failed — reference only)`
          : `Saved ${PAD_LABELS[i]} · default image`,
      )
    },
    [config, images, activeIndex, showToast],
  )

  const triggerPad = useCallback(
    (i: number) => {
      if (setArmed === i) {
        confirmSet(i) // pressed the flashing pad: confirm the save
        return
      }
      if (setArmed !== null) setSetArmed(null) // pressing elsewhere cancels
      setActivePad(i)
      applyPadLook(i)
    },
    [setArmed, confirmSet, applyPadLook],
  )

  // the Set button: arm a pad; pressing Set on the armed pad cancels
  const setPad = useCallback((i: number) => {
    setSetArmed((armed) => (armed === i ? null : i))
  }, [])

  const clearPad = useCallback(
    (i: number) => {
      setSetArmed((armed) => (armed === i ? null : armed))
      setPresets((prev) => {
        const next = [...prev]
        next[i] = null
        return next
      })
      if (i === activePad) {
        // the targeted pad is now empty: an empty pad IS the default look,
        // so the panel and visuals must show that, not the stale edits
        setConfig({ ...DEFAULT_CONFIG })
        setActiveIndex(0)
        showToast(`Cleared ${PAD_LABELS[i]} · default look loaded`)
      } else {
        showToast(`Cleared ${PAD_LABELS[i]}`)
      }
    },
    [activePad, showToast],
  )

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

  // one image at a time: a new upload REPLACES the current user image.
  // The built-in demo always stays in the background at index 0.
  const addImageFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter((f) => f.type.startsWith('image/'))
      if (!accepted.length) return
      if (accepted.length > 1) showToast('One image at a time — using the first')
      const f = accepted[0]
      void loadGalleryImage(f).then((gi) => {
        if (!gi) {
          showToast(`Couldn't read ${f.name} — try a PNG or JPEG`)
          return
        }
        setImages((prev) => {
          const demo = prev.filter((x) => x.id === 'demo')
          const base = demo.length ? demo : [demoGalleryImage()]
          prev.forEach((x) => {
            if (x.id !== 'demo' && !x.url.startsWith('data:')) URL.revokeObjectURL(x.url)
          })
          return [...base, gi]
        })
        setActiveIndex(1) // right after the demo
        showToast(`Now showing ${gi.name}`)
      })
    },
    [showToast],
  )

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
      presets={presets}
      activePad={activePad}
      armedPad={setArmed}
      onTriggerPad={triggerPad}
      onSetPad={setPad}
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
      <PresetPads pads={presets} activePad={activePad} armedPad={setArmed} onTrigger={triggerPad} />

      {/* event toast: every save/load/upload acknowledges itself */}
      {toast && (
        <p
          key={toast.id}
          className="animate-toast pointer-events-none fixed bottom-24 left-1/2 z-40 whitespace-nowrap rounded-md border border-widget bg-panel/95 px-3 py-1.5 font-mono text-[11px] text-ink shadow-lg shadow-black/50"
        >
          {toast.text}
        </p>
      )}

      {/* Set (config) mode explainer — shown every time until dismissed */}
      {setArmed !== null && !setTipDismissed && (
        <div className="fixed bottom-24 left-1/2 z-40 w-[min(92vw,340px)] -translate-x-1/2 rounded-lg border border-accent/50 bg-panel/95 p-3 shadow-xl shadow-black/60">
          <p className="font-mono text-[11px] leading-relaxed text-ink">
            This is Config mode. Any setting you have currently adjusted on the control panel
            will be saved and mapped to this pad. Press the flashing pad again to confirm.
          </p>
          <label className="mt-2 flex cursor-pointer items-center gap-2 font-mono text-[10px] text-dim">
            <input
              type="checkbox"
              className="accent-accent"
              onChange={(e) => {
                if (e.target.checked) {
                  saveSetTipDismissed()
                  setSetTipDismissed(true)
                }
              }}
            />
            Do not remind again
          </label>
        </div>
      )}

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

/**
 * AudioEngine — owns the AudioContext, the media element pipeline and a
 * generative demo-tone pipeline, and produces smoothed per-frame features:
 * 5 frequency bands, overall level and a decaying beat pulse.
 */

export interface AudioFeatures {
  bands: Float32Array // NUM_BANDS smoothed sub-band energies 0..1
  flux: Float32Array // per-sub-band onset strength 0..1 (spectral flux)
  level: number // overall loudness 0..1
  beat: number // decaying pulse 0..1, spikes to 1 on detected onsets
  playing: boolean
}

/** 24 log-spaced sub-bands from 30 Hz to 14 kHz. */
export const NUM_BANDS = 24
const BAND_EDGES: Array<[number, number]> = Array.from({ length: NUM_BANDS }, (_, i) => {
  const f = (x: number) => 30 * Math.pow(14000 / 30, x / NUM_BANDS)
  return [f(i), f(i + 1)]
})

export class AudioEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private input: GainNode | null = null
  private freqData: Uint8Array<ArrayBuffer> | null = null

  readonly audio: HTMLAudioElement
  private mediaSource: MediaElementAudioSourceNode | null = null
  private fileUrl: string | null = null

  // demo tone graph
  private demoGain: GainNode | null = null
  private demoTimer: number | null = null
  private demoNextBeat = 0
  private demoStep = 0
  demoActive = false

  // feature state
  private bands = new Float32Array(NUM_BANDS)
  private flux = new Float32Array(NUM_BANDS)
  private bandAvg = new Float32Array(NUM_BANDS)
  private level = 0
  private beat = 0
  private bassAvg = 0
  private lastTime = 0

  sensitivity = 1.4

  constructor() {
    this.audio = new Audio()
    this.audio.crossOrigin = 'anonymous'
    this.audio.preload = 'auto'
  }

  private ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.4
    const input = ctx.createGain()
    input.gain.value = 1
    input.connect(analyser)
    analyser.connect(ctx.destination)
    this.ctx = ctx
    this.analyser = analyser
    this.input = input
    this.freqData = new Uint8Array(analyser.frequencyBinCount)
  }

  get ready() {
    return this.ctx !== null
  }

  get playing() {
    return this.demoActive || !this.audio.paused
  }

  /** Load a user-selected audio file into the media element. */
  loadFile(file: File) {
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl)
    this.stopDemo()
    this.fileUrl = URL.createObjectURL(file)
    this.audio.src = this.fileUrl
    this.audio.load()
  }

  private connectMedia() {
    this.ensureContext()
    if (!this.mediaSource) {
      this.mediaSource = this.ctx!.createMediaElementSource(this.audio)
      this.mediaSource.connect(this.input!)
    }
  }

  async play() {
    this.connectMedia()
    await this.audio.play()
  }

  pause() {
    this.audio.pause()
  }

  toggleDemo(): boolean {
    if (this.demoActive) {
      this.stopDemo()
      return false
    }
    this.startDemo()
    return true
  }

  // --- generative demo tone: minor-key pulse at 112 BPM -------------------
  private startDemo() {
    this.ensureContext()
    this.audio.pause()
    const ctx = this.ctx!
    const gain = ctx.createGain()
    gain.gain.value = 0.5
    gain.connect(this.input!)
    this.demoGain = gain
    this.demoActive = true
    this.demoNextBeat = ctx.currentTime + 0.08
    this.demoStep = 0

    // four-on-the-floor at 128 BPM: Am F C G
    const roots = [110, 87.31, 130.81, 98]
    const beatLen = 60 / 128 / 2 // eighth notes

    const scheduleAhead = () => {
      if (!this.demoActive) return
      while (this.demoNextBeat < ctx.currentTime + 0.35) {
        const t = this.demoNextBeat
        const step = this.demoStep
        const bar = Math.floor(step / 8) % 4
        const root = roots[bar]

        // four-on-the-floor kick
        if (step % 2 === 0) this.kick(gain, t)
        // snare on 2 and 4
        if (step % 8 === 4) this.snare(gain, t)
        // driving off-beat hats
        this.hat(gain, t, step % 2 === 1 ? 0.2 : 0.06)
        // rolling bass: root + octave bounce
        if (step % 2 === 0) {
          this.bassNote(gain, t, (step % 4 === 2 ? 1.5 : 1) * (root / 2), beatLen * 1.7)
        }
        // pad at bar start
        if (step % 8 === 0) this.pad(gain, t, root, beatLen * 8.5)
        // busy 16th-feel arp
        if (step % 2 === 1) {
          const seq = [2, 2.378, 3, 2.378]
          this.pluck(gain, t, root * seq[step % 4], 0.16)
        }

        this.demoNextBeat += beatLen
        this.demoStep++
      }
      this.demoTimer = window.setTimeout(scheduleAhead, 90)
    }
    scheduleAhead()
  }

  private stopDemo() {
    this.demoActive = false
    if (this.demoTimer !== null) {
      clearTimeout(this.demoTimer)
      this.demoTimer = null
    }
    if (this.demoGain) {
      const g = this.demoGain
      g.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.05)
      window.setTimeout(() => g.disconnect(), 400)
      this.demoGain = null
    }
  }

  private kick(out: GainNode, t: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(140, t)
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.11)
    g.gain.setValueAtTime(0.9, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24)
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + 0.26)
  }

  private hat(out: GainNode, t: number, amp: number) {
    const ctx = this.ctx!
    const len = 0.05
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.value = amp
    src.connect(hp).connect(g).connect(out)
    src.start(t)
  }

  private snare(out: GainNode, t: number) {
    const ctx = this.ctx!
    const len = 0.16
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1900
    bp.Q.value = 0.8
    const g = ctx.createGain()
    g.gain.value = 0.5
    src.connect(bp).connect(g).connect(out)
    src.start(t)
    // body thump under the noise
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(210, t)
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.08)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.4, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    osc.connect(og).connect(out)
    osc.start(t)
    osc.stop(t + 0.12)
  }

  private bassNote(out: GainNode, t: number, freq: number, dur: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(500, t)
    lp.frequency.exponentialRampToValueAtTime(120, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(lp).connect(g).connect(out)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  private pad(out: GainNode, t: number, root: number, dur: number) {
    const ctx = this.ctx!
    for (const mult of [1, 1.189, 1.498]) {
      // root, minor third, fifth
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = root * mult * 2
      osc.detune.value = (Math.random() - 0.5) * 14
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.3)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.connect(g).connect(out)
      osc.start(t)
      osc.stop(t + dur + 0.05)
    }
  }

  private pluck(out: GainNode, t: number, freq: number, amp: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(amp, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + 0.32)
  }

  /** Called once per animation frame. */
  getFeatures(now: number): AudioFeatures {
    const dt = this.lastTime ? Math.min(0.1, (now - this.lastTime) / 1000) : 0.016
    this.lastTime = now

    if (this.analyser && this.freqData && this.playing) {
      this.analyser.getByteFrequencyData(this.freqData)
      const nyquist = this.ctx!.sampleRate / 2
      const binHz = nyquist / this.freqData.length
      let levelSum = 0
      for (let b = 0; b < NUM_BANDS; b++) {
        const [lo, hi] = BAND_EDGES[b]
        const i0 = Math.max(1, Math.floor(lo / binHz))
        const i1 = Math.min(this.freqData.length - 1, Math.ceil(hi / binHz))
        let sum = 0
        for (let i = i0; i <= i1; i++) sum += this.freqData[i]
        let v = (sum / (i1 - i0 + 1) / 255) * this.sensitivity
        // perceptual tilt: highs read quieter
        v *= 1 + (b / NUM_BANDS) * 1.1
        v = Math.min(1, v)
        // fast envelopes: electronic music lives in transients
        const k = v > this.bands[b] ? 1 - Math.exp(-dt * 34) : 1 - Math.exp(-dt * 10)
        this.bands[b] += (v - this.bands[b]) * k
        levelSum += this.bands[b]

        // spectral flux: how much this band just jumped over its own average
        this.bandAvg[b] += (this.bands[b] - this.bandAvg[b]) * (1 - Math.exp(-dt * 0.9))
        const jump = this.bands[b] - this.bandAvg[b] * 1.25
        const f = Math.max(0, Math.min(1, jump * 2.6))
        const kf = f > this.flux[b] ? 1 - Math.exp(-dt * 40) : 1 - Math.exp(-dt * 12)
        this.flux[b] += (f - this.flux[b]) * kf
      }
      const lvl = levelSum / NUM_BANDS
      const kl = lvl > this.level ? 1 - Math.exp(-dt * 24) : 1 - Math.exp(-dt * 5)
      this.level += (lvl - this.level) * kl

      // beat: kick-region flux over adaptive average
      let bass = 0
      for (let b = 1; b <= 5; b++) bass += this.bands[b]
      bass /= 5
      this.bassAvg += (bass - this.bassAvg) * (1 - Math.exp(-dt * 1.6))
      if (bass > this.bassAvg * 1.24 + 0.05 && bass > 0.16) {
        this.beat = Math.min(1, this.beat + (bass - this.bassAvg) * 3.4)
      }
    } else {
      // idle: gentle breathing shimmer so the glass never looks dead
      const t = now / 1000
      for (let b = 0; b < NUM_BANDS; b++) {
        const v = 0.14 + 0.09 * Math.sin(t * (0.3 + b * 0.045) + b * 1.7)
        this.bands[b] += (v - this.bands[b]) * (1 - Math.exp(-dt * 3))
        this.flux[b] *= Math.exp(-dt * 2)
      }
      this.level += (0.16 - this.level) * (1 - Math.exp(-dt * 3))
    }
    this.beat *= Math.exp(-dt * 4.2)

    return { bands: this.bands, flux: this.flux, level: this.level, beat: this.beat, playing: this.playing }
  }
}

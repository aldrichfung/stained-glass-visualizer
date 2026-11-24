export type PatternMode = 'structure' | 'voronoi' | 'honeycomb'
export type ColorMode = 'true' | 'jewel' | 'ultraviolet' | 'cathedral' | 'grayscale' | 'mono'
export type EnergyMapping = 'radial' | 'inverse-radial' | 'horizontal' | 'random'
export type WindowShape = 'arch' | 'romanesque' | 'lancets' | 'quatrefoil' | 'rose' | 'full'
export type FitMode = 'cover' | 'contain'

export interface GlassConfig {
  pattern: PatternMode
  density: number // target cell count
  leadWidth: number // px
  reactivity: number // glow response multiplier 0..2
  punch: number // onset emphasis 0..1 (0 = follows sustained sound, 1 = only hits)
  strobe: number // envelope speed 0..1 (0 = candle glow, 1 = hard strobe)
  // internal fixed gains (not user-facing since the Punch/Strobe rework)
  sensitivity: number
  baseLight: number
  beatPulse: boolean
  pulseStrength: number // 0..1
  fog: number // atmospheric haze between viewer and glass 0..1
  colorMode: ColorMode
  mapping: EnergyMapping
  windowShape: WindowShape
  fitMode: FitMode
  windowSize: number // 0.5..1 overall scale of the opening
  windowAspect: number // width multiplier 0.6..1.6 (cover fit only)
  cycleSec: number // seconds between gallery images while playing (1..10)
}

export const DEFAULT_CONFIG: GlassConfig = {
  pattern: 'structure',
  density: 1400,
  leadWidth: 3,
  reactivity: 1.2,
  punch: 0.55,
  strobe: 0.4,
  sensitivity: 1.4,
  baseLight: 0.35,
  beatPulse: true,
  pulseStrength: 0.7,
  fog: 0.35,
  colorMode: 'jewel',
  mapping: 'radial',
  windowShape: 'arch',
  fitMode: 'contain',
  windowSize: 0.92,
  windowAspect: 1,
  cycleSec: 4,
}

export const PATTERN_LABELS: Record<PatternMode, string> = {
  structure: 'Structure (follows image)',
  voronoi: 'Geometric Voronoi',
  honeycomb: 'Honeycomb lattice',
}

export const COLOR_LABELS: Record<ColorMode, string> = {
  true: 'True to image',
  jewel: 'Jewel tones',
  ultraviolet: 'Ultraviolet (blue · purple · pink)',
  cathedral: 'Cathedral (ruby · cobalt · gold)',
  grayscale: 'Grayscale (silver grisaille)',
  mono: 'Monochrome ember',
}

export const MAPPING_LABELS: Record<EnergyMapping, string> = {
  radial: 'Radial (bass at center)',
  'inverse-radial': 'Inverse radial (bass at edges)',
  horizontal: 'Left → right (bass → treble)',
  random: 'Scattered',
}

export const WINDOW_LABELS: Record<WindowShape, string> = {
  arch: 'Gothic arch',
  romanesque: 'Romanesque round arch',
  lancets: 'Twin lancets',
  quatrefoil: 'Quatrefoil',
  rose: 'Rose circle',
  full: 'Full bleed (no wall)',
}

export const FIT_LABELS: Record<FitMode, string> = {
  cover: 'Cover (crop to fill)',
  contain: 'Contain (fit whole image)',
}

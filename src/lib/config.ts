export type PatternMode = 'structure' | 'voronoi' | 'honeycomb'
export type ColorMode = 'true' | 'jewel' | 'mono'
export type EnergyMapping = 'radial' | 'horizontal' | 'random'

export interface GlassConfig {
  pattern: PatternMode
  density: number // target cell count
  leadWidth: number // px
  reactivity: number // glow response multiplier 0..2
  sensitivity: number // audio input gain 0.5..3
  baseLight: number // ambient illumination of the glass 0..1
  beatPulse: boolean
  pulseStrength: number // 0..1
  colorMode: ColorMode
  mapping: EnergyMapping
}

export const DEFAULT_CONFIG: GlassConfig = {
  pattern: 'structure',
  density: 900,
  leadWidth: 3,
  reactivity: 1.2,
  sensitivity: 1.4,
  baseLight: 0.35,
  beatPulse: true,
  pulseStrength: 0.7,
  colorMode: 'jewel',
  mapping: 'radial',
}

export const PATTERN_LABELS: Record<PatternMode, string> = {
  structure: 'Structure (follows image)',
  voronoi: 'Geometric Voronoi',
  honeycomb: 'Honeycomb lattice',
}

export const COLOR_LABELS: Record<ColorMode, string> = {
  true: 'True to image',
  jewel: 'Jewel tones',
  mono: 'Monochrome ember',
}

export const MAPPING_LABELS: Record<EnergyMapping, string> = {
  radial: 'Radial (bass at center)',
  horizontal: 'Left → right (bass → treble)',
  random: 'Scattered',
}

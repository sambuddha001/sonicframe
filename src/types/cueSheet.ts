/**
 * src/types/cueSheet.ts
 * Master SonicFrameCueSheet Schema & TypeScript Interfaces
 * Based on SONICFRAME Enterprise Architecture v4.0 (Section 6.2)
 */

export const VALID_KEY_ROOTS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
] as const;
export type KeyRoot = typeof VALID_KEY_ROOTS[number];

export const VALID_SCALE_MODES = [
  'dorian', 'aeolian', 'phrygian', 'lydian', 'minor_pentatonic', 'cinematic_dark'
] as const;
export type ScaleMode = typeof VALID_SCALE_MODES[number];

export const VALID_INTENSITY_CURVES = [
  'exponential_build', 'sudden_drop', 'sustained_tension', 'dynamic_waves'
] as const;
export type IntensityCurve = typeof VALID_INTENSITY_CURVES[number];

export const VALID_FOLEY_CATEGORIES = [
  'impact_heavy',
  'impact_metallic',
  'whoosh_pass',
  'footstep_wood',
  'footstep_gravel',
  'ambient_glitch'
] as const;
export type FoleyCategory = typeof VALID_FOLEY_CATEGORIES[number];

export const VALID_PATCH_TYPES = [
  'modal_resonator',
  'granular_cluster',
  'filtered_noise_burst'
] as const;
export type PatchType = typeof VALID_PATCH_TYPES[number];

export interface CompositionProfile {
  key_root: KeyRoot;
  scale_mode: ScaleMode;
  base_bpm: number;
  intensity_curve: IntensityCurve;
}

export interface FoleyCueParameters {
  fundamental_freq: number;
  decay_seconds: number;
  brightness: number;
  resonance_q: number;
  // Aliases for cross-module compatibility
  fundamental_hz?: number;
  decay_s?: number;
}

export interface FoleyCue {
  id?: string;
  timestamp_ms: number;
  frame_number: number;
  category: FoleyCategory;
  patch_type: PatchType;
  velocity: number; // 0.0 to 1.0
  pan: number; // -1.0 to 1.0
  parameters: FoleyCueParameters;
  description?: string;
  llm_enriched?: boolean;
}

export interface CutoffAutomationPoint {
  timestamp_ms: number;
  value_hz: number;
}

export interface DroneDensityPoint {
  timestamp_ms: number;
  gain: number;
}

export interface StemAutomations {
  atmosphere_cutoff: CutoffAutomationPoint[];
  drone_density: DroneDensityPoint[];
}

export interface SonicFrameCueSheet {
  $schema?: string;
  title?: string;
  composition_profile: CompositionProfile;
  foley_events: FoleyCue[];
  stem_automations: StemAutomations;
}

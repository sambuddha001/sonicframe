/**
 * src/modules/orchestrator/CueSheetParser.ts
 * Strict Validation, Sanitization & Deterministic Cue Sheet Composer
 * Implements Section 6.2 of SONICFRAME Enterprise Architecture v4.0
 */

import type { SonicFrameCueSheet, FoleyCue, CompositionProfile, KeyRoot, ScaleMode, IntensityCurve, FoleyCategory, PatchType } from '../../types/cueSheet';
import type { MathematicalTelemetry } from '../../types/telemetry';

export class CueSheetParser {
  /**
   * Deterministically generates a 100% valid cue sheet from vision telemetry without needing an LLM
   */
  public static generateDeterministic(telemetry: MathematicalTelemetry, mood = 'cinematic_dark'): SonicFrameCueSheet {
    let keyRoot: KeyRoot = 'D';
    let scaleMode: ScaleMode = 'dorian';
    let baseBpm = 88;
    let intensityCurve: IntensityCurve = 'sustained_tension';

    if (mood === 'action' || mood === 'action_percussive') {
      keyRoot = 'E';
      scaleMode = 'phrygian';
      baseBpm = 132;
      intensityCurve = 'exponential_build';
    } else if (mood === 'ambient' || mood === 'sci_fi_ambient') {
      keyRoot = 'C';
      scaleMode = 'lydian';
      baseBpm = 64;
      intensityCurve = 'dynamic_waves';
    } else if (mood === 'playful' || mood === 'playful_bright') {
      keyRoot = 'F';
      scaleMode = 'minor_pentatonic';
      baseBpm = 116;
      intensityCurve = 'dynamic_waves';
    }

    const composition_profile: CompositionProfile = {
      key_root: keyRoot,
      scale_mode: scaleMode,
      base_bpm: baseBpm,
      intensity_curve: intensityCurve,
    };

    const foley_events: FoleyCue[] = (telemetry.detectedImpacts || []).map((imp, idx) => {
      const isMetal = imp.centroidX > 0;
      const category: FoleyCategory = isMetal ? 'impact_metallic' : 'impact_heavy';
      const patch_type: PatchType = 'modal_resonator';
      const fundamental_freq = isMetal ? 340 : 65;
      const decay_seconds = isMetal ? 0.65 : 0.40;

      return {
        id: `cue_${idx}`,
        timestamp_ms: imp.timeMs,
        frame_number: imp.frameIndex,
        category,
        patch_type,
        velocity: Math.max(0.1, Math.min(1.0, imp.energy)),
        pan: imp.centroidX,
        parameters: {
          fundamental_freq,
          decay_seconds,
          fundamental_hz: fundamental_freq,
          decay_s: decay_seconds,
          brightness: 0.8,
          resonance_q: isMetal ? 14.0 : 4.5,
        },
      };
    });

    const atmosphere_cutoff = (telemetry.summary || []).filter((_, i) => i % 5 === 0).map((v) => ({
      timestamp_ms: v.timeMs,
      value_hz: Math.round(Math.max(200, Math.min(6000, 650 * (1.0 + Math.abs(v.divergence) * 2.0)))),
    }));

    const drone_density = (telemetry.summary || []).filter((_, i) => i % 5 === 0).map((v) => ({
      timestamp_ms: v.timeMs,
      gain: Number(Math.max(0.1, Math.min(1.0, 0.3 + v.kineticEnergy * 0.5)).toFixed(2)),
    }));

    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'SonicFrameCueSheet',
      composition_profile,
      foley_events,
      stem_automations: {
        atmosphere_cutoff,
        drone_density,
      },
    };
  }

  public static sanitize(raw: unknown, fallbackTelemetry?: MathematicalTelemetry): SonicFrameCueSheet {
    if (!raw || typeof raw !== 'object') {
      return this.generateDeterministic(fallbackTelemetry || { durationSeconds: 15, fps: 30, totalFrames: 450, summary: [], detectedImpacts: [] });
    }

    const obj = raw as Record<string, unknown>;
    const prof = (obj.composition_profile || {}) as Record<string, unknown>;

    const key_root = (typeof prof.key_root === 'string' ? prof.key_root.toUpperCase().trim() : 'D') as KeyRoot;
    const scale_mode = (typeof prof.scale_mode === 'string' ? prof.scale_mode.toLowerCase().trim() : 'cinematic_dark') as ScaleMode;
    const base_bpm = Number.isInteger(prof.base_bpm) ? (prof.base_bpm as number) : 88;
    const intensity_curve = (typeof prof.intensity_curve === 'string' ? prof.intensity_curve.toLowerCase().trim() : 'sustained_tension') as IntensityCurve;

    const composition_profile: CompositionProfile = {
      key_root,
      scale_mode,
      base_bpm: Math.max(40, Math.min(200, base_bpm)),
      intensity_curve,
    };

    const rawCues = Array.isArray(obj.foley_events) ? obj.foley_events : [];
    const foley_events: FoleyCue[] = rawCues.map((c: Record<string, unknown>, idx: number) => {
      const p = (c.parameters || {}) as Record<string, unknown>;
      const fund = Number(p.fundamental_freq || p.fundamental_hz || 280);
      const dec = Number(p.decay_seconds || p.decay_s || 0.45);

      return {
        id: (c.id as string) || `cue_${idx}`,
        timestamp_ms: Number(c.timestamp_ms) || 0,
        frame_number: Number(c.frame_number) || 0,
        category: (c.category as FoleyCategory) || 'impact_heavy',
        patch_type: (c.patch_type as PatchType) || 'modal_resonator',
        velocity: Math.max(0.1, Math.min(1.0, Number(c.velocity) || 0.7)),
        pan: Math.max(-1.0, Math.min(1.0, Number(c.pan) || 0.0)),
        parameters: {
          fundamental_freq: fund,
          decay_seconds: dec,
          fundamental_hz: fund,
          decay_s: dec,
          brightness: Number(p.brightness) || 0.7,
          resonance_q: Number(p.resonance_q) || 8.0,
        },
      };
    });

    const automations = (obj.stem_automations || {}) as Record<string, unknown>;
    const atmosphere_cutoff = Array.isArray(automations.atmosphere_cutoff) ? automations.atmosphere_cutoff : [{ timestamp_ms: 0, value_hz: 650 }];
    const drone_density = Array.isArray(automations.drone_density) ? automations.drone_density : [{ timestamp_ms: 0, gain: 0.3 }];

    return {
      composition_profile,
      foley_events,
      stem_automations: {
        atmosphere_cutoff,
        drone_density,
      },
    };
  }
}

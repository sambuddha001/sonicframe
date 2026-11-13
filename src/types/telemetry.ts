/**
 * src/types/telemetry.ts
 * 10Hz Mathematical Telemetry Interfaces & Kinetic Formulations
 * Based on SONICFRAME Enterprise Architecture v4.0 (Section 5 & 9.1)
 */

export interface TelemetryVector {
  timeMs: number;
  frameIndex: number;
  kineticEnergy: number;      // E(t) = (1/WH) * sum(sqrt(u^2 + v^2))
  divergence: number;         // Div(t) = du/dx + dv/dy (camera push/pull)
  curl: number;               // Curl(t) = dv/dx - du/dy (rotational vortex)
  centroidX: number;          // Cx normalized to [-1.0, +1.0] for stereo pan
  centroidY: number;          // Cy normalized to [-1.0, +1.0]
  deltaColorLAB: number;      // Delta-E chromatic shift
  isSceneCut?: boolean;
}

export interface DetectedImpact {
  timeMs: number;
  frameIndex: number;
  acceleration: number;       // d^2E/dt^2 (Savitzky-Golay 2nd derivative)
  energy: number;             // E(t) peak kinetic energy
  centroidX: number;          // Screen horizontal coordinate for panning
  confidence?: number;
}

export interface SemanticKeyframe {
  timeMs: number;
  frameIndex: number;
  dataUrl: string;            // 160x90 JPEG base64 string
}

export interface MathematicalTelemetry {
  durationSeconds: number;
  fps: number;
  totalFrames: number;
  sampleRateHz?: number;
  summary: TelemetryVector[];
  detectedImpacts: DetectedImpact[];
  semanticKeyframes?: SemanticKeyframe[];
}

export type TelemetryStatus = 'idle' | 'decoding' | 'analyzing' | 'ready' | 'error';

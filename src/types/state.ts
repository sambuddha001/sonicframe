/**
 * src/types/state.ts
 * Global Application State Model (Section 9.1 of Architecture Specification)
 */

import type { SonicFrameCueSheet } from './cueSheet';
import type { TelemetryVector, DetectedImpact, TelemetryStatus } from './telemetry';

export type MoodType = 'cinematic_dark' | 'action_percussive' | 'sci_fi_ambient' | 'playful_bright';

export interface CopilotMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  isCommand?: boolean;
}

export interface VideoState {
  file: File | null;
  objectUrl: string | null;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  currentTime: number;
  isPlaying: boolean;
}

export interface TelemetryState {
  status: TelemetryStatus;
  progressPct: number;
  sampleRateHz: number;
  vectors: TelemetryVector[];
  detectedImpacts: DetectedImpact[];
}

export interface OrchestratorState {
  mood: MoodType;
  cueSheet: SonicFrameCueSheet | null;
  isGenerating: boolean;
  copilotMessages: CopilotMessage[];
}

export interface StemChannelState {
  gain: number;
  muted: boolean;
  solo: boolean;
  pan?: number;
  cutoffHz?: number;
  resonance?: number;
  damping?: number;
  spread?: number;
}

export interface MixerState {
  masterVolume: number;
  stems: {
    atmosphere: StemChannelState;
    motionPulse: StemChannelState;
    foleyImpact: StemChannelState;
    textureShimmer: StemChannelState;
  };
}

export interface SonicFrameState {
  video: VideoState;
  telemetry: TelemetryState;
  orchestrator: OrchestratorState;
  mixer: MixerState;

  // Actions Contract
  loadVideoFile: (file: File) => Promise<void>;
  runAnalysis: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seekTo: (timeSeconds: number) => void;
  setStemVolume: (stem: 'atmosphere' | 'pulse' | 'foley' | 'texture', vol: number) => void;
  exportLosslessWav: () => Promise<Blob>;
}

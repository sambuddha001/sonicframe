/**
 * src/types/api.ts
 * API Request & Response Typed Contracts (Section 10.4 of Architecture Specification)
 */

import type { SonicFrameCueSheet } from './cueSheet';
import type { MathematicalTelemetry } from './telemetry';
import type { MoodType } from './state';

export interface OrchestrateRequestBody {
  telemetry: MathematicalTelemetry;
  mood: MoodType | string;
}

export interface OrchestrateResponse {
  success: boolean;
  provider: string;
  cueSheet: SonicFrameCueSheet;
  warning?: string;
  error?: string;
}

export interface ChatMutation {
  path: string;
  value: unknown;
}

export interface ChatRequestBody {
  message: string;
  currentTimeMs: number;
  activeCueSheet: SonicFrameCueSheet;
}

export interface ChatResponse {
  success: boolean;
  reply: string;
  mutations?: ChatMutation[];
  updatedCueSheet?: SonicFrameCueSheet;
  error?: string;
}

/**
 * src/modules/orchestrator/OrchestratorClient.ts
 * Client for Serverless Cognitive Orchestrator Endpoint
 * Implements Section 6.3 & 10.4 of SONICFRAME Enterprise Architecture v4.0
 */

import { CueSheetParser } from './CueSheetParser';
import type { SonicFrameCueSheet } from '../../types/cueSheet';
import type { MathematicalTelemetry } from '../../types/telemetry';
import type { OrchestrateRequestBody, OrchestrateResponse } from '../../types/api';

export class OrchestratorClient {
  private endpoint: string;

  constructor(endpoint = '/.netlify/functions/orchestrate') {
    this.endpoint = endpoint;
  }

  public async orchestrate(telemetry: MathematicalTelemetry, mood = 'cinematic_dark'): Promise<SonicFrameCueSheet> {
    try {
      const payload: OrchestrateRequestBody = { telemetry, mood };
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data: OrchestrateResponse = await res.json();
      if (data.success && data.cueSheet) {
        return CueSheetParser.sanitize(data.cueSheet, telemetry);
      }
      throw new Error(data.error || 'Invalid response from orchestrator');
    } catch (err) {
      console.warn('[OrchestratorClient] Serverless call failed, engaging offline deterministic composer:', err);
      return CueSheetParser.generateDeterministic(telemetry, mood);
    }
  }
}

/**
 * src/modules/orchestrator/OrchestratorClient.ts
 * Client for Serverless Cognitive Orchestrator Endpoint
 * Implements Section 6.3 & 10.4 of SONICFRAME Enterprise Architecture v4.0
 */
import { CueSheetParser } from './CueSheetParser';
export class OrchestratorClient {
    endpoint;
    constructor(endpoint = '/.netlify/functions/orchestrate') {
        this.endpoint = endpoint;
    }
    async orchestrate(telemetry, mood = 'cinematic_dark') {
        try {
            const payload = { telemetry, mood };
            const res = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            const data = await res.json();
            if (data.success && data.cueSheet) {
                return CueSheetParser.sanitize(data.cueSheet, telemetry);
            }
            throw new Error(data.error || 'Invalid response from orchestrator');
        }
        catch (err) {
            console.warn('[OrchestratorClient] Serverless call failed, engaging offline deterministic composer:', err);
            return CueSheetParser.generateDeterministic(telemetry, mood);
        }
    }
}

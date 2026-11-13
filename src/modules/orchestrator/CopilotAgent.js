/**
 * src/modules/orchestrator/CopilotAgent.ts
 * Natural Language Timeline Editor & Conversational Co-Pilot
 * Implements Section 8.2 & 10.4 of SONICFRAME Enterprise Architecture v4.0
 */
export class CopilotAgent {
    handleCommand(rawText, cueSheet, currentTimeMs = 0) {
        const text = rawText.toLowerCase().trim();
        if (!cueSheet) {
            return {
                executed: false,
                message: 'No active animation cue sheet loaded. Please analyze a clip first.',
            };
        }
        const cloned = JSON.parse(JSON.stringify(cueSheet));
        // 1. Double decay time on metallic clashes
        if (text.includes('double') && (text.includes('decay') || text.includes('metal'))) {
            let count = 0;
            cloned.foley_events.forEach((cue) => {
                if (cue.category.includes('metal')) {
                    cue.parameters.decay_seconds = Number((cue.parameters.decay_seconds * 2.0).toFixed(3));
                    cue.parameters.decay_s = cue.parameters.decay_seconds;
                    count++;
                }
            });
            return {
                executed: true,
                message: `Doubled decay time on ${count} metallic clash cues.`,
                updatedCueSheet: cloned,
            };
        }
        // 2. Make footsteps heavier / wet cobblestone
        if (text.includes('footstep') || text.includes('heavier') || text.includes('cobblestone')) {
            let count = 0;
            cloned.foley_events.forEach((cue) => {
                if (cue.category.includes('footstep') || cue.category.includes('wood') || cue.category.includes('gravel')) {
                    cue.parameters.fundamental_freq = 75;
                    cue.parameters.fundamental_hz = 75;
                    cue.parameters.decay_seconds = 0.38;
                    cue.parameters.decay_s = 0.38;
                    count++;
                }
            });
            return {
                executed: true,
                message: `Adjusted ${count} footstep cues: lowered fundamental frequency to 75Hz and extended decay to 0.38s for wet cobblestone impact.`,
                updatedCueSheet: cloned,
            };
        }
        // 3. Increase tension in final 3 seconds
        if (text.includes('tension') && text.includes('final')) {
            const maxMs = cloned.foley_events.length > 0
                ? Math.max(...cloned.foley_events.map((c) => c.timestamp_ms))
                : 15000;
            const startMs = Math.max(0, maxMs - 3000);
            cloned.stem_automations.atmosphere_cutoff.forEach((pt) => {
                if (pt.timestamp_ms >= startMs) {
                    pt.value_hz = Math.min(8000, pt.value_hz * 1.8);
                }
            });
            return {
                executed: true,
                message: 'Engineered exponential tension build in final 3s: swept atmosphere lowpass cutoff up to 8kHz.',
                updatedCueSheet: cloned,
            };
        }
        // 4. Set key to D minor / cinematic dark
        if (text.includes('key to') || text.includes('minor') || text.includes('cinematic')) {
            let key = 'D';
            let mode = 'cinematic_dark';
            if (text.includes('c minor'))
                key = 'C';
            else if (text.includes('e minor'))
                key = 'E';
            else if (text.includes('f minor'))
                key = 'F';
            if (text.includes('dorian'))
                mode = 'dorian';
            else if (text.includes('phrygian'))
                mode = 'phrygian';
            else if (text.includes('lydian'))
                mode = 'lydian';
            cloned.composition_profile.key_root = key;
            cloned.composition_profile.scale_mode = mode;
            return {
                executed: true,
                message: `Updated score composition profile: key root ${key}, scale mode ${mode}.`,
                updatedCueSheet: cloned,
            };
        }
        // Default creative advice
        return {
            executed: false,
            message: `Received command: "${rawText}". Try commanding specific mutations like "Double decay time on all metallic clashes", "Make footsteps heavier", or "Increase tension in final 3 seconds".`,
        };
    }
}

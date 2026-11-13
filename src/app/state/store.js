/**
 * src/app/state/store.ts
 * Central Reactive Store implementing SonicFrameState
 * Based on SONICFRAME Enterprise Architecture v4.0 (Section 9.1)
 */
const initialVideoState = {
    file: null,
    objectUrl: null,
    durationSeconds: 0,
    width: 0,
    height: 0,
    fps: 30,
    currentTime: 0,
    isPlaying: false,
};
const initialTelemetryState = {
    status: 'idle',
    progressPct: 0,
    sampleRateHz: 10,
    vectors: [],
    detectedImpacts: [],
};
const initialOrchestratorState = {
    mood: 'cinematic_dark',
    cueSheet: null,
    isGenerating: false,
    copilotMessages: [
        {
            role: 'system',
            text: '✦ SONICFRAME Cognitive Co-Pilot initialized. Drag an animation clip to begin scoring.',
            timestamp: new Date(),
        },
    ],
};
const initialMixerState = {
    masterVolume: 0.85,
    stems: {
        atmosphere: { gain: 0.30, muted: false, solo: false, cutoffHz: 650 },
        motionPulse: { gain: 0.45, muted: false, solo: false, resonance: 1.2 },
        foleyImpact: { gain: 0.70, muted: false, solo: false, damping: 4.0 },
        textureShimmer: { gain: 0.25, muted: false, solo: false, spread: 0.6 },
    },
};
export class Store {
    state;
    listeners = new Set();
    constructor() {
        this.state = {
            video: { ...initialVideoState },
            telemetry: { ...initialTelemetryState },
            orchestrator: { ...initialOrchestratorState },
            mixer: { ...initialMixerState },
            // Placeholders bound by actions.ts
            loadVideoFile: async () => { },
            runAnalysis: async () => { },
            togglePlay: async () => { },
            seekTo: () => { },
            setStemVolume: () => { },
            exportLosslessWav: async () => new Blob(),
        };
    }
    getState() {
        return this.state;
    }
    setState(partial) {
        this.state = {
            ...this.state,
            ...partial,
            video: partial.video ? { ...this.state.video, ...partial.video } : this.state.video,
            telemetry: partial.telemetry ? { ...this.state.telemetry, ...partial.telemetry } : this.state.telemetry,
            orchestrator: partial.orchestrator ? { ...this.state.orchestrator, ...partial.orchestrator } : this.state.orchestrator,
            mixer: partial.mixer ? { ...this.state.mixer, ...partial.mixer } : this.state.mixer,
        };
        this.notify();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    notify() {
        for (const listener of this.listeners) {
            listener(this.state);
        }
    }
    reset() {
        if (this.state.video.objectUrl) {
            URL.revokeObjectURL(this.state.video.objectUrl);
        }
        this.setState({
            video: { ...initialVideoState },
            telemetry: { ...initialTelemetryState },
            orchestrator: { ...initialOrchestratorState },
            mixer: { ...initialMixerState },
        });
    }
}
export const store = new Store();

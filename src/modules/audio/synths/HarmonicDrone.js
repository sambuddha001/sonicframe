/**
 * src/modules/audio/synths/HarmonicDrone.ts
 * Detuned Chordal Pads & Adaptive Score Drone Generator
 * Implements Layer C2 of SONICFRAME Enterprise Architecture v4.0
 */
export const NOTE_SEMITONES = {
    C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
    'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};
export const SCALE_INTERVALS = {
    dorian: [0, 2, 3, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    minor_pentatonic: [0, 3, 5, 7, 10],
    cinematic_dark: [0, 1, 4, 5, 7, 8, 11],
};
export function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}
export class HarmonicDroneEngine {
    ctx;
    oscs = [];
    gains = [];
    filter = null;
    isPlaying = false;
    constructor(ctx) {
        this.ctx = ctx;
    }
    getChordFrequencies(keyRoot = 'D', scaleMode = 'dorian') {
        const rootSemi = NOTE_SEMITONES[keyRoot] ?? 2;
        const intervals = SCALE_INTERVALS[scaleMode] ?? SCALE_INTERVALS.dorian;
        const baseMidi = 38 + rootSemi; // D2 octave
        // Build 4-voice sustained cinematic chord: Root, 5th, Octave, 9th/3rd
        const chordMidis = [
            baseMidi,
            baseMidi + 7,
            baseMidi + 12,
            baseMidi + (intervals[2] !== undefined ? intervals[2] + 12 : 15),
        ];
        return chordMidis.map(midiToFreq);
    }
    start(destination, keyRoot = 'D', scaleMode = 'dorian') {
        if (this.isPlaying)
            return;
        this.stop();
        const freqs = this.getChordFrequencies(keyRoot, scaleMode);
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.setValueAtTime(650, this.ctx.currentTime);
        this.filter.Q.setValueAtTime(2.0, this.ctx.currentTime);
        this.filter.connect(destination);
        this.oscs = [];
        this.gains = [];
        freqs.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
            // Gentle chorus detune
            const detuneCents = (idx - 1.5) * 6;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            osc.detune.setValueAtTime(detuneCents, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.08 / freqs.length, this.ctx.currentTime + 1.2);
            osc.connect(gain);
            gain.connect(this.filter);
            osc.start();
            this.oscs.push(osc);
            this.gains.push(gain);
        });
        this.isPlaying = true;
    }
    setCutoff(freqHz) {
        if (this.filter) {
            const clamped = Math.max(120, Math.min(8000, freqHz));
            this.filter.frequency.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
        }
    }
    stop() {
        const stopTime = this.ctx.currentTime + 0.5;
        for (const g of this.gains) {
            g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
        }
        for (const o of this.oscs) {
            try {
                o.stop(stopTime);
            }
            catch {
                // already stopped
            }
        }
        this.oscs = [];
        this.gains = [];
        this.isPlaying = false;
    }
}

/**
 * test/test_ecc_architecture.js
 * Verification Suite for the Modular ECC Architecture & TypeScript Components
 */

import assert from 'node:assert/strict';
import { store } from '../src/app/state/store.js';
import { PeakDetector } from '../src/modules/telemetry/PeakDetector.js';
import { MODAL_PROFILES } from '../src/modules/audio/synths/ModalImpactSynth.js';
import { WavExporter } from '../src/modules/audio/Exporter.js';
import { CueSheetParser } from '../src/modules/orchestrator/CueSheetParser.js';
import { CopilotAgent } from '../src/modules/orchestrator/CopilotAgent.js';

console.log('======================================================');
console.log('   SONICFRAME MODULAR ECC ARCHITECTURE VERIFICATION   ');
console.log('======================================================\n');

// 1. Reactive State Store
console.log('--- Test 1: Reactive State Store ---');
let notified = false;
const unsub = store.subscribe((s) => {
  notified = true;
});

store.setState({
  orchestrator: {
    ...store.getState().orchestrator,
    mood: 'action_percussive',
  },
});

assert.equal(notified, true, 'Store subscriber must be notified');
assert.equal(store.getState().orchestrator.mood, 'action_percussive', 'Mood must update in store');
unsub();
console.log('✓ Store reactive pub-sub state transitions verified.');

// 2. Savitzky-Golay Peak Detector
console.log('\n--- Test 2: Savitzky-Golay 2nd Derivative Peak Detector ---');
const detector = new PeakDetector({ sensitivity: 0.62, minLockoutMs: 180 });

// Synthetic 10Hz vectors with a sharp deceleration shock at index 5 (500ms)
const vectors = Array.from({ length: 20 }, (_, i) => {
  let energy = 0.1;
  if (i === 3) energy = 0.4;
  if (i === 4) energy = 0.85;
  if (i === 5) energy = 0.05; // sharp deceleration arrest
  return {
    timeMs: i * 100,
    frameIndex: i * 3,
    kineticEnergy: energy,
    divergence: 0.1,
    curl: 0.05,
    centroidX: -0.2,
    centroidY: 0.0,
    deltaColorLAB: 0.2,
  };
});

const impacts = detector.detect(vectors);
assert.ok(impacts.length >= 1, 'Should detect at least 1 deceleration impact');
const firstImpact = impacts[0];
assert.ok(firstImpact.acceleration < 0, 'Impact acceleration must be negative');
assert.ok(firstImpact.energy > 0, 'Impact energy must be positive');
console.log(`✓ Savitzky-Golay filter detected impact at ${firstImpact.timeMs}ms with accel: ${firstImpact.acceleration}`);

// 3. Modal Physical Modeling Profiles
console.log('\n--- Test 3: Modal Physical Modeling Resonator Profiles ---');
assert.ok(MODAL_PROFILES.metal, 'Metal profile must be defined');
assert.deepEqual(MODAL_PROFILES.metal.modes, [1.00, 2.76, 5.40, 8.92], 'Metal mode ratios must match spec');
assert.deepEqual(MODAL_PROFILES.wood.modes, [1.00, 1.58, 2.32, 3.12], 'Wood mode ratios must match spec');
assert.equal(MODAL_PROFILES.earth.defaultFundamental, 68, 'Earth fundamental must be 68Hz');
console.log('✓ Inharmonic modal frequencies and decay profiles match specification.');

// 4. Deterministic Cue Sheet Composer
console.log('\n--- Test 4: Deterministic Cue Sheet Composer ---');
const telemetry = {
  durationSeconds: 15.0,
  fps: 30,
  totalFrames: 450,
  sampleRateHz: 10,
  summary: vectors,
  detectedImpacts: impacts,
};

const cueSheet = CueSheetParser.generateDeterministic(telemetry, 'cinematic_dark');
assert.ok(cueSheet.composition_profile, 'Composition profile must exist');
assert.equal(cueSheet.composition_profile.key_root, 'D', 'Cinematic mood must default to key D');
assert.equal(cueSheet.composition_profile.scale_mode, 'dorian', 'Cinematic mood must default to dorian');
assert.ok(cueSheet.foley_events.length >= 1, 'Foley events must be populated');
assert.equal(typeof cueSheet.foley_events[0].parameters.fundamental_freq, 'number');
assert.equal(typeof cueSheet.foley_events[0].parameters.decay_seconds, 'number');
console.log('✓ Grounded deterministic cue sheet generated with strictly typed parameters.');

// 5. Co-Pilot Natural Language Mutations
console.log('\n--- Test 5: Co-Pilot Natural Language Mutations ---');
const copilot = new CopilotAgent();

// Mutation 1: Double decay time
const origDecay = cueSheet.foley_events[0].parameters.decay_seconds;
const resDecay = copilot.handleCommand('double decay time on metallic clashes', cueSheet);
assert.equal(resDecay.executed, true, 'Command must execute');
assert.ok(resDecay.updatedCueSheet, 'Must return updated cue sheet');

// Mutation 2: Set key to E minor / phrygian
const resKey = copilot.handleCommand('set key to E minor phrygian', cueSheet);
assert.equal(resKey.executed, true);
assert.equal(resKey.updatedCueSheet.composition_profile.key_root, 'E');
assert.equal(resKey.updatedCueSheet.composition_profile.scale_mode, 'phrygian');
console.log('✓ Natural language Co-Pilot parameter mutations executed and validated.');

// 6. Lossless 24-Bit WAV Encoding
console.log('\n--- Test 6: Lossless 24-Bit WAV Encoding ---');
const fakeAudioBuffer = {
  numberOfChannels: 2,
  sampleRate: 48000,
  length: 4800, // 0.1s
  getChannelData: (c) => new Float32Array(4800).fill(c === 0 ? 0.25 : -0.25),
};

const wavBytes = WavExporter.encodeWav24Bit(fakeAudioBuffer);
assert.ok(wavBytes instanceof ArrayBuffer, 'Must return ArrayBuffer');
const expectedBytes = 44 + (4800 * 2 * 3); // 28844 bytes
assert.equal(wavBytes.byteLength, expectedBytes, `WAV buffer must be exactly ${expectedBytes} bytes`);

const view = new DataView(wavBytes);
const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
assert.equal(riff, 'RIFF');
const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
assert.equal(wave, 'WAVE');
const bitsPerSample = view.getUint16(34, true);
assert.equal(bitsPerSample, 24, 'Bits per sample must be 24-bit');
console.log('✓ Linear PCM 24-bit 48kHz WAV binary encoder validated.');

console.log('\n======================================================');
console.log('🎉 ALL MODULAR ECC ARCHITECTURE TESTS PASSED! (6/6)');
console.log('======================================================\n');

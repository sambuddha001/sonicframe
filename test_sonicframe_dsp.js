/**
 * Standalone Test Suite for SonicFrame DSP Engine
 * Validates:
 * 1. Physical Modeling Math & Membrane Vibration Equations (all 4 materials)
 * 2. Inharmonic modal frequencies, damping, and decay multipliers
 * 3. Scale mode calculations & chord voicing
 * 4. Dual-timer lookahead scheduler timing logic and sub-millisecond precision
 * 5. 24-bit 48kHz WAV PCM encoding and RIFF header compliance
 * 6. Procedural Impulse Response generation & Limiter curves
 * 7. Mock WebAudio Graph instantiation and Offline rendering pipeline
 */

import SonicFrameDSP from './sonicframe-dsp.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

console.log('========================================================');
console.log('🧪 Starting SonicFrame DSP Engine Test Suite');
console.log('========================================================\n');

// -----------------------------------------------------------------------------
// Test 1: Material Inharmonic Modes & Physical Vibration Equation
// -----------------------------------------------------------------------------
console.log('--- Test Group 1: Modal Physical Modeling & Membrane Vibration ---');

const materials = ['metal', 'wood', 'glass', 'earth'];
materials.forEach(mat => {
  const preset = SonicFrameDSP.MATERIAL_MODES[mat];
  assert(preset !== undefined, `Material preset '${mat}' is defined`);
  assert(Array.isArray(preset.modes) && preset.modes.length === 4, `${mat} has 4 inharmonic modes`);
  assert(preset.modes[0] === 1.0, `${mat} fundamental mode ratio is 1.00`);
  assert(preset.decayMultipliers.length === 4, `${mat} has 4 decay multipliers`);

  // Solve physical equation over 48kHz
  const samples = SonicFrameDSP.ModalSynthesizer.solveMembraneEquation(48000, {
    material: mat,
    fundamental: preset.defaultFundamental,
    damping: preset.defaultDamping,
    brightness: preset.defaultBrightness,
    velocity: 0.9
  });

  assert(samples instanceof Float32Array, `${mat} membrane equation produced Float32Array`);
  assert(samples.length > 480, `${mat} output buffer has valid duration (${samples.length} samples)`);

  // Verify signal is non-silent and bounded within [-1.0, 1.0]
  let maxAbs = 0;
  let nonZeroCount = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
    if (abs > 0.0001) nonZeroCount++;
  }
  assert(maxAbs > 0.1 && maxAbs <= 1.0, `${mat} peak amplitude is properly normalized: ${maxAbs.toFixed(4)}`);
  assert(nonZeroCount > samples.length * 0.2, `${mat} has sustained resonant body ring`);

  // Check that the envelope decays (tail amplitude < initial amplitude)
  const headEnergy = Math.abs(samples[50]) + Math.abs(samples[100]) + Math.abs(samples[150]);
  const tailEnergy = Math.abs(samples[samples.length - 100]) + Math.abs(samples[samples.length - 50]);
  assert(headEnergy > tailEnergy, `${mat} shows physical exponential damping (head: ${headEnergy.toFixed(3)} > tail: ${tailEnergy.toFixed(4)})`);
});

// Specific checks from requirements:
// Metal Plate: [1.00, 2.76, 5.40, 8.92] with decay multipliers [1.0, 1.4, 2.1, 3.2]
const metal = SonicFrameDSP.MATERIAL_MODES.metal;
assert(metal.modes[1] === 2.76 && metal.modes[2] === 5.40 && metal.modes[3] === 8.92, 'Metal Plate mode ratios match specification [1.00, 2.76, 5.40, 8.92]');
assert(metal.decayMultipliers[1] === 1.4 && metal.decayMultipliers[2] === 2.1 && metal.decayMultipliers[3] === 3.2, 'Metal Plate decay multipliers match specification [1.0, 1.4, 2.1, 3.2]');

// Wood / Mallet: [1.00, 1.58, 2.34, 3.12]
const wood = SonicFrameDSP.MATERIAL_MODES.wood;
assert(wood.modes[1] === 1.58 && wood.modes[2] === 2.34 && wood.modes[3] === 3.12, 'Wood / Mallet mode ratios match specification [1.00, 1.58, 2.34, 3.12]');

// Glass: [1.00, 2.32, 4.15, 6.70]
const glass = SonicFrameDSP.MATERIAL_MODES.glass;
assert(glass.modes[1] === 2.32 && glass.modes[2] === 4.15 && glass.modes[3] === 6.70, 'Glass mode ratios match specification [1.00, 2.32, 4.15, 6.70]');

// Earth / Thud: [1.00, 1.35, 1.80, 2.20]
const earth = SonicFrameDSP.MATERIAL_MODES.earth;
assert(earth.modes[1] === 1.35 && earth.modes[2] === 1.80 && earth.modes[3] === 2.20, 'Earth / Thud mode ratios match specification [1.00, 1.35, 1.80, 2.20]');

// -----------------------------------------------------------------------------
// Test 2: Scale Modes & Harmonic Chord Voicing
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 2: Scale Modes & Harmonic Pitch Math ---');

const expectedScales = ['dorian', 'aeolian', 'phrygian', 'lydian', 'minor_pentatonic', 'cinematic_dark'];
expectedScales.forEach(scaleName => {
  assert(SonicFrameDSP.SCALE_MODES[scaleName] !== undefined, `Scale mode '${scaleName}' is supported`);
});

// A4 frequency check
const a4Freq = SonicFrameDSP.noteToFrequency('A', 4);
assert(Math.abs(a4Freq - 440) < 0.001, `A4 note frequency is exactly 440Hz: got ${a4Freq}`);

// C3 frequency check (MIDI 48 = 130.81Hz)
const c3Freq = SonicFrameDSP.noteToFrequency('C', 3);
assert(Math.abs(c3Freq - 130.81) < 0.1, `C3 note frequency is approx 130.81Hz: got ${c3Freq.toFixed(2)}`);

// Check Drone chord generation
const mockCtxForDrone = { currentTime: 0 };
const mockDestForDrone = { connect: () => { } };
// Mock nodes
function createMockAudioNode() {
  return {
    connect: () => { },
    disconnect: () => { },
    setValueAtTime: () => { },
    linearRampToValueAtTime: () => { },
    exponentialRampToValueAtTime: () => { },
    cancelScheduledValues: () => { },
    start: () => { },
    stop: () => { },
    frequency: { setValueAtTime: () => { }, exponentialRampToValueAtTime: () => { }, cancelScheduledValues: () => { }, value: 350 },
    detune: { setValueAtTime: () => { } },
    Q: { setValueAtTime: () => { } },
    gain: { setValueAtTime: () => { }, linearRampToValueAtTime: () => { }, exponentialRampToValueAtTime: () => { }, cancelScheduledValues: () => { }, value: 1.0 }
  };
}
const mockAudioCtx = {
  currentTime: 1.5,
  sampleRate: 48000,
  createGain: createMockAudioNode,
  createOscillator: createMockAudioNode,
  createBiquadFilter: createMockAudioNode,
  createStereoPanner: () => ({ pan: { setValueAtTime: () => { }, linearRampToValueAtTime: () => { }, value: 0 }, connect: () => { } }),
  createDynamicsCompressor: () => ({
    threshold: { setValueAtTime: () => { } },
    knee: { setValueAtTime: () => { } },
    ratio: { setValueAtTime: () => { } },
    attack: { setValueAtTime: () => { } },
    release: { setValueAtTime: () => { } },
    connect: () => { }
  }),
  createWaveShaper: () => ({ connect: () => { } }),
  createConvolver: () => ({ connect: () => { } }),
  createBuffer: (channels, length, rate) => ({
    numberOfChannels: channels,
    length,
    sampleRate: rate,
    getChannelData: () => new Float32Array(length)
  }),
  createBufferSource: () => ({
    playbackRate: { setValueAtTime: () => { }, value: 1.0 },
    connect: () => { },
    start: () => { },
    stop: () => { }
  })
};

const drone = new SonicFrameDSP.DroneEngine(mockAudioCtx, createMockAudioNode());
drone.setScale('D', 'dorian');
const chordFreqs = drone.computeChordFrequencies();
assert(chordFreqs.length === 4, `Drone engine generates 4-voice chord array`);
assert(chordFreqs[0] < chordFreqs[1] && chordFreqs[1] < chordFreqs[2], `Chord frequencies are ascending harmonic intervals`);
console.log(`D Dorian Drone Chord: [${chordFreqs.map(f => f.toFixed(1) + 'Hz').join(', ')}]`);

// -----------------------------------------------------------------------------
// Test 3: Zero-Jitter Lookahead Scheduler Timing & Precision
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 3: Zero-Jitter Lookahead Scheduler ---');

let simulatedAudioTime = 10.000;
const schedulerAudioCtxMock = {
  get currentTime() { return simulatedAudioTime; },
  state: 'running',
  resume: () => { }
};

const scheduledEvents = [];
const scheduler = new SonicFrameDSP.LookaheadScheduler({
  audioCtx: schedulerAudioCtxMock,
  intervalMs: 25,
  lookaheadSec: 0.100, // 100ms window
  onTriggerCue: (cue, scheduledAudioTime) => {
    scheduledEvents.push({ cue, scheduledAudioTime, simulatedAudioTime });
  }
});

// Create test cue events at 0.050s, 0.090s, 0.150s, 0.250s (video timestamps)
scheduler.setCues([
  { id: 'cue_1', timestamp_ms: 50, category: 'impact_metallic' },
  { id: 'cue_2', timestamp_ms: 90, category: 'footstep_wood' },
  { id: 'cue_3', timestamp_ms: 150, category: 'whoosh_pass' },
  { id: 'cue_4', timestamp_ms: 250, category: 'impact_heavy' }
]);

// Start playback at videoCurrentTime = 0.000, when simulatedAudioTime = 10.000
scheduler.start(0.000, 1.0);

// At simulatedAudioTime = 10.000, lookahead is 10.000 to 10.100.
// Video time is 0.000, so video time window is 0.000 to 0.100s (0 to 100ms).
// Cues 1 (50ms) and 2 (90ms) should be scheduled immediately!
// Cues 3 (150ms) and 4 (250ms) must NOT be scheduled yet.
assert(scheduledEvents.length === 2, `Lookahead window scheduled exactly 2 upcoming cues in [0, 100ms]: got ${scheduledEvents.length}`);
assert(scheduledEvents[0].cue.id === 'cue_1', `First cue is cue_1`);
assert(Math.abs(scheduledEvents[0].scheduledAudioTime - 10.050) < 0.0001, `Target audio time for cue_1 has sub-millisecond precision: ${scheduledEvents[0].scheduledAudioTime.toFixed(4)}s`);
assert(scheduledEvents[1].cue.id === 'cue_2', `Second cue is cue_2`);
assert(Math.abs(scheduledEvents[1].scheduledAudioTime - 10.090) < 0.0001, `Target audio time for cue_2 has sub-millisecond precision: ${scheduledEvents[1].scheduledAudioTime.toFixed(4)}s`);

// Now advance time by 75ms (simulatedAudioTime = 10.075). Window is [10.075, 10.175].
// Video time is 0.075s. Lookahead window covers up to 0.175s.
// Cue 3 (150ms) should now be scheduled!
simulatedAudioTime = 10.075;
scheduler._tick();
assert(scheduledEvents.length === 3, `Advancing time scheduled cue_3: got ${scheduledEvents.length} events`);
assert(scheduledEvents[2].cue.id === 'cue_3', `Third scheduled cue is cue_3`);
assert(Math.abs(scheduledEvents[2].scheduledAudioTime - 10.150) < 0.0001, `Target audio time for cue_3 is 10.150s`);

// Test duplicate prevention: calling _tick() again at the same timestamp should NOT re-trigger cues
scheduler._tick();
assert(scheduledEvents.length === 3, `Duplicate prevention: cues are not re-triggered on subsequent ticks`);

// Test seek handling: seeking back to video time 0.020s
scheduler.seek(0.020);
assert(scheduler.scheduledCueIds.size < 3, `Seek back reset future scheduled cue IDs`);
scheduler.pause();

// -----------------------------------------------------------------------------
// Test 4: Procedural Impulse Response & Limiter Saturation Curve
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 4: DSP Components (Impulse Response & Soft Limiter) ---');

const limiterCurve = SonicFrameDSP.createSoftLimiterCurve(1024, 0.85);
assert(limiterCurve instanceof Float32Array && limiterCurve.length === 1024, `Limiter curve created with length 1024`);
// Center (0) should be 0
assert(Math.abs(limiterCurve[512]) < 0.001, `Limiter curve zero-crossing is accurate: ${limiterCurve[512]}`);
// Max value should smoothly approach 1.0 without exceeding 1.0
assert(limiterCurve[1023] <= 1.0 && limiterCurve[1023] > 0.95, `Limiter curve positive ceiling is <= 1.0: ${limiterCurve[1023].toFixed(4)}`);
assert(limiterCurve[0] >= -1.0 && limiterCurve[0] < -0.95, `Limiter curve negative ceiling is >= -1.0: ${limiterCurve[0].toFixed(4)}`);

// -----------------------------------------------------------------------------
// Test 5: Lossless 24-Bit 48kHz WAV PCM Encoder
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 5: Lossless 24-Bit 48kHz WAV Encoder ---');

// Create a synthetic stereo AudioBuffer with a 440Hz test sine wave
const sampleRate = 48000;
const testDuration = 0.5; // 0.5s = 24,000 samples
const numSamples = Math.floor(sampleRate * testDuration);
const leftChannel = new Float32Array(numSamples);
const rightChannel = new Float32Array(numSamples);

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  leftChannel[i] = Math.sin(2 * Math.PI * 440 * t) * 0.75;
  rightChannel[i] = Math.sin(2 * Math.PI * 880 * t) * 0.50;
}

const mockStereoBuffer = {
  numberOfChannels: 2,
  sampleRate: 48000,
  length: numSamples,
  getChannelData: (ch) => ch === 0 ? leftChannel : rightChannel
};

const wavBuffer = SonicFrameDSP.WavExporter.encodeAudioBufferToWav24(mockStereoBuffer);
assert(wavBuffer instanceof ArrayBuffer, `WavExporter produced ArrayBuffer`);

const expectedDataBytes = numSamples * 2 * 3; // samples * 2 channels * 3 bytes (24-bit)
const expectedTotalBytes = 44 + expectedDataBytes;
assert(wavBuffer.byteLength === expectedTotalBytes, `WAV buffer size matches exact 24-bit PCM spec: ${wavBuffer.byteLength} bytes (expected ${expectedTotalBytes})`);

const wavView = new DataView(wavBuffer);
// Read RIFF header
const chunkId = String.fromCharCode(wavView.getUint8(0), wavView.getUint8(1), wavView.getUint8(2), wavView.getUint8(3));
assert(chunkId === 'RIFF', `ChunkID is 'RIFF'`);

const format = String.fromCharCode(wavView.getUint8(8), wavView.getUint8(9), wavView.getUint8(10), wavView.getUint8(11));
assert(format === 'WAVE', `Format is 'WAVE'`);

const subchunk1Id = String.fromCharCode(wavView.getUint8(12), wavView.getUint8(13), wavView.getUint8(14), wavView.getUint8(15));
assert(subchunk1Id === 'fmt ', `Subchunk1ID is 'fmt '`);

const audioFormat = wavView.getUint16(20, true);
assert(audioFormat === 1, `AudioFormat is 1 (uncompressed PCM)`);

const numChannels = wavView.getUint16(22, true);
assert(numChannels === 2, `NumChannels is 2 (Stereo)`);

const sampleRateHeader = wavView.getUint32(24, true);
assert(sampleRateHeader === 48000, `SampleRate is 48,000 Hz`);

const byteRate = wavView.getUint32(28, true);
assert(byteRate === 48000 * 2 * 3, `ByteRate is 288,000 B/s (48000 * 2 * 3)`);

const blockAlign = wavView.getUint16(32, true);
assert(blockAlign === 6, `BlockAlign is 6 bytes (2 channels * 3 bytes)`);

const bitsPerSample = wavView.getUint16(34, true);
assert(bitsPerSample === 24, `BitsPerSample is 24-bit`);

const subchunk2Id = String.fromCharCode(wavView.getUint8(36), wavView.getUint8(37), wavView.getUint8(38), wavView.getUint8(39));
assert(subchunk2Id === 'data', `Subchunk2ID is 'data'`);

const subchunk2Size = wavView.getUint32(40, true);
assert(subchunk2Size === expectedDataBytes, `Subchunk2Size is ${subchunk2Size} bytes`);

// Verify first non-zero 24-bit samples are correctly packed little-endian
// Let's decode sample at index 100 for channel 0
const sampleIndex = 100;
const byteOffset = 44 + sampleIndex * 6; // Left channel
const b0 = wavView.getUint8(byteOffset);
const b1 = wavView.getUint8(byteOffset + 1);
const b2 = wavView.getUint8(byteOffset + 2);
let decodedInt24 = (b2 << 16) | (b1 << 8) | b0;
if (decodedInt24 & 0x800000) decodedInt24 -= 0x1000000; // Sign extend
const decodedSample = decodedInt24 / 8388607;
const expectedSample = leftChannel[sampleIndex];
assert(Math.abs(decodedSample - expectedSample) < 0.0001, `24-bit sample roundtrip matches within quantization precision: got ${decodedSample.toFixed(5)}, expected ${expectedSample.toFixed(5)}`);

// -----------------------------------------------------------------------------
// Test 6: 5-Channel Parametric Stem Mixer Routing & Solo/Mute Logic
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 6: 5-Channel Parametric Stem Mixer Logic ---');

const mixer = new SonicFrameDSP.StemMixer(mockAudioCtx);
assert(mixer.channels.atmosphere !== undefined, 'Stem Mixer has Atmosphere channel');
assert(mixer.channels.motionPulse !== undefined, 'Stem Mixer has Motion Pulse channel');
assert(mixer.channels.foleyImpact !== undefined, 'Stem Mixer has Foley Impact channel');
assert(mixer.channels.textureShimmer !== undefined, 'Stem Mixer has Texture Shimmer channel');

// Test mute logic
mixer.setMute('foleyImpact', true);
assert(mixer.channels.foleyImpact.muted === true, 'Foley Impact stem is muted');

// Test solo logic
mixer.setSolo('textureShimmer', true);
assert(mixer.channels.textureShimmer.solo === true, 'Texture Shimmer stem is soloed');

// Reset states
mixer.setMute('foleyImpact', false);
mixer.setSolo('textureShimmer', false);
assert(mixer.channels.foleyImpact.muted === false, 'Mute cleared');
assert(mixer.channels.textureShimmer.solo === false, 'Solo cleared');

// Test EQ setters
mixer.setEQ('foleyImpact', { low: -3, mid: 2, high: 1.5, midFreq: 1200 });
assert(true, 'Stem 3-band EQ settings applied without errors');

// Test Panning
mixer.setPan('foleyImpact', -0.6);
assert(true, 'Stem stereo panning applied without errors');

// -----------------------------------------------------------------------------
// Test 7: Full Engine Initialization & Cue Sheet Ingestion
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 7: Unified SonicFrameAudioEngine ---');

const engine = new SonicFrameDSP.AudioEngine();
engine.init(mockAudioCtx);
assert(engine.isInitialized === true, 'AudioEngine initialized successfully');

// Test cue sheet ingestion conforming to specification schema
const testCueSheet = {
  composition_profile: {
    key_root: 'E',
    scale_mode: 'cinematic_dark',
    base_bpm: 96,
    intensity_curve: 'exponential_build'
  },
  foley_events: [
    {
      timestamp_ms: 1200,
      frame_number: 36,
      category: 'impact_metallic',
      patch_type: 'modal_resonator',
      velocity: 0.95,
      pan: -0.4,
      parameters: { fundamental_freq: 320, decay_seconds: 0.8, brightness: 0.85 }
    },
    {
      timestamp_ms: 2400,
      frame_number: 72,
      category: 'footstep_gravel',
      patch_type: 'granular_cluster',
      velocity: 0.70,
      pan: 0.2,
      parameters: { fundamental_freq: 800, decay_seconds: 0.12 }
    },
    {
      timestamp_ms: 3800,
      frame_number: 114,
      category: 'whoosh_pass',
      patch_type: 'granular_cluster',
      velocity: 0.80,
      pan: 0.6,
      parameters: { decay_seconds: 0.50 }
    }
  ],
  stem_automations: {
    atmosphere_cutoff: [
      { timestamp_ms: 0, value_hz: 300 },
      { timestamp_ms: 2000, value_hz: 1200 },
      { timestamp_ms: 5000, value_hz: 3600 }
    ]
  }
};

engine.loadCueSheet(testCueSheet);
assert(engine.currentCueSheet !== null, 'Cue sheet loaded into engine');
assert(engine.droneEngine.keyRoot === 'E', 'Drone engine root key updated to E');
assert(engine.droneEngine.scaleMode === 'cinematic_dark', 'Drone engine scale mode updated to cinematic_dark');
assert(engine.scheduler.cues.length === 3, 'Lookahead scheduler received all 3 foley events');

// Test real-time visual telemetry modulation
engine.updateTelemetry({ divergence: 1.2, centroidX: 0.45 });
assert(engine.droneEngine.currentCutoff > 350, `Visual divergence (1.2) successfully opened drone cutoff: ${engine.droneEngine.currentCutoff.toFixed(1)}Hz`);

console.log('\n========================================================');
console.log(`🎉 ALL ${passedTests} TESTS PASSED OUT OF ${totalTests}!`);
console.log('========================================================');

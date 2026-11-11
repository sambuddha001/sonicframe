/**
 * SONICFRAME DSP Engine - Optical-Flow Driven Foley & Adaptive Score Engine
 *
 * Implements:
 * 1. Zero-Jitter Dual-Timer Lookahead Scheduler (25ms loop, 100ms lookahead window, sub-millisecond precision)
 * 2. Modal Physical Modeling Synthesizer (membrane vibration equation with inharmonic modes)
 * 3. Granular Texture Synthesizer (procedural footsteps, whooshes, friction/cloth)
 * 4. Subtractive Score Drone Engine (polyphonic detuned saw + 24dB resonant ladder filter with divergence automation)
 * 5. 5-Channel Parametric Stem Bus (Atmosphere, Motion Pulse, Foley Impacts, Texture Shimmer, Master)
 * 6. Convolution Reverb with Procedural Impulse Response Generation
 * 7. Master Dynamics Compressor & Soft-Knee Peak Limiter
 * 8. Lossless 24-bit 48kHz WAV Master Export Pipeline
 */

(function (global) {
  'use strict';

  // =========================================================================
  // 1. CONSTANTS & PHYSICAL PRESETS
  // =========================================================================

  const MATERIAL_MODES = {
    metal: {
      name: 'Metal Plate',
      modes: [1.00, 2.76, 5.40, 8.92],
      decayMultipliers: [1.0, 1.4, 2.1, 3.2],
      defaultDamping: 2.8,
      defaultBrightness: 0.85,
      defaultFundamental: 280,
      clickGain: 0.35
    },
    wood: {
      name: 'Wood / Mallet',
      modes: [1.00, 1.58, 2.34, 3.12],
      decayMultipliers: [1.0, 1.8, 2.6, 3.8],
      defaultDamping: 10.0,
      defaultBrightness: 0.40,
      defaultFundamental: 180,
      clickGain: 0.50
    },
    glass: {
      name: 'Glass / Crystal',
      modes: [1.00, 2.32, 4.15, 6.70],
      decayMultipliers: [1.0, 1.15, 1.35, 1.6],
      defaultDamping: 1.2,
      defaultBrightness: 0.95,
      defaultFundamental: 620,
      clickGain: 0.45
    },
    earth: {
      name: 'Earth / Thud',
      modes: [1.00, 1.35, 1.80, 2.20],
      decayMultipliers: [1.0, 2.0, 3.2, 4.5],
      defaultDamping: 14.0,
      defaultBrightness: 0.20,
      defaultFundamental: 68,
      clickGain: 0.20
    }
  };

  const SCALE_MODES = {
    dorian: [0, 2, 3, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    minor_pentatonic: [0, 3, 5, 7, 10],
    cinematic_dark: [0, 1, 4, 5, 7, 8, 11] // Harmonic minor with b2 (Phrygian Dominant / Double Harmonic tension)
  };

  const NOTE_TO_SEMITONE = {
    'C': 0, 'C#': 1, 'Db': 1,
    'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11
  };

  /**
   * Converts a note name and octave into a frequency in Hz (A4 = 440Hz).
   * @param {string} note - e.g. "C", "D#", "F"
   * @param {number} octave - e.g. 2, 3, 4
   * @returns {number} Frequency in Hz
   */
  function noteToFrequency(note = 'C', octave = 3) {
    const semitone = NOTE_TO_SEMITONE[note] !== undefined ? NOTE_TO_SEMITONE[note] : 0;
    const midi = (octave + 1) * 12 + semitone;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Helper to clamp numbers.
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // =========================================================================
  // 2. PROCEDURAL SYNTHETIC IMPULSE RESPONSE GENERATOR (Convolution Reverb)
  // =========================================================================

  /**
   * Generates a stereo impulse response buffer for convolution reverb.
   * Uses decaying exponentially damped noise with frequency-dependent HF absorption.
   *
   * @param {BaseAudioContext} audioCtx
   * @param {Object} options
   * @param {number} options.duration - Reverb decay length in seconds (default 2.4s)
   * @param {number} options.decay - Exponential decay exponent (default 2.0)
   * @param {number} options.roomSize - Perceived room size (default 0.7)
   * @param {number} options.preDelay - Initial silence before reflections (default 0.012s)
   * @returns {AudioBuffer}
   */
  function createImpulseResponse(audioCtx, options = {}) {
    const duration = options.duration || 2.4;
    const decay = options.decay || 2.0;
    const roomSize = options.roomSize || 0.7;
    const preDelay = options.preDelay || 0.012;
    const sampleRate = audioCtx.sampleRate || 48000;
    const length = Math.floor(sampleRate * duration);
    const preDelaySamples = Math.floor(sampleRate * preDelay);

    const buffer = audioCtx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Initial early reflections simulation
    const earlyReflections = [
      { t: 0.015, gL: 0.7, gR: 0.4 },
      { t: 0.027, gL: 0.5, gR: 0.6 },
      { t: 0.038, gL: 0.4, gR: 0.45 },
      { t: 0.052, gL: 0.3, gR: 0.35 }
    ];

    let prevL = 0;
    let prevR = 0;
    const hfAbsorption = 0.85 - (roomSize * 0.25); // Higher absorption = darker reverb

    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }

      const t = (i - preDelaySamples) / sampleRate;
      const progress = t / (duration - preDelay);
      const envelope = Math.exp(-decay * progress);

      // Decorrelated white noise with one-pole lowpass filter for air absorption
      const rawL = (Math.random() * 2 - 1);
      const rawR = (Math.random() * 2 - 1);

      prevL = rawL * (1 - hfAbsorption) + prevL * hfAbsorption;
      prevR = rawR * (1 - hfAbsorption) + prevR * hfAbsorption;

      left[i] = prevL * envelope;
      right[i] = prevR * envelope;
    }

    // Add discrete early reflection peaks
    for (const er of earlyReflections) {
      const idx = Math.floor(er.t * sampleRate);
      if (idx < length) {
        left[idx] += er.gL;
        right[idx] += er.gR;
      }
    }

    return buffer;
  }

  // =========================================================================
  // 3. MASTER SOFT-KNEE LIMITER CURVE
  // =========================================================================

  /**
   * Generates a soft-knee saturation transfer curve for WaveShaperNode.
   * Prevents harsh digital clipping by smoothly compressing peaks near 0dBFS.
   *
   * @param {number} samples - Curve resolution (e.g. 4096)
   * @param {number} threshold - Knee onset (e.g. 0.82)
   * @returns {Float32Array}
   */
  function createSoftLimiterCurve(samples = 4096, threshold = 0.82) {
    const curve = new Float32Array(samples);
    const half = samples / 2;

    for (let i = 0; i < samples; i++) {
      const x = (i - half) / half;
      const absX = Math.abs(x);

      if (absX <= threshold) {
        curve[i] = x;
      } else {
        // C1-continuous Hermite soft-knee saturation:
        // u in [0, 1], S(u) = u + u^2 - u^3
        // S(0)=0, S(1)=1, S'(0)=1 (matches slope), S'(1)=0 (smooth zero-slope ceiling at 1.0)
        const sign = x < 0 ? -1 : 1;
        const u = clamp((absX - threshold) / (1.0 - threshold), 0, 1);
        const compressed = threshold + (1.0 - threshold) * (u + u * u - u * u * u);
        curve[i] = sign * clamp(compressed, 0, 1.0);
      }
    }
    return curve;
  }

  // =========================================================================
  // 4. 5-CHANNEL PARAMETRIC STEM MIXER (StemMixer)
  // =========================================================================

  /**
   * 5-Channel Parametric Stem Mixer Architecture:
   * Channels:
   *  - atmosphere (Ambient beds, score drones)
   *  - motionPulse (Rhythmic kinetic pulses)
   *  - foleyImpact (Modal physical impact hits)
   *  - textureShimmer (Granular wind, footsteps, friction)
   *  - master (Summing bus with master EQ, compressor, limiter)
   *
   * Features:
   *  - 3-band parametric EQ per channel (Low shelf 100Hz, Mid peak 1kHz, High shelf 6kHz)
   *  - Stereo panning per channel
   *  - Solo / Mute state logic
   *  - Auxiliary convolution reverb send bus
   *  - Dynamics compression & soft-knee peak limiting
   */
  class StemMixer {
    /**
     * @param {BaseAudioContext} audioCtx
     * @param {Object} options
     */
    constructor(audioCtx, options = {}) {
      this.ctx = audioCtx;
      this.channelNames = ['atmosphere', 'motionPulse', 'foleyImpact', 'textureShimmer'];
      this.channels = {};

      // Master summing node
      this.masterSum = this.ctx.createGain();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(options.masterVolume !== undefined ? options.masterVolume : 0.85, this.ctx.currentTime || 0);

      // Convolution Reverb Send Bus
      this.reverbInput = this.ctx.createGain();
      this.reverbConvolver = this.ctx.createConvolver();
      this.reverbConvolver.buffer = createImpulseResponse(this.ctx, {
        duration: options.reverbDuration || 2.5,
        decay: options.reverbDecay || 2.2,
        roomSize: options.roomSize || 0.75
      });
      this.reverbReturn = this.ctx.createGain();
      this.reverbReturn.gain.setValueAtTime(0.35, this.ctx.currentTime || 0);

      this.reverbInput.connect(this.reverbConvolver);
      this.reverbConvolver.connect(this.reverbReturn);
      this.reverbReturn.connect(this.masterSum);

      // Master 3-Band Parametric EQ
      this.masterEQLow = this.ctx.createBiquadFilter();
      this.masterEQLow.type = 'lowshelf';
      this.masterEQLow.frequency.value = 90;
      this.masterEQLow.gain.value = 0;

      this.masterEQMid = this.ctx.createBiquadFilter();
      this.masterEQMid.type = 'peaking';
      this.masterEQMid.frequency.value = 1000;
      this.masterEQMid.Q.value = 1.0;
      this.masterEQMid.gain.value = 0;

      this.masterEQHigh = this.ctx.createBiquadFilter();
      this.masterEQHigh.type = 'highshelf';
      this.masterEQHigh.frequency.value = 6500;
      this.masterEQHigh.gain.value = 0;

      // Master Dynamics Compressor
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime || 0); // dB
      this.compressor.knee.setValueAtTime(12, this.ctx.currentTime || 0);       // dB (soft knee)
      this.compressor.ratio.setValueAtTime(3.5, this.ctx.currentTime || 0);     // 3.5:1
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime || 0);  // 3ms
      this.compressor.release.setValueAtTime(0.150, this.ctx.currentTime || 0); // 150ms

      // Master Limiter (Waveshaper)
      this.limiter = this.ctx.createWaveShaper();
      this.limiter.curve = createSoftLimiterCurve(4096, 0.85);
      this.limiter.oversample = '2x';

      // Connect Master chain
      this.masterSum.connect(this.masterEQLow);
      this.masterEQLow.connect(this.masterEQMid);
      this.masterEQMid.connect(this.masterEQHigh);
      this.masterEQHigh.connect(this.compressor);
      this.compressor.connect(this.limiter);
      this.limiter.connect(this.masterGain);

      // Initialize the 4 individual stem channels
      for (const name of this.channelNames) {
        this.channels[name] = this._createChannelStrip(name);
      }
    }

    /**
     * Builds a channel strip with 3-band EQ, pan, gain, and reverb send.
     * @private
     */
    _createChannelStrip(name) {
      const input = this.ctx.createGain();

      // 3-Band Parametric EQ
      const eqLow = this.ctx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 120;
      eqLow.gain.value = 0;

      const eqMid = this.ctx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1000;
      eqMid.Q.value = 1.0;
      eqMid.gain.value = 0;

      const eqHigh = this.ctx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 5500;
      eqHigh.gain.value = 0;

      // Channel Panner
      let panner;
      if (typeof this.ctx.createStereoPanner === 'function') {
        panner = this.ctx.createStereoPanner();
        panner.pan.value = 0;
      } else {
        // Fallback for environments lacking createStereoPanner
        panner = this.ctx.createGain();
      }

      // Channel Post-Fader Gain
      const channelGain = this.ctx.createGain();
      channelGain.gain.setValueAtTime(1.0, this.ctx.currentTime || 0);

      // Reverb Send Gain
      const reverbSend = this.ctx.createGain();
      const defaultSend = name === 'foleyImpact' ? 0.35 : name === 'atmosphere' ? 0.50 : 0.20;
      reverbSend.gain.setValueAtTime(defaultSend, this.ctx.currentTime || 0);

      // Routing: Input -> EQLow -> EQMid -> EQHigh -> Panner -> ChannelGain -> MasterSum
      //                                                      -> ReverbSend  -> ReverbInput
      input.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(panner);
      panner.connect(channelGain);
      channelGain.connect(this.masterSum);

      panner.connect(reverbSend);
      reverbSend.connect(this.reverbInput);

      return {
        name,
        input,
        eqLow,
        eqMid,
        eqHigh,
        panner,
        channelGain,
        reverbSend,
        userVolume: 1.0,
        muted: false,
        solo: false
      };
    }

    /**
     * Connects mixer master output to an AudioNode destination.
     * @param {AudioNode} destination
     */
    connect(destination) {
      this.masterGain.connect(destination);
    }

    /**
     * Disconnects master output.
     */
    disconnect() {
      this.masterGain.disconnect();
    }

    /**
     * Returns the AudioNode input for a specific stem channel.
     * @param {string} channelName
     * @returns {GainNode}
     */
    getInput(channelName) {
      if (this.channels[channelName]) {
        return this.channels[channelName].input;
      }
      return this.masterSum;
    }

    /**
     * Sets volume for a specific channel.
     * @param {string} channelName - 'atmosphere' | 'motionPulse' | 'foleyImpact' | 'textureShimmer'
     * @param {number} volume - Linear volume 0.0 to 1.5
     * @param {number} [rampTime=0.02] - Transition time in seconds
     */
    setVolume(channelName, volume, rampTime = 0.02) {
      const ch = this.channels[channelName];
      if (!ch) return;
      ch.userVolume = clamp(volume, 0, 2.0);
      this._updateChannelGains(rampTime);
    }

    /**
     * Toggles or sets mute state.
     * @param {string} channelName
     * @param {boolean} muted
     */
    setMute(channelName, muted) {
      const ch = this.channels[channelName];
      if (!ch) return;
      ch.muted = !!muted;
      this._updateChannelGains();
    }

    /**
     * Toggles or sets solo state.
     * @param {string} channelName
     * @param {boolean} solo
     */
    setSolo(channelName, solo) {
      const ch = this.channels[channelName];
      if (!ch) return;
      ch.solo = !!solo;
      this._updateChannelGains();
    }

    /**
     * Sets 3-band EQ parameters for a channel.
     * @param {string} channelName
     * @param {Object} eq
     * @param {number} [eq.low] - Low shelf gain in dB (-24 to +24)
     * @param {number} [eq.mid] - Mid peak gain in dB (-24 to +24)
     * @param {number} [eq.high] - High shelf gain in dB (-24 to +24)
     * @param {number} [eq.midFreq] - Mid frequency in Hz (200 to 5000)
     */
    setEQ(channelName, eq = {}) {
      const ch = this.channels[channelName];
      if (!ch) return;
      const now = this.ctx.currentTime || 0;
      if (eq.low !== undefined) ch.eqLow.gain.setValueAtTime(clamp(eq.low, -24, 24), now);
      if (eq.mid !== undefined) ch.eqMid.gain.setValueAtTime(clamp(eq.mid, -24, 24), now);
      if (eq.high !== undefined) ch.eqHigh.gain.setValueAtTime(clamp(eq.high, -24, 24), now);
      if (eq.midFreq !== undefined) ch.eqMid.frequency.setValueAtTime(clamp(eq.midFreq, 100, 8000), now);
    }

    /**
     * Sets stereo panning for a stem channel.
     * @param {string} channelName
     * @param {number} pan - -1.0 (left) to +1.0 (right)
     * @param {number} [time] - Scheduling time
     */
    setPan(channelName, pan, time) {
      const ch = this.channels[channelName];
      if (!ch || !ch.panner || !ch.panner.pan) return;
      const targetTime = time !== undefined ? time : (this.ctx.currentTime || 0);
      ch.panner.pan.setValueAtTime(clamp(pan, -1.0, 1.0), targetTime);
    }

    /**
     * Sets auxiliary reverb send level for a channel.
     * @param {string} channelName
     * @param {number} sendGain - 0.0 to 1.0
     */
    setReverbSend(channelName, sendGain) {
      const ch = this.channels[channelName];
      if (!ch) return;
      const now = this.ctx.currentTime || 0;
      ch.reverbSend.gain.setValueAtTime(clamp(sendGain, 0, 1.5), now);
    }

    /**
     * Sets master output volume.
     * @param {number} volume - 0.0 to 1.5
     */
    setMasterVolume(volume) {
      const now = this.ctx.currentTime || 0;
      this.masterGain.gain.setValueAtTime(clamp(volume, 0, 2.0), now);
    }

    /**
     * Recalculates effective channel gains taking mute and solo logic into account.
     * @private
     */
    _updateChannelGains(rampTime = 0.02) {
      const hasSolo = this.channelNames.some(name => this.channels[name].solo);
      const now = this.ctx.currentTime || 0;

      for (const name of this.channelNames) {
        const ch = this.channels[name];
        let targetGain = 0;

        if (ch.muted) {
          targetGain = 0;
        } else if (hasSolo) {
          targetGain = ch.solo ? ch.userVolume : 0;
        } else {
          targetGain = ch.userVolume;
        }

        if (rampTime > 0) {
          ch.channelGain.gain.cancelScheduledValues(now);
          ch.channelGain.gain.setValueAtTime(ch.channelGain.gain.value, now);
          ch.channelGain.gain.linearRampToValueAtTime(targetGain, now + rampTime);
        } else {
          ch.channelGain.gain.setValueAtTime(targetGain, now);
        }
      }
    }
  }

  // =========================================================================
  // 5. MODAL PHYSICAL MODELING SYNTHESIZER (ModalSynthesizer)
  // =========================================================================

  /**
   * Solves the physical membrane vibration equation:
   * y(t) = sum_{k=1..M} A_k * exp(-d_k * t) * sin(2*pi*f_k*t + phi_k)
   *
   * Features:
   * - Inharmonic modal frequencies for materials: Metal Plate, Wood/Mallet, Glass, Earth/Thud.
   * - Exponential damping envelopes per mode.
   * - Dynamic brightness controlling higher partial amplitudes.
   * - Initial transient attack mallet click generator.
   * - Automated dynamic StereoPannerNode mapped to motion centroid X.
   * - Pure mathematical buffer synthesis method for offline testing.
   */
  class ModalSynthesizer {
    /**
     * @param {BaseAudioContext} audioCtx
     * @param {AudioNode} destinationNode
     */
    constructor(audioCtx, destinationNode) {
      this.ctx = audioCtx;
      this.destination = destinationNode;
    }

    /**
     * Triggers a modal physical impact sound in real-time Web Audio.
     *
     * @param {Object} params
     * @param {string} [params.material='metal'] - 'metal' | 'wood' | 'glass' | 'earth'
     * @param {number} [params.fundamental] - Fundamental frequency in Hz
     * @param {number} [params.damping] - Overall damping coefficient (higher = faster decay)
     * @param {number} [params.brightness=0.8] - High-frequency mode gain multiplier (0.0 to 1.0)
     * @param {number} [params.velocity=1.0] - Impact strike velocity (0.0 to 1.0)
     * @param {number} [params.pan=0.0] - Stereo pan (-1.0 to +1.0)
     * @param {number} [params.time] - Exact AudioContext.currentTime timestamp
     * @returns {number} Estimated total duration of the impact in seconds
     */
    triggerImpact(params = {}) {
      const materialKey = (params.material && MATERIAL_MODES[params.material]) ? params.material : 'metal';
      const preset = MATERIAL_MODES[materialKey];

      const fundamental = params.fundamental || preset.defaultFundamental;
      const damping = params.damping || preset.defaultDamping;
      const brightness = params.brightness !== undefined ? clamp(params.brightness, 0, 1) : preset.defaultBrightness;
      const velocity = params.velocity !== undefined ? clamp(params.velocity, 0.05, 1.0) : 0.8;
      const pan = params.pan !== undefined ? clamp(params.pan, -1.0, 1.0) : 0.0;
      const startTime = params.time !== undefined ? params.time : (this.ctx.currentTime || 0);

      // Stereo panner for spatial motion tracking
      let panner;
      if (typeof this.ctx.createStereoPanner === 'function') {
        panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
      } else {
        panner = this.ctx.createGain();
      }
      panner.connect(this.destination);

      let maxDuration = 0;

      // 1. Synthesize each physical mode (OscillatorNode + Exponential Decay GainNode)
      preset.modes.forEach((modeRatio, k) => {
        const decayMul = preset.decayMultipliers[k] || 1.0;
        const modeFreq = fundamental * modeRatio;

        // Skip frequencies beyond Nyquist
        if (modeFreq > (this.ctx.sampleRate ? this.ctx.sampleRate / 2 : 22000)) return;

        // Mode amplitude calculation: higher modes attenuated by brightness
        const modeBrightnessFactor = Math.pow(brightness, k);
        const modeGain = (1.0 / (k + 1)) * modeBrightnessFactor * velocity * 0.45;

        // Mode decay duration (tau = 1 / (damping * decayMul))
        const effectiveDamping = damping * decayMul;
        const decayTime = Math.max(0.015, 1.2 / effectiveDamping);
        if (decayTime > maxDuration) maxDuration = decayTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(modeFreq, startTime);

        // Exponential decay envelope
        gain.gain.setValueAtTime(0.0001, startTime);
        // Instant attack transient (1-3ms)
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, modeGain), startTime + 0.0025);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + decayTime);

        osc.connect(gain);
        gain.connect(panner);

        osc.start(startTime);
        osc.stop(startTime + decayTime + 0.04);
      });

      // 2. High-frequency mallet strike contact transient (micro-noise burst)
      const clickDuration = Math.min(0.012, maxDuration * 0.25);
      const clickSamples = Math.max(64, Math.floor((this.ctx.sampleRate || 48000) * clickDuration));
      const clickBuf = this.ctx.createBuffer(1, clickSamples, this.ctx.sampleRate || 48000);
      const clickData = clickBuf.getChannelData(0);

      for (let i = 0; i < clickSamples; i++) {
        const decayEnv = 1.0 - (i / clickSamples);
        clickData[i] = (Math.random() * 2 - 1) * decayEnv * decayEnv;
      }

      const clickSrc = this.ctx.createBufferSource();
      clickSrc.buffer = clickBuf;

      const clickFilter = this.ctx.createBiquadFilter();
      clickFilter.type = materialKey === 'glass' ? 'highpass' : materialKey === 'wood' ? 'bandpass' : 'bandpass';
      clickFilter.frequency.setValueAtTime(materialKey === 'glass' ? 3500 : fundamental * 2.5, startTime);

      const clickGain = this.ctx.createGain();
      const strikeGain = preset.clickGain * velocity * 0.35;
      clickGain.gain.setValueAtTime(strikeGain, startTime);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + clickDuration);

      clickSrc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(panner);

      clickSrc.start(startTime);
      clickSrc.stop(startTime + clickDuration + 0.01);

      return maxDuration;
    }

    /**
     * Pure mathematical solver for the modal membrane vibration equation.
     * Computes raw PCM Float32Array samples without requiring WebAudio nodes.
     * Useful for offline processing, worker threads, and unit tests.
     *
     * @param {number} sampleRate - e.g. 48000
     * @param {Object} params
     * @returns {Float32Array}
     */
    static solveMembraneEquation(sampleRate, params = {}) {
      const materialKey = (params.material && MATERIAL_MODES[params.material]) ? params.material : 'metal';
      const preset = MATERIAL_MODES[materialKey];

      const f0 = params.fundamental || preset.defaultFundamental;
      const damping = params.damping || preset.defaultDamping;
      const brightness = params.brightness !== undefined ? params.brightness : preset.defaultBrightness;
      const velocity = params.velocity !== undefined ? params.velocity : 1.0;

      // Estimate total duration
      let maxDuration = 0;
      preset.modes.forEach((_, k) => {
        const d = damping * (preset.decayMultipliers[k] || 1.0);
        const t = 4.0 / d; // 4 time constants ~ -35dB decay
        if (t > maxDuration) maxDuration = t;
      });
      maxDuration = clamp(maxDuration, 0.05, 5.0);

      const numSamples = Math.floor(sampleRate * maxDuration);
      const output = new Float32Array(numSamples);

      preset.modes.forEach((modeRatio, k) => {
        const fk = f0 * modeRatio;
        const dk = damping * (preset.decayMultipliers[k] || 1.0);
        const Ak = (1.0 / (k + 1)) * Math.pow(brightness, k) * velocity;
        const omega = 2 * Math.PI * fk;
        const phi = (Math.PI / 4) * k; // Phase dispersion

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const envelope = Ak * Math.exp(-dk * t);
          output[i] += envelope * Math.sin(omega * t + phi);
        }
      });

      // Normalize output to prevent digital clipping
      let peak = 0;
      for (let i = 0; i < numSamples; i++) {
        const absVal = Math.abs(output[i]);
        if (absVal > peak) peak = absVal;
      }
      if (peak > 0.00001) {
        const normFactor = 0.9 / peak;
        for (let i = 0; i < numSamples; i++) {
          output[i] *= normFactor;
        }
      }

      return output;
    }
  }

  // =========================================================================
  // 6. GRANULAR TEXTURE SYNTHESIZER (GranularSynthesizer)
  // =========================================================================

  /**
   * Procedural granular synthesis for footsteps (wood/gravel/dirt),
   * aerodynamic whooshes, and cloth/friction textures.
   */
  class GranularSynthesizer {
    /**
     * @param {BaseAudioContext} audioCtx
     * @param {AudioNode} destinationNode
     */
    constructor(audioCtx, destinationNode) {
      this.ctx = audioCtx;
      this.destination = destinationNode;
      this.sharedNoiseBuffer = this._generateSharedNoiseBuffer(3.0);
    }

    /**
     * Generates a loopable high-quality white/pink procedural noise buffer.
     * @private
     */
    _generateSharedNoiseBuffer(durationSeconds = 3.0) {
      const sampleRate = this.ctx.sampleRate || 48000;
      const length = Math.floor(sampleRate * durationSeconds);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      // Pink noise using 3-pole filter
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        const pink = b0 + b1 + b2 + white * 0.5362;
        data[i] = pink * 0.18;
      }
      return buffer;
    }

    /**
     * Triggers a procedural footstep sound (wood, gravel, or dirt).
     *
     * @param {Object} params
     * @param {string} [params.surface='wood'] - 'wood' | 'gravel' | 'dirt'
     * @param {number} [params.velocity=0.8] - 0.0 to 1.0
     * @param {number} [params.pan=0.0] - -1.0 to 1.0
     * @param {number} [params.time] - AudioContext timestamp
     */
    triggerFootstep(params = {}) {
      const surface = params.surface || 'wood';
      const velocity = params.velocity !== undefined ? clamp(params.velocity, 0.1, 1.0) : 0.8;
      const pan = params.pan !== undefined ? clamp(params.pan, -1.0, 1.0) : 0.0;
      const startTime = params.time !== undefined ? params.time : (this.ctx.currentTime || 0);

      let panner;
      if (typeof this.ctx.createStereoPanner === 'function') {
        panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
      } else {
        panner = this.ctx.createGain();
      }
      panner.connect(this.destination);

      if (surface === 'wood') {
        // Wood footstep: low thud + hollow clack (cluster of 2-3 short micro-grains)
        const grainCount = 3;
        for (let g = 0; g < grainCount; g++) {
          const grainTime = startTime + g * 0.012;
          const dur = 0.045 - g * 0.008;

          const src = this.ctx.createBufferSource();
          src.buffer = this.sharedNoiseBuffer;
          src.playbackRate.value = 0.85 + Math.random() * 0.3;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(450 + g * 220, grainTime);
          filter.Q.value = 3.5;

          const gain = this.ctx.createGain();
          const gVol = (velocity * 0.4) / (g + 1);
          gain.gain.setValueAtTime(0.0001, grainTime);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gVol), grainTime + 0.004);
          gain.gain.exponentialRampToValueAtTime(0.0001, grainTime + dur);

          src.connect(filter);
          filter.connect(gain);
          gain.connect(panner);

          src.start(grainTime, Math.random() * 2.0);
          src.stop(grainTime + dur + 0.02);
        }
      } else if (surface === 'gravel') {
        // Gravel: dense cluster of 12-20 high-frequency stochastic micro-particles
        const numParticles = 14;
        for (let i = 0; i < numParticles; i++) {
          const particleTime = startTime + Math.random() * 0.09;
          const particleDur = 0.015 + Math.random() * 0.025;

          const src = this.ctx.createBufferSource();
          src.buffer = this.sharedNoiseBuffer;
          src.playbackRate.value = 1.2 + Math.random() * 0.9;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1800 + Math.random() * 3200, particleTime);
          filter.Q.value = 4.0 + Math.random() * 4.0;

          const gain = this.ctx.createGain();
          const pVol = (velocity * 0.12) * (1.0 - (particleTime - startTime) / 0.12);
          gain.gain.setValueAtTime(0.0001, particleTime);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, pVol), particleTime + 0.002);
          gain.gain.exponentialRampToValueAtTime(0.0001, particleTime + particleDur);

          src.connect(filter);
          filter.connect(gain);
          gain.connect(panner);

          src.start(particleTime, Math.random() * 2.0);
          src.stop(particleTime + particleDur + 0.01);
        }
      } else {
        // Dirt: low damped rumble + muted scrub
        const dur = 0.14;
        const src = this.ctx.createBufferSource();
        src.buffer = this.sharedNoiseBuffer;
        src.playbackRate.value = 0.6;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(260, startTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, velocity * 0.5), startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(panner);

        src.start(startTime, Math.random() * 2.0);
        src.stop(startTime + dur + 0.02);
      }
    }

    /**
     * Triggers an aerodynamic whoosh / swish sound synchronized to visual motion passes.
     * Sweeps a resonant bandpass filter across frequencies with directional stereo motion.
     *
     * @param {Object} params
     * @param {number} [params.duration=0.45]
     * @param {number} [params.startFreq=200]
     * @param {number} [params.peakFreq=2200]
     * @param {number} [params.endFreq=320]
     * @param {number} [params.velocity=0.8]
     * @param {number} [params.panStart=-0.7]
     * @param {number} [params.panEnd=0.7]
     * @param {number} [params.time]
     */
    triggerWhoosh(params = {}) {
      const dur = params.duration || 0.45;
      const startFreq = params.startFreq || 220;
      const peakFreq = params.peakFreq || 2400;
      const endFreq = params.endFreq || 350;
      const velocity = params.velocity !== undefined ? clamp(params.velocity, 0.1, 1.0) : 0.8;
      const panStart = params.panStart !== undefined ? clamp(params.panStart, -1.0, 1.0) : -0.6;
      const panEnd = params.panEnd !== undefined ? clamp(params.panEnd, -1.0, 1.0) : 0.6;
      const startTime = params.time !== undefined ? params.time : (this.ctx.currentTime || 0);

      let panner;
      if (typeof this.ctx.createStereoPanner === 'function') {
        panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(panStart, startTime);
        panner.pan.linearRampToValueAtTime(panEnd, startTime + dur);
      } else {
        panner = this.ctx.createGain();
      }
      panner.connect(this.destination);

      const src = this.ctx.createBufferSource();
      src.buffer = this.sharedNoiseBuffer;
      src.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 2.8;

      const midTime = startTime + dur * 0.45;
      filter.frequency.setValueAtTime(startFreq, startTime);
      filter.frequency.exponentialRampToValueAtTime(peakFreq, midTime);
      filter.frequency.exponentialRampToValueAtTime(endFreq, startTime + dur);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, velocity * 0.45), midTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(panner);

      src.start(startTime, Math.random() * 2.0);
      src.stop(startTime + dur + 0.05);
    }

    /**
     * Triggers a cloth/friction texture sweep (e.g. fabric movement, sword draw, rubbing).
     *
     * @param {Object} params
     * @param {number} [params.duration=0.35]
     * @param {number} [params.intensity=0.5]
     * @param {number} [params.pan=0.0]
     * @param {number} [params.time]
     */
    triggerFriction(params = {}) {
      const dur = params.duration || 0.35;
      const intensity = params.intensity !== undefined ? clamp(params.intensity, 0.1, 1.0) : 0.5;
      const pan = params.pan !== undefined ? clamp(params.pan, -1.0, 1.0) : 0.0;
      const startTime = params.time !== undefined ? params.time : (this.ctx.currentTime || 0);

      let panner;
      if (typeof this.ctx.createStereoPanner === 'function') {
        panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
      } else {
        panner = this.ctx.createGain();
      }
      panner.connect(this.destination);

      const src = this.ctx.createBufferSource();
      src.buffer = this.sharedNoiseBuffer;
      src.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, startTime);
      filter.frequency.linearRampToValueAtTime(2600, startTime + dur * 0.5);
      filter.frequency.linearRampToValueAtTime(900, startTime + dur);
      filter.Q.value = 1.8;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(intensity * 0.22, startTime + dur * 0.3);
      gain.gain.linearRampToValueAtTime(0.0001, startTime + dur);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(panner);

      src.start(startTime, Math.random() * 2.0);
      src.stop(startTime + dur + 0.03);
    }
  }

  // =========================================================================
  // 7. SUBTRACTIVE SCORE DRONE ENGINE (DroneEngine)
  // =========================================================================

  /**
   * Subtractive Score Drone Engine:
   *  - Polyphonic detuned saw oscillators (unison detune ±7-12 cents) for a rich, warm cinematic bed.
   *  - 24dB resonant lowpass ladder filter (cascaded dual 12dB biquads).
   *  - Automated cutoff frequency driven by visual divergence:
   *      Positive divergence (zoom in / explosion) -> opens filter cutoff, swells drone crescendo.
   *      Negative divergence (pull out / receding) -> drops cutoff to sub-bass, elongates ambient reverb.
   *  - Harmonic chord progression / scale mode mapping:
   *      dorian, aeolian, phrygian, lydian, minor_pentatonic, cinematic_dark.
   */
  class DroneEngine {
    /**
     * @param {BaseAudioContext} audioCtx
     * @param {AudioNode} destinationNode
     */
    constructor(audioCtx, destinationNode) {
      this.ctx = audioCtx;
      this.destination = destinationNode;

      this.keyRoot = 'D';
      this.scaleMode = 'dorian';
      this.baseCutoff = 350; // Hz
      this.currentCutoff = 350;

      // Master drone voice gain
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.setValueAtTime(0.0001, this.ctx.currentTime || 0);

      // Cascaded 24dB/oct resonant ladder lowpass filter
      this.filter1 = this.ctx.createBiquadFilter();
      this.filter1.type = 'lowpass';
      this.filter1.frequency.setValueAtTime(this.baseCutoff, this.ctx.currentTime || 0);
      this.filter1.Q.setValueAtTime(2.2, this.ctx.currentTime || 0);

      this.filter2 = this.ctx.createBiquadFilter();
      this.filter2.type = 'lowpass';
      this.filter2.frequency.setValueAtTime(this.baseCutoff, this.ctx.currentTime || 0);
      this.filter2.Q.setValueAtTime(2.2, this.ctx.currentTime || 0);

      this.droneGain.connect(this.filter1);
      this.filter1.connect(this.filter2);
      this.filter2.connect(this.destination);

      // Active voice bank
      this.voices = [];
      this.isPlaying = false;
    }

    /**
     * Sets the root note and scale mode for harmonic chord voicing.
     * @param {string} root - e.g. 'C', 'D', 'F#'
     * @param {string} mode - 'dorian' | 'aeolian' | 'phrygian' | 'lydian' | 'minor_pentatonic' | 'cinematic_dark'
     */
    setScale(root = 'D', mode = 'dorian') {
      this.keyRoot = root;
      this.scaleMode = SCALE_MODES[mode] ? mode : 'dorian';
    }

    /**
     * Generates a cinematic chord voice set (in Hz) based on root and scale mode.
     * Builds a root + 5th + octave + 3rd/9th voicing.
     * @returns {number[]} Array of frequencies in Hz
     */
    computeChordFrequencies() {
      const scaleIntervals = SCALE_MODES[this.scaleMode] || SCALE_MODES.dorian;
      const rootFreq = noteToFrequency(this.keyRoot, 2); // Base octave 2

      // Degree 1 (Root), Degree 5 (Fifth), Degree 8 (Octave), Degree 3/9 (Tension)
      const degree1 = rootFreq;
      const fifthInterval = scaleIntervals[4] !== undefined ? scaleIntervals[4] : 7;
      const degree5 = rootFreq * Math.pow(2, fifthInterval / 12);
      const degree8 = rootFreq * 2.0;

      const thirdInterval = scaleIntervals[2] !== undefined ? scaleIntervals[2] : 3;
      const degree10 = (rootFreq * 2.0) * Math.pow(2, thirdInterval / 12); // Tenth (Octave + 3rd)

      return [degree1, degree5, degree8, degree10];
    }

    /**
     * Starts polyphonic drone playback with detuned saw oscillator pairs.
     * @param {number} [startTime]
     * @param {number} [fadeInDuration=1.5]
     */
    start(startTime, fadeInDuration = 1.5) {
      if (this.isPlaying) return;
      const now = startTime !== undefined ? startTime : (this.ctx.currentTime || 0);

      this.stop(); // Clean previous if any

      const chordFrequencies = this.computeChordFrequencies();
      this.voices = [];

      chordFrequencies.forEach((freq, chordIndex) => {
        // 3 unison detuned saw oscillators per chord note: -9 cents, 0 cents, +9 cents
        const detunes = [-10, 0, 10];
        const voiceGain = this.ctx.createGain();
        const baseAmp = (0.28 / chordFrequencies.length);
        voiceGain.gain.setValueAtTime(baseAmp, now);
        voiceGain.connect(this.droneGain);

        const oscs = detunes.map(detuneCents => {
          const osc = this.ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now);
          osc.detune.setValueAtTime(detuneCents, now);
          osc.connect(voiceGain);
          osc.start(now);
          return osc;
        });

        this.voices.push({ oscs, voiceGain, freq });
      });

      // Smooth fade in
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setValueAtTime(0.0001, now);
      this.droneGain.gain.linearRampToValueAtTime(0.40, now + fadeInDuration);

      this.isPlaying = true;
    }

    /**
     * Stops drone playback with smooth release.
     * @param {number} [stopTime]
     * @param {number} [fadeOutDuration=1.2]
     */
    stop(stopTime, fadeOutDuration = 1.2) {
      if (!this.isPlaying && this.voices.length === 0) return;
      const now = stopTime !== undefined ? stopTime : (this.ctx.currentTime || 0);

      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
      this.droneGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutDuration);

      const activeVoices = this.voices;
      this.voices = [];
      this.isPlaying = false;

      setTimeout(() => {
        activeVoices.forEach(v => {
          v.oscs.forEach(osc => {
            try { osc.stop(); osc.disconnect(); } catch (e) { }
          });
          try { v.voiceGain.disconnect(); } catch (e) { }
        });
      }, (fadeOutDuration + 0.1) * 1000);
    }

    /**
     * Automated filter cutoff and volume modulation driven by visual divergence.
     *
     * @param {number} divergence - Visual expansion / contraction value (e.g. -2.0 to +2.0)
     * @param {number} [when] - AudioContext timestamp
     * @param {number} [transitionTime=0.08] - Smooth smoothing time constant
     */
    applyDivergenceAutomation(divergence, when, transitionTime = 0.08) {
      const now = when !== undefined ? when : (this.ctx.currentTime || 0);
      const clampedDivergence = clamp(divergence, -2.5, 2.5);

      // Positive divergence (zoom in / expansion) -> opens filter cutoff up to 4500Hz
      // Negative divergence (pull out) -> drops cutoff down to 140Hz deep sub
      let targetCutoff = this.baseCutoff;
      let targetGain = 0.40;

      if (clampedDivergence > 0) {
        // Exponential opening
        targetCutoff = this.baseCutoff + Math.pow(clampedDivergence, 1.4) * 1800;
        targetGain = 0.40 + clampedDivergence * 0.12; // Swell crescendo
      } else {
        // Drop down to deep bass
        targetCutoff = Math.max(120, this.baseCutoff + clampedDivergence * 90);
        targetGain = Math.max(0.20, 0.40 + clampedDivergence * 0.08);
      }

      targetCutoff = clamp(targetCutoff, 100, 7000);
      targetGain = clamp(targetGain, 0.05, 0.85);

      this.currentCutoff = targetCutoff;

      this.filter1.frequency.cancelScheduledValues(now);
      this.filter1.frequency.setValueAtTime(this.filter1.frequency.value, now);
      this.filter1.frequency.exponentialRampToValueAtTime(targetCutoff, now + transitionTime);

      this.filter2.frequency.cancelScheduledValues(now);
      this.filter2.frequency.setValueAtTime(this.filter2.frequency.value, now);
      this.filter2.frequency.exponentialRampToValueAtTime(targetCutoff, now + transitionTime);

      if (this.isPlaying) {
        this.droneGain.gain.cancelScheduledValues(now);
        this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
        this.droneGain.gain.linearRampToValueAtTime(targetGain, now + transitionTime);
      }
    }
  }

  // =========================================================================
  // 8. MOTION PULSE ENGINE (MotionPulseEngine)
  // =========================================================================

  /**
   * Synthesizes rhythmic pulses and sub-bass kinetic transients
   * keyed to visual kinetic energy peaks and motion momentum.
   */
  class MotionPulseEngine {
    /**
     * @param {BaseAudioContext} audioCtx
     * @param {AudioNode} destinationNode
     */
    constructor(audioCtx, destinationNode) {
      this.ctx = audioCtx;
      this.destination = destinationNode;
    }

    /**
     * Triggers a kinetic motion pulse.
     *
     * @param {Object} params
     * @param {number} [params.energy=0.5] - Visual energy (0.0 to 1.0)
     * @param {number} [params.baseFreq=110] - Base frequency in Hz
     * @param {number} [params.pan=0.0] - Stereo pan
     * @param {number} [params.time] - AudioContext timestamp
     */
    triggerPulse(params = {}) {
      const energy = params.energy !== undefined ? clamp(params.energy, 0.1, 1.0) : 0.5;
      const baseFreq = params.baseFreq || 120;
      const pan = params.pan !== undefined ? clamp(params.pan, -1.0, 1.0) : 0.0;
      const startTime = params.time !== undefined ? params.time : (this.ctx.currentTime || 0);

      let panner;
      if (typeof this.ctx.createStereoPanner === 'function') {
        panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
      } else {
        panner = this.ctx.createGain();
      }
      panner.connect(this.destination);

      const dur = 0.18 + energy * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      // Pitch drop envelope for percussive impact feel
      osc.frequency.setValueAtTime(baseFreq * (1.6 + energy * 0.8), startTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, baseFreq), startTime + dur);

      const peakGain = energy * 0.55;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), startTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

      osc.connect(gain);
      gain.connect(panner);

      osc.start(startTime);
      osc.stop(startTime + dur + 0.03);
    }
  }

  // =========================================================================
  // 9. ZERO-JITTER DUAL-TIMER LOOKAHEAD SCHEDULER (LookaheadScheduler)
  // =========================================================================

  /**
   * Dual-Timer Lookahead Scheduler:
   * Replaces jittery requestAnimationFrame / setInterval audio polling (which has 16-40ms thread jitter).
   *
   * Dual-timer architecture:
   *  - Timer 1: JavaScript 25ms setInterval lookahead loop.
   *  - Timer 2: Native Web Audio hardware clock (AudioContext.currentTime).
   *  - Lookahead window: 100ms (0.100s).
   *  - Schedules audio events directly onto AudioContext.currentTime with microsecond precision:
   *    delta-t < 0.1ms.
   *  - Tracks scheduled cues to prevent duplicate triggers.
   *  - Flawlessly handles video scrubbing, seeking, looping, and pause/resume.
   */
  class LookaheadScheduler {
    /**
     * @param {Object} options
     * @param {BaseAudioContext} options.audioCtx
     * @param {Function} options.onTriggerCue - Callback(cue, targetAudioTime)
     * @param {Function} [options.onAutomationTick] - Callback(videoTime, targetAudioTime)
     * @param {number} [options.intervalMs=25] - JavaScript timer tick interval in ms (default 25ms)
     * @param {number} [options.lookaheadSec=0.100] - Lookahead window in seconds (default 100ms)
     */
    constructor(options = {}) {
      this.ctx = options.audioCtx;
      this.onTriggerCue = options.onTriggerCue || (() => { });
      this.onAutomationTick = options.onAutomationTick || (() => { });

      this.intervalMs = options.intervalMs || 25;
      this.lookaheadSec = options.lookaheadSec || 0.100;

      this.cues = [];
      this.scheduledCueIds = new Set();
      this.timerId = null;

      this.isPlaying = false;
      this.audioBaseTime = 0;
      this.videoBaseTime = 0;
      this.playbackRate = 1.0;
      this.lastObservedVideoTime = 0;
    }

    /**
     * Loads or replaces the master cue list.
     * Cues must have a timestamp in milliseconds (timestamp_ms) or seconds (timestamp_s / t).
     * @param {Array<Object>} cues
     */
    setCues(cues = []) {
      this.cues = cues.map((cue, idx) => {
        const timeSec = cue.timestamp_ms !== undefined
          ? cue.timestamp_ms / 1000
          : cue.t !== undefined ? cue.t : (cue.timestamp_s || 0);

        return {
          ...cue,
          _id: cue.id !== undefined ? cue.id : `cue_${idx}_${Math.round(timeSec * 1000)}`,
          _timeSec: timeSec
        };
      });

      // Sort chronologically
      this.cues.sort((a, b) => a._timeSec - b._timeSec);
      this.resetScheduled();
    }

    /**
     * Clears scheduled tracking.
     */
    resetScheduled() {
      this.scheduledCueIds.clear();
    }

    /**
     * Starts or resumes playback tracking locked to the video playhead.
     *
     * @param {number} videoCurrentTime - Active video timestamp in seconds
     * @param {number} [playbackRate=1.0]
     */
    start(videoCurrentTime = 0, playbackRate = 1.0) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.audioBaseTime = this.ctx ? this.ctx.currentTime : 0;
      this.videoBaseTime = videoCurrentTime;
      this.lastObservedVideoTime = videoCurrentTime;
      this.playbackRate = playbackRate || 1.0;
      this.isPlaying = true;

      // Reset scheduled cues that are at or after the current playhead
      this._pruneScheduledCues(videoCurrentTime);

      if (this.timerId) clearInterval(this.timerId);
      this.timerId = setInterval(() => this._tick(), this.intervalMs);

      // Perform initial immediate schedule pass
      this._tick();
    }

    /**
     * Pauses the scheduling loop.
     */
    pause() {
      this.isPlaying = false;
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
    }

    /**
     * Notifies the scheduler that the video playhead has been scrubbed/seeked.
     * Re-anchors the audio clock base to prevent audio burst or sync drift.
     *
     * @param {number} newVideoTime - Timestamp in seconds
     */
    seek(newVideoTime) {
      if (!this.ctx) return;
      this.audioBaseTime = this.ctx.currentTime;
      this.videoBaseTime = newVideoTime;
      this.lastObservedVideoTime = newVideoTime;

      // Clear scheduled cues after this timestamp so they can be rescheduled
      this._pruneScheduledCues(newVideoTime);

      if (this.isPlaying) {
        this._tick();
      }
    }

    /**
     * Updates the video clock tracking reference (e.g. from video 'timeupdate' or loop detection).
     * @param {number} currentVideoTime
     */
    updateVideoTime(currentVideoTime) {
      // Loop detection: video jumped backwards significantly
      if (currentVideoTime < this.lastObservedVideoTime - 0.25) {
        this.seek(currentVideoTime);
      } else {
        // Drift correction: if drift between audio and video clock exceeds 40ms, smoothly resync base
        const expectedVideoTime = this.videoBaseTime + (this.ctx.currentTime - this.audioBaseTime) * this.playbackRate;
        const drift = Math.abs(currentVideoTime - expectedVideoTime);
        if (drift > 0.050) {
          this.audioBaseTime = this.ctx.currentTime;
          this.videoBaseTime = currentVideoTime;
        }
      }
      this.lastObservedVideoTime = currentVideoTime;
    }

    /**
     * Removes cues scheduled after a certain video timestamp so scrubbing allows replay.
     * @private
     */
    _pruneScheduledCues(fromVideoTime) {
      for (const cue of this.cues) {
        if (cue._timeSec >= fromVideoTime - 0.01) {
          this.scheduledCueIds.delete(cue._id);
        }
      }
    }

    /**
     * Core dual-timer lookahead tick executed every 25ms.
     * Checks all upcoming cues within the [current, current + lookahead] audio window.
     * @private
     */
    _tick() {
      if (!this.isPlaying || !this.ctx) return;

      const currentAudioTime = this.ctx.currentTime;
      const audioWindowEnd = currentAudioTime + this.lookaheadSec;

      // 1. Fire automation hook for continuous stem updates
      const currentVideoTime = this.videoBaseTime + (currentAudioTime - this.audioBaseTime) * this.playbackRate;
      this.onAutomationTick(currentVideoTime, currentAudioTime);

      // 2. Schedule upcoming discrete cues directly onto Web Audio timeline
      for (let i = 0; i < this.cues.length; i++) {
        const cue = this.cues[i];
        if (this.scheduledCueIds.has(cue._id)) continue;

        // Calculate exact target AudioContext timestamp
        const timeDeltaInVideo = cue._timeSec - this.videoBaseTime;
        const targetAudioTime = this.audioBaseTime + (timeDeltaInVideo / this.playbackRate);

        // If cue is already in the past by more than 80ms, drop it to avoid late audio artifacts
        if (targetAudioTime < currentAudioTime - 0.08) {
          this.scheduledCueIds.add(cue._id);
          continue;
        }

        // If cue falls within the lookahead window [currentAudioTime, currentAudioTime + lookahead]
        if (targetAudioTime >= currentAudioTime - 0.005 && targetAudioTime <= audioWindowEnd) {
          this.scheduledCueIds.add(cue._id);
          // Sub-millisecond precise Web Audio schedule trigger
          this.onTriggerCue(cue, targetAudioTime);
        } else if (targetAudioTime > audioWindowEnd) {
          // Since cues are sorted chronologically, we can break early
          break;
        }
      }
    }
  }

  // =========================================================================
  // 10. LOSSLESS 24-BIT 48KHZ WAV EXPORTER (WavExporter)
  // =========================================================================

  /**
   * Encodes standard Web Audio Float32 AudioBuffer data into a pristine,
   * uncompressed 24-bit 48kHz stereo WAV container.
   */
  const WavExporter = {
    /**
     * Encodes an AudioBuffer into a 24-bit PCM WAV ArrayBuffer.
     *
     * @param {AudioBuffer} audioBuffer
     * @returns {ArrayBuffer}
     */
    encodeAudioBufferToWav24(audioBuffer) {
      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const length = audioBuffer.length;
      const bytesPerSample = 3; // 24-bit
      const blockAlign = numChannels * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = length * blockAlign;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      // Helper to write ASCII strings
      const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };

      // RIFF Chunk Descriptor
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true); // ChunkSize
      writeString(8, 'WAVE');

      // 'fmt ' Sub-chunk
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);          // Subchunk1Size (16 for PCM)
      view.setUint16(20, 1, true);           // AudioFormat (1 = PCM)
      view.setUint16(22, numChannels, true); // NumChannels
      view.setUint32(24, sampleRate, true);  // SampleRate
      view.setUint32(28, byteRate, true);    // ByteRate
      view.setUint16(32, blockAlign, true);  // BlockAlign
      view.setUint16(34, 24, true);          // BitsPerSample (24-bit)

      // 'data' Sub-chunk
      writeString(36, 'data');
      view.setUint32(40, dataSize, true);

      // Interleave and pack 24-bit signed samples (-8388608 to 8388607)
      const channelData = [];
      for (let ch = 0; ch < numChannels; ch++) {
        channelData.push(audioBuffer.getChannelData(ch));
      }

      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const sample = clamp(channelData[ch][i], -1.0, 1.0);
          // Scale to 24-bit signed int range [-8388608, 8388607]
          const int24 = sample < 0
            ? Math.round(sample * 8388608)
            : Math.round(sample * 8388607);
          const clamped = clamp(int24, -8388608, 8388607);

          // Little-endian 3-byte packing
          view.setUint8(offset, clamped & 0xFF);
          view.setUint8(offset + 1, (clamped >> 8) & 0xFF);
          view.setUint8(offset + 2, (clamped >> 16) & 0xFF);
          offset += 3;
        }
      }

      return buffer;
    },

    /**
     * Converts AudioBuffer into an exportable WAV Blob.
     * @param {AudioBuffer} audioBuffer
     * @returns {Blob}
     */
    toBlob(audioBuffer) {
      const arrayBuf = this.encodeAudioBufferToWav24(audioBuffer);
      if (typeof Blob !== 'undefined') {
        return new Blob([arrayBuf], { type: 'audio/wav' });
      }
      return arrayBuf;
    },

    /**
     * Triggers a browser download of the 24-bit WAV file.
     * @param {AudioBuffer} audioBuffer
     * @param {string} [filename='sonicframe_master_24bit_48k.wav']
     */
    downloadWav(audioBuffer, filename = 'sonicframe_master_24bit_48k.wav') {
      const blob = this.toBlob(audioBuffer);
      if (typeof window !== 'undefined' && window.URL && document.createElement) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 1500);
      }
      return blob;
    }
  };

  // =========================================================================
  // 11. HIGH-LEVEL SONICFRAME AUDIO ENGINE (SonicFrameAudioEngine)
  // =========================================================================

  /**
   * The complete unified SONICFRAME DSP Engine.
   * Integrates the 5-channel mixer, modal synthesizer, granular synthesizer,
   * subtractive drone engine, motion pulse engine, lookahead scheduler,
   * and offline rendering export pipeline.
   */
  class SonicFrameAudioEngine {
    constructor(options = {}) {
      this.ctx = null;
      this.mixer = null;
      this.modalSynth = null;
      this.granularSynth = null;
      this.droneEngine = null;
      this.pulseEngine = null;
      this.scheduler = null;

      this.currentCueSheet = null;
      this.telemetryAutomations = [];
      this.isInitialized = false;
      this.options = options;
    }

    /**
     * Initializes the Web Audio DSP Graph with the given AudioContext.
     * @param {BaseAudioContext} [audioContext]
     */
    init(audioContext) {
      if (this.isInitialized && this.ctx) return;

      if (audioContext) {
        this.ctx = audioContext;
      } else if (typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass({ sampleRate: 48000 });
        }
      }

      if (!this.ctx) {
        throw new Error('Web Audio API is not supported in this environment.');
      }

      // 1. Build 5-Channel Parametric Stem Mixer
      this.mixer = new StemMixer(this.ctx, this.options);
      if (this.ctx.destination) {
        this.mixer.connect(this.ctx.destination);
      }

      // 2. Instantiate Procedural Synths connected to discrete stems
      this.modalSynth = new ModalSynthesizer(this.ctx, this.mixer.getInput('foleyImpact'));
      this.granularSynth = new GranularSynthesizer(this.ctx, this.mixer.getInput('textureShimmer'));
      this.droneEngine = new DroneEngine(this.ctx, this.mixer.getInput('atmosphere'));
      this.pulseEngine = new MotionPulseEngine(this.ctx, this.mixer.getInput('motionPulse'));

      // 3. Initialize Zero-Jitter Lookahead Scheduler
      this.scheduler = new LookaheadScheduler({
        audioCtx: this.ctx,
        intervalMs: 25,
        lookaheadSec: 0.100,
        onTriggerCue: (cue, scheduledAudioTime) => this._dispatchCue(cue, scheduledAudioTime),
        onAutomationTick: (videoTime, audioTime) => this._dispatchAutomation(videoTime, audioTime)
      });

      this.isInitialized = true;
    }

    /**
     * Loads a structured SonicFrameCueSheet JSON.
     *
     * @param {Object} cueSheet
     * @param {Object} [cueSheet.composition_profile]
     * @param {Array} [cueSheet.foley_events]
     * @param {Object} [cueSheet.stem_automations]
     */
    loadCueSheet(cueSheet) {
      if (!this.isInitialized) this.init();
      this.currentCueSheet = cueSheet;

      // Configure drone engine harmonic scale & root key
      if (cueSheet && cueSheet.composition_profile) {
        const profile = cueSheet.composition_profile;
        if (profile.key_root || profile.scale_mode) {
          this.droneEngine.setScale(profile.key_root || 'D', profile.scale_mode || 'dorian');
        }
      }

      // Load foley and score cues into lookahead scheduler
      const foleyEvents = (cueSheet && cueSheet.foley_events) ? cueSheet.foley_events : [];
      this.scheduler.setCues(foleyEvents);

      // Store stem automations
      if (cueSheet && cueSheet.stem_automations) {
        this.telemetryAutomations = cueSheet.stem_automations;
      }
    }

    /**
     * Starts synchronized playback locked to video timestamp.
     * @param {number} [videoTime=0]
     * @param {number} [playbackRate=1.0]
     */
    startPlayback(videoTime = 0, playbackRate = 1.0) {
      if (!this.isInitialized) this.init();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.scheduler.start(videoTime, playbackRate);
      this.droneEngine.start(this.ctx.currentTime, 1.2);
    }

    /**
     * Pauses playback.
     */
    pausePlayback() {
      if (this.scheduler) this.scheduler.pause();
      if (this.droneEngine) this.droneEngine.stop(this.ctx ? this.ctx.currentTime : 0, 0.4);
    }

    /**
     * Seeks playback to a new video timestamp.
     * @param {number} newVideoTime
     */
    seekPlayback(newVideoTime) {
      if (this.scheduler) this.scheduler.seek(newVideoTime);
    }

    /**
     * Continuously informs engine of video time update.
     * @param {number} currentVideoTime
     */
    updateVideoTime(currentVideoTime) {
      if (this.scheduler) this.scheduler.updateVideoTime(currentVideoTime);
    }

    /**
     * Updates real-time telemetry frame (from optical flow worker).
     * Modulates divergence filter cutoff and kinetic energy pulse.
     *
     * @param {Object} telemetryFrame
     * @param {number} [telemetryFrame.divergence=0]
     * @param {number} [telemetryFrame.kineticEnergy=0]
     * @param {number} [telemetryFrame.centroidX=0]
     */
    updateTelemetry(telemetryFrame = {}) {
      if (!this.isInitialized || !this.ctx) return;
      const now = this.ctx.currentTime;

      if (telemetryFrame.divergence !== undefined) {
        this.droneEngine.applyDivergenceAutomation(telemetryFrame.divergence, now);
      }
      if (telemetryFrame.centroidX !== undefined) {
        this.mixer.setPan('foleyImpact', telemetryFrame.centroidX, now);
      }
    }

    /**
     * Dispatches a scheduled foley/score cue to the proper DSP synthesizer.
     * @private
     */
    _dispatchCue(cue, scheduledAudioTime) {
      const category = cue.category || 'impact_heavy';
      const patchType = cue.patch_type || 'modal_resonator';
      const velocity = cue.velocity !== undefined ? cue.velocity : 0.8;
      const pan = cue.pan !== undefined ? cue.pan : 0.0;
      const params = cue.parameters || {};

      if (patchType === 'modal_resonator' || category.startsWith('impact')) {
        let material = 'metal';
        if (category === 'impact_heavy') material = 'earth';
        else if (category === 'impact_metallic') material = 'metal';
        else if (category.includes('glass')) material = 'glass';
        else if (category.includes('wood')) material = 'wood';

        this.modalSynth.triggerImpact({
          material,
          fundamental: params.fundamental_freq,
          damping: params.decay_seconds ? (1.5 / params.decay_seconds) : undefined,
          brightness: params.brightness,
          velocity,
          pan,
          time: scheduledAudioTime
        });
      } else if (category.startsWith('footstep')) {
        const surface = category.includes('wood') ? 'wood' : category.includes('gravel') ? 'gravel' : 'dirt';
        this.granularSynth.triggerFootstep({
          surface,
          velocity,
          pan,
          time: scheduledAudioTime
        });
      } else if (category === 'whoosh_pass') {
        this.granularSynth.triggerWhoosh({
          duration: params.decay_seconds || 0.45,
          velocity,
          panStart: pan - 0.4,
          panEnd: pan + 0.4,
          time: scheduledAudioTime
        });
      } else if (category === 'ambient_glitch' || patchType === 'filtered_noise_burst') {
        this.granularSynth.triggerFriction({
          duration: params.decay_seconds || 0.35,
          intensity: velocity,
          pan,
          time: scheduledAudioTime
        });
      } else if (category === 'movement_pulse') {
        this.pulseEngine.triggerPulse({
          energy: velocity,
          baseFreq: params.fundamental_freq || 110,
          pan,
          time: scheduledAudioTime
        });
      }
    }

    /**
     * Continuous automation tick from lookahead scheduler.
     * Evaluates continuous envelope curves for atmosphere cutoff and drone density.
     * @private
     */
    _dispatchAutomation(videoTime, audioTime) {
      if (!this.telemetryAutomations) return;
      const timeMs = videoTime * 1000;

      // Atmosphere cutoff automation points
      if (Array.isArray(this.telemetryAutomations.atmosphere_cutoff)) {
        const points = this.telemetryAutomations.atmosphere_cutoff;
        for (let i = 0; i < points.length - 1; i++) {
          if (timeMs >= points[i].timestamp_ms && timeMs <= points[i + 1].timestamp_ms) {
            const frac = (timeMs - points[i].timestamp_ms) / (points[i + 1].timestamp_ms - points[i].timestamp_ms);
            const hz = points[i].value_hz + frac * (points[i + 1].value_hz - points[i].value_hz);
            this.droneEngine.applyDivergenceAutomation((hz - 400) / 400, audioTime);
            break;
          }
        }
      }
    }

    /**
     * Lossless Master Export Pipeline:
     * Renders the complete multi-track composition into an OfflineAudioContext
     * and exports a 24-bit 48,000 Hz Stereo WAV buffer.
     *
     * @param {Object} cueSheet
     * @param {number} durationSeconds
     * @param {Object} [options]
     * @returns {Promise<{ audioBuffer: AudioBuffer, wavArrayBuffer: ArrayBuffer, blob: Blob }>}
     */
    async renderOffline(cueSheet, durationSeconds = 15.0, options = {}) {
      const OfflineCtxClass = (typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext))
        ? (window.OfflineAudioContext || window.webkitOfflineAudioContext)
        : global.OfflineAudioContext;

      if (!OfflineCtxClass) {
        throw new Error('OfflineAudioContext is not supported in this runtime.');
      }

      const sampleRate = options.sampleRate || 48000;
      const numFrames = Math.ceil(durationSeconds * sampleRate);
      const offlineCtx = new OfflineCtxClass(2, numFrames, sampleRate);

      // Build offline DSP graph
      const offlineMixer = new StemMixer(offlineCtx, {
        masterVolume: options.masterVolume !== undefined ? options.masterVolume : 0.88,
        ...options
      });
      offlineMixer.connect(offlineCtx.destination);

      const offlineModal = new ModalSynthesizer(offlineCtx, offlineMixer.getInput('foleyImpact'));
      const offlineGranular = new GranularSynthesizer(offlineCtx, offlineMixer.getInput('textureShimmer'));
      const offlineDrone = new DroneEngine(offlineCtx, offlineMixer.getInput('atmosphere'));
      const offlinePulse = new MotionPulseEngine(offlineCtx, offlineMixer.getInput('motionPulse'));

      // Configure drone score
      if (cueSheet && cueSheet.composition_profile) {
        offlineDrone.setScale(
          cueSheet.composition_profile.key_root || 'D',
          cueSheet.composition_profile.scale_mode || 'dorian'
        );
      }
      offlineDrone.start(0, 0.8);

      // Schedule all foley events on the exact offline timeline
      const foleyEvents = (cueSheet && cueSheet.foley_events) ? cueSheet.foley_events : [];
      for (const cue of foleyEvents) {
        const timeSec = cue.timestamp_ms !== undefined
          ? cue.timestamp_ms / 1000
          : (cue.t || cue.timestamp_s || 0);

        if (timeSec >= 0 && timeSec <= durationSeconds) {
          const category = cue.category || 'impact_heavy';
          const patchType = cue.patch_type || 'modal_resonator';
          const velocity = cue.velocity !== undefined ? cue.velocity : 0.8;
          const pan = cue.pan !== undefined ? cue.pan : 0.0;
          const params = cue.parameters || {};

          if (patchType === 'modal_resonator' || category.startsWith('impact')) {
            let material = 'metal';
            if (category === 'impact_heavy') material = 'earth';
            else if (category === 'impact_metallic') material = 'metal';
            else if (category.includes('glass')) material = 'glass';
            else if (category.includes('wood')) material = 'wood';

            offlineModal.triggerImpact({
              material,
              fundamental: params.fundamental_freq,
              damping: params.decay_seconds ? (1.5 / params.decay_seconds) : undefined,
              brightness: params.brightness,
              velocity,
              pan,
              time: timeSec
            });
          } else if (category.startsWith('footstep')) {
            const surface = category.includes('wood') ? 'wood' : category.includes('gravel') ? 'gravel' : 'dirt';
            offlineGranular.triggerFootstep({ surface, velocity, pan, time: timeSec });
          } else if (category === 'whoosh_pass') {
            offlineGranular.triggerWhoosh({
              duration: params.decay_seconds || 0.45,
              velocity,
              panStart: pan - 0.4,
              panEnd: pan + 0.4,
              time: timeSec
            });
          } else if (category === 'movement_pulse') {
            offlinePulse.triggerPulse({ energy: velocity, baseFreq: params.fundamental_freq, pan, time: timeSec });
          }
        }
      }

      // Smooth drone stop near the end
      offlineDrone.stop(Math.max(0, durationSeconds - 1.2), 1.0);

      // Render offline buffer
      const renderedBuffer = await offlineCtx.startRendering();

      // Encode into pristine 24-bit 48kHz WAV
      const wavArrayBuffer = WavExporter.encodeAudioBufferToWav24(renderedBuffer);
      const blob = WavExporter.toBlob(renderedBuffer);

      return {
        audioBuffer: renderedBuffer,
        wavArrayBuffer,
        blob
      };
    }
  }

  // =========================================================================
  // 12. EXPORTS & GLOBAL NAMESPACE ATTACHMENT
  // =========================================================================

  const SonicFrameDSP = {
    MATERIAL_MODES,
    SCALE_MODES,
    NOTE_TO_SEMITONE,
    noteToFrequency,
    createImpulseResponse,
    createSoftLimiterCurve,
    StemMixer,
    ModalSynthesizer,
    GranularSynthesizer,
    DroneEngine,
    MotionPulseEngine,
    LookaheadScheduler,
    WavExporter,
    AudioEngine: SonicFrameAudioEngine
  };

  // Attach to window for browser environments
  if (typeof window !== 'undefined') {
    window.SonicFrameDSP = SonicFrameDSP;
  }

  // Attach to global for web workers or Node environments
  if (typeof globalThis !== 'undefined') {
    globalThis.SonicFrameDSP = SonicFrameDSP;
  }

  return SonicFrameDSP;
})();

export default SonicFrameDSP;
export const {
  MATERIAL_MODES,
  SCALE_MODES,
  NOTE_TO_SEMITONE,
  noteToFrequency,
  createImpulseResponse,
  createSoftLimiterCurve,
  StemMixer,
  ModalSynthesizer,
  GranularSynthesizer,
  DroneEngine,
  MotionPulseEngine,
  LookaheadScheduler,
  WavExporter,
  AudioEngine
} = SonicFrameDSP;


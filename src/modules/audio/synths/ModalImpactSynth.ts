/**
 * src/modules/audio/synths/ModalImpactSynth.ts
 * Physical Modeling Modal Resonator Engine
 * Implements Section 7.3 & 7.4 of SONICFRAME Enterprise Architecture v4.0
 *
 * Equations:
 * y(t) = sum_{k=1}^M A_k * e^(-d_k * t) * sin(2*pi*f_k*t + phi_k)
 * where f_k = f_0 * r_k, d_k = alpha * Damping * m_k
 */

export interface ModalProfile {
  modes: number[];
  decayMultipliers: number[];
  defaultFundamental: number;
  defaultDamping: number;
  character: string;
}

export const MODAL_PROFILES: Record<string, ModalProfile> = {
  metal: {
    modes: [1.00, 2.76, 5.40, 8.92],
    decayMultipliers: [1.0, 1.4, 2.1, 3.2],
    defaultFundamental: 280,
    defaultDamping: 2.8,
    character: 'Sharp High-Q Resonant Ring',
  },
  wood: {
    modes: [1.00, 1.58, 2.32, 3.12],
    decayMultipliers: [1.0, 1.8, 2.6, 3.8],
    defaultFundamental: 180,
    defaultDamping: 8.5,
    character: 'Warm Fast Decay',
  },
  glass: {
    modes: [1.00, 2.32, 4.15, 6.70],
    decayMultipliers: [1.0, 1.15, 1.35, 1.6],
    defaultFundamental: 620,
    defaultDamping: 1.5,
    character: 'High Crystalline Ring',
  },
  earth: {
    modes: [1.00, 2.15, 3.80],
    decayMultipliers: [1.0, 2.0, 3.2],
    defaultFundamental: 68,
    defaultDamping: 5.0,
    character: 'Heavy Low Pitch Drop',
  },
};

export interface ModalTriggerOptions {
  material?: 'metal' | 'wood' | 'glass' | 'earth' | string;
  fundamental?: number;
  damping?: number;
  brightness?: number;
  velocity?: number;
  pan?: number;
  time?: number;
}

export class ModalImpactSynth {
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  /**
   * Synthesizes a frame-accurate modal strike in real-time WebAudio
   */
  public trigger(destination: AudioNode, options: ModalTriggerOptions = {}): void {
    const matKey = (options.material && MODAL_PROFILES[options.material]) ? options.material : 'metal';
    const profile = MODAL_PROFILES[matKey]!;

    const fundamental = options.fundamental ?? profile.defaultFundamental;
    const damping = options.damping ?? profile.defaultDamping;
    const brightness = Math.max(0.1, Math.min(1.0, options.brightness ?? 0.8));
    const velocity = Math.max(0.1, Math.min(1.0, options.velocity ?? 0.8));
    const pan = Math.max(-1.0, Math.min(1.0, options.pan ?? 0.0));
    const startTime = options.time !== undefined ? options.time : this.ctx.currentTime;

    // Stereo Panner Node
    let panner: StereoPannerNode | null = null;
    let targetNode: AudioNode = destination;

    if ('createStereoPanner' in this.ctx) {
      panner = (this.ctx as AudioContext).createStereoPanner();
      panner.pan.setValueAtTime(pan, startTime);
      panner.connect(destination);
      targetNode = panner;
    }

    // Modal Superposition Oscillators
    profile.modes.forEach((modeRatio, k) => {
      const decayMul = profile.decayMultipliers[k] ?? 1.0;
      const modeGain = k === 0 ? 1.0 : (0.65 / Math.pow(k, 0.7)) * brightness;
      const effectiveDamping = damping * decayMul;
      const decayDuration = Math.max(0.02, 1.2 / effectiveDamping);

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * modeRatio, startTime);

      if (matKey === 'earth' && k === 0) {
        // Sub-bass pitch drop (55Hz -> 28Hz)
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, fundamental * 0.5), startTime + decayDuration);
      }

      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(modeGain * velocity * 0.35, startTime + 0.003); // 3ms transient attack
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + decayDuration);

      osc.connect(gainNode);
      gainNode.connect(targetNode);

      osc.start(startTime);
      osc.stop(startTime + decayDuration + 0.05);
    });

    // Exciter Click Transient
    const clickDuration = 0.012;
    const clickSamples = Math.floor(this.ctx.sampleRate * clickDuration);
    const clickBuffer = this.ctx.createBuffer(1, clickSamples, this.ctx.sampleRate);
    const clickData = clickBuffer.getChannelData(0);

    for (let i = 0; i < clickSamples; i++) {
      const env = 1.0 - (i / clickSamples);
      clickData[i] = (Math.random() * 2 - 1) * env * env;
    }

    const clickSource = this.ctx.createBufferSource();
    clickSource.buffer = clickBuffer;

    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(matKey === 'glass' ? 3500 : fundamental * 2.5, startTime);
    clickFilter.Q.setValueAtTime(3.0, startTime);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(velocity * 0.25, startTime);

    clickSource.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(targetNode);

    clickSource.start(startTime);
    clickSource.stop(startTime + clickDuration);
  }
}

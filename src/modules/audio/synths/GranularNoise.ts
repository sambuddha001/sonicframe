/**
 * src/modules/audio/synths/GranularNoise.ts
 * Procedural Wind, Footsteps, Friction & Whoosh Synthesizer
 * Implements Layer C2 of SONICFRAME Enterprise Architecture v4.0
 */

export interface NoiseTriggerOptions {
  duration?: number;
  filterFreq?: number;
  filterQ?: number;
  gain?: number;
  pan?: number;
  time?: number;
  sweep?: boolean;
}

export class GranularNoiseSynth {
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  public triggerWhoosh(destination: AudioNode, options: NoiseTriggerOptions = {}): void {
    const duration = options.duration ?? 0.45;
    const startTime = options.time !== undefined ? options.time : this.ctx.currentTime;
    const filterFreq = options.filterFreq ?? 900;
    const gainVal = options.gain ?? 0.25;
    const pan = options.pan ?? 0.0;

    // Generate white noise buffer
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq * 0.4, startTime);
    filter.frequency.exponentialRampToValueAtTime(filterFreq * 2.2, startTime + duration * 0.5);
    filter.frequency.exponentialRampToValueAtTime(filterFreq * 0.3, startTime + duration);
    filter.Q.setValueAtTime(options.filterQ ?? 4.0, startTime);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(gainVal, startTime + duration * 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    let panner: StereoPannerNode | null = null;
    let target = destination;

    if ('createStereoPanner' in this.ctx) {
      panner = (this.ctx as AudioContext).createStereoPanner();
      panner.pan.setValueAtTime(pan, startTime);
      panner.connect(destination);
      target = panner;
    }

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(target);

    source.start(startTime);
    source.stop(startTime + duration + 0.02);
  }
}

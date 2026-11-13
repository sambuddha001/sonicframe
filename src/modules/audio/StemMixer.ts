/**
 * src/modules/audio/StemMixer.ts
 * 5-Channel Parametric Stem Mixer (atmosphere, motionPulse, foleyImpact, textureShimmer, master)
 * Implements Section 7.1 of SONICFRAME Enterprise Architecture v4.0
 */

export type StemName = 'atmosphere' | 'motionPulse' | 'foleyImpact' | 'textureShimmer';

export interface StemChannelNodes {
  input: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  panner: StereoPannerNode | null;
  gain: GainNode;
  reverbSend: GainNode;
}

export class StemMixer {
  private ctx: BaseAudioContext;
  public masterSum: GainNode;
  public masterGain: GainNode;
  public limiter: DynamicsCompressorNode;

  public channels: Record<StemName, StemChannelNodes>;
  private channelStates: Record<StemName, { volume: number; muted: boolean; soloed: boolean }>;

  constructor(ctx: BaseAudioContext, masterVol = 0.85) {
    this.ctx = ctx;

    // Master Summing Bus & Compressor Limiter
    this.masterSum = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(masterVol, this.ctx.currentTime);

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
    this.limiter.knee.setValueAtTime(3.0, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(12.0, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(0.12, this.ctx.currentTime);

    this.masterSum.connect(this.limiter);
    this.limiter.connect(this.masterGain);

    const stemNames: StemName[] = ['atmosphere', 'motionPulse', 'foleyImpact', 'textureShimmer'];
    this.channels = {} as Record<StemName, StemChannelNodes>;
    this.channelStates = {
      atmosphere: { volume: 0.30, muted: false, soloed: false },
      motionPulse: { volume: 0.45, muted: false, soloed: false },
      foleyImpact: { volume: 0.70, muted: false, soloed: false },
      textureShimmer: { volume: 0.25, muted: false, soloed: false },
    };

    stemNames.forEach((name) => {
      const input = this.ctx.createGain();

      const eqLow = this.ctx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.setValueAtTime(100, this.ctx.currentTime);

      const eqMid = this.ctx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.setValueAtTime(1000, this.ctx.currentTime);
      eqMid.Q.setValueAtTime(1.0, this.ctx.currentTime);

      const eqHigh = this.ctx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.setValueAtTime(6000, this.ctx.currentTime);

      let panner: StereoPannerNode | null = null;
      if ('createStereoPanner' in this.ctx) {
        panner = (this.ctx as AudioContext).createStereoPanner();
      }

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.channelStates[name].volume, this.ctx.currentTime);

      const reverbSend = this.ctx.createGain();
      reverbSend.gain.setValueAtTime(0.2, this.ctx.currentTime);

      // Connect channel chain
      input.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);

      if (panner) {
        eqHigh.connect(panner);
        panner.connect(gain);
      } else {
        eqHigh.connect(gain);
      }

      gain.connect(this.masterSum);

      this.channels[name] = {
        input,
        eqLow,
        eqMid,
        eqHigh,
        panner,
        gain,
        reverbSend,
      };
    });
  }

  public setVolume(channel: StemName, volume: number): void {
    if (!this.channels[channel]) return;
    this.channelStates[channel].volume = Math.max(0, Math.min(1.5, volume));
    this.updateGain(channel);
  }

  public setMute(channel: StemName, muted: boolean): void {
    if (!this.channels[channel]) return;
    this.channelStates[channel].muted = muted;
    this.updateGain(channel);
  }

  public setSolo(channel: StemName, soloed: boolean): void {
    if (!this.channels[channel]) return;
    this.channelStates[channel].soloed = soloed;

    // Check if any channel is soloed
    const anySolo = Object.values(this.channelStates).some((s) => s.soloed);
    const stemNames: StemName[] = ['atmosphere', 'motionPulse', 'foleyImpact', 'textureShimmer'];

    stemNames.forEach((name) => {
      const state = this.channelStates[name];
      const g = this.channels[name].gain;
      if (anySolo) {
        g.gain.setTargetAtTime(state.soloed && !state.muted ? state.volume : 0.0, this.ctx.currentTime, 0.02);
      } else {
        g.gain.setTargetAtTime(state.muted ? 0.0 : state.volume, this.ctx.currentTime, 0.02);
      }
    });
  }

  private updateGain(channel: StemName): void {
    const anySolo = Object.values(this.channelStates).some((s) => s.soloed);
    const state = this.channelStates[channel];
    const g = this.channels[channel].gain;

    if (anySolo) {
      g.gain.setTargetAtTime(state.soloed && !state.muted ? state.volume : 0.0, this.ctx.currentTime, 0.02);
    } else {
      g.gain.setTargetAtTime(state.muted ? 0.0 : state.volume, this.ctx.currentTime, 0.02);
    }
  }

  public connect(destination: AudioNode): void {
    this.masterGain.connect(destination);
  }
}

/**
 * src/modules/audio/AudioEngine.ts
 * Master WebAudio Engine & Dual-Timer Zero-Jitter Lookahead Scheduler
 * Implements Section 7.2 of SONICFRAME Enterprise Architecture v4.0
 */

import { StemMixer } from './StemMixer';
import { ModalImpactSynth } from './synths/ModalImpactSynth';
import { GranularNoiseSynth } from './synths/GranularNoise';
import { HarmonicDroneEngine } from './synths/HarmonicDrone';
import { WavExporter } from './Exporter';
import type { SonicFrameCueSheet, FoleyCue } from '../../types/cueSheet';

export class AudioEngine {
  public ctx: AudioContext | null = null;
  public mixer: StemMixer | null = null;
  public modalSynth: ModalImpactSynth | null = null;
  public noiseSynth: GranularNoiseSynth | null = null;
  public droneEngine: HarmonicDroneEngine | null = null;

  private isRunning = false;
  private timerId: number | null = null;
  private cueSheet: SonicFrameCueSheet | null = null;
  private videoCurrentTime = 0;
  private scheduledCueIndices = new Set<number>();

  // Lookahead timing constants (Section 7.2 of PDF)
  private readonly lookaheadMs = 120; // 120ms lookahead window
  private readonly scheduleIntervalMs = 25; // 25ms interval timer

  public init(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 48000 });
      this.mixer = new StemMixer(this.ctx);
      this.mixer.connect(this.ctx.destination);

      this.modalSynth = new ModalImpactSynth(this.ctx);
      this.noiseSynth = new GranularNoiseSynth(this.ctx);
      this.droneEngine = new HarmonicDroneEngine(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public loadCueSheet(sheet: SonicFrameCueSheet): void {
    this.cueSheet = sheet;
    this.scheduledCueIndices.clear();

    if (this.droneEngine && this.mixer) {
      const prof = sheet.composition_profile;
      this.droneEngine.start(this.mixer.channels.atmosphere.input, prof.key_root, prof.scale_mode);
    }
  }

  public startPlayback(startTimeSec = 0): void {
    this.init();
    this.isRunning = true;
    this.videoCurrentTime = startTimeSec;

    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
    }

    this.timerId = window.setInterval(() => {
      this.scheduleLoop();
    }, this.scheduleIntervalMs);
  }

  public pausePlayback(): void {
    this.isRunning = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.droneEngine) {
      this.droneEngine.stop();
    }
  }

  public updateVideoTime(currentTimeSec: number): void {
    this.videoCurrentTime = currentTimeSec;
  }

  public seekPlayback(seekTimeSec: number): void {
    this.videoCurrentTime = seekTimeSec;
    // Clear cues scheduled ahead of the new seek target
    if (this.cueSheet) {
      this.cueSheet.foley_events.forEach((cue, idx) => {
        if ((cue.timestamp_ms / 1000) > seekTimeSec) {
          this.scheduledCueIndices.delete(idx);
        }
      });
    }
  }

  /**
   * Dual-Timer Lookahead Scheduler (Section 7.2 of PDF)
   * Places scheduled events on the native audio hardware sample clock
   * prior to their visual presentation timestamp:
   * t_target = t_AudioContext + (t_cue - t_video)
   */
  private scheduleLoop(): void {
    if (!this.isRunning || !this.ctx || !this.cueSheet || !this.mixer) return;

    const audioBaseTime = this.ctx.currentTime;
    const lookaheadSec = this.lookaheadMs / 1000;
    const cues = this.cueSheet.foley_events;

    for (let idx = 0; idx < cues.length; idx++) {
      if (this.scheduledCueIndices.has(idx)) continue;

      const cue = cues[idx]!;
      const cueTimeSec = cue.timestamp_ms / 1000;
      const timeDelta = cueTimeSec - this.videoCurrentTime;

      if (timeDelta >= 0 && timeDelta < lookaheadSec) {
        const scheduledAudioTime = Math.max(audioBaseTime, audioBaseTime + timeDelta);
        this.triggerCue(cue, scheduledAudioTime);
        this.scheduledCueIndices.add(idx);
      }
    }
  }

  private triggerCue(cue: FoleyCue, scheduledTime: number): void {
    if (!this.mixer) return;

    const params = cue.parameters;
    const fund = params.fundamental_freq || params.fundamental_hz || 280;
    const decay = params.decay_seconds || params.decay_s || 0.45;
    const damping = decay > 0 ? (1.5 / decay) : 3.0;

    if (cue.patch_type === 'filtered_noise_burst' || cue.category === 'whoosh_pass') {
      if (this.noiseSynth) {
        this.noiseSynth.triggerWhoosh(this.mixer.channels.textureShimmer.input, {
          duration: decay,
          gain: cue.velocity * 0.4,
          pan: cue.pan,
          time: scheduledTime,
        });
      }
    } else {
      if (this.modalSynth) {
        let mat = 'metal';
        if (cue.category.includes('wood')) mat = 'wood';
        else if (cue.category.includes('glass')) mat = 'glass';
        else if (cue.category.includes('ground') || cue.category.includes('heavy')) mat = 'earth';

        this.modalSynth.trigger(this.mixer.channels.foleyImpact.input, {
          material: mat,
          fundamental: fund,
          damping,
          brightness: params.brightness,
          velocity: cue.velocity,
          pan: cue.pan,
          time: scheduledTime,
        });
      }
    }
  }

  public async renderOfflineWav(durationSec: number): Promise<ArrayBuffer> {
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(durationSec * 48000), 48000);
    const offlineMixer = new StemMixer(offlineCtx);
    offlineMixer.connect(offlineCtx.destination);

    const offlineModal = new ModalImpactSynth(offlineCtx);
    const offlineNoise = new GranularNoiseSynth(offlineCtx);

    if (this.cueSheet) {
      // 1. Drone pad
      const droneEng = new HarmonicDroneEngine(offlineCtx);
      const prof = this.cueSheet.composition_profile;
      droneEng.start(offlineMixer.channels.atmosphere.input, prof.key_root, prof.scale_mode);

      // 2. Foley cues
      this.cueSheet.foley_events.forEach((cue) => {
        const timeSec = cue.timestamp_ms / 1000;
        if (timeSec >= durationSec) return;

        const params = cue.parameters;
        const fund = params.fundamental_freq || params.fundamental_hz || 280;
        const decay = params.decay_seconds || params.decay_s || 0.45;
        const damping = decay > 0 ? (1.5 / decay) : 3.0;

        if (cue.patch_type === 'filtered_noise_burst' || cue.category === 'whoosh_pass') {
          offlineNoise.triggerWhoosh(offlineMixer.channels.textureShimmer.input, {
            duration: decay,
            gain: cue.velocity * 0.4,
            pan: cue.pan,
            time: timeSec,
          });
        } else {
          let mat = 'metal';
          if (cue.category.includes('wood')) mat = 'wood';
          else if (cue.category.includes('glass')) mat = 'glass';
          else if (cue.category.includes('ground') || cue.category.includes('heavy')) mat = 'earth';

          offlineModal.trigger(offlineMixer.channels.foleyImpact.input, {
            material: mat,
            fundamental: fund,
            damping,
            brightness: params.brightness,
            velocity: cue.velocity,
            pan: cue.pan,
            time: timeSec,
          });
        }
      });
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return WavExporter.encodeWav24Bit(renderedBuffer);
  }
}

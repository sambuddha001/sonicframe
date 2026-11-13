/**
 * src/app/state/actions.ts
 * Application Action Creators & End-to-End Orchestration Pipeline
 * Implements Layer E, Layer C1 & Layer C2 of SONICFRAME Enterprise Architecture v4.0
 */

import { store } from './store';
import { AudioEngine } from '../../modules/audio/AudioEngine';
import { VideoPlayer } from '../../modules/video/VideoPlayer';
import { OrchestratorClient } from '../../modules/orchestrator/OrchestratorClient';
import { CueSheetParser } from '../../modules/orchestrator/CueSheetParser';
import { OpticalFlowEngine } from '../workers/opticalFlow.worker';
import type { MathematicalTelemetry, TelemetryVector } from '../../types/telemetry';

export class AppActions {
  public static audioEngine = new AudioEngine();
  public static videoPlayer: VideoPlayer | null = null;
  public static orchestratorClient = new OrchestratorClient();

  public static initActions(): void {
    const s = store.getState();
    s.loadVideoFile = this.loadVideoFile.bind(this);
    s.runAnalysis = this.runAnalysis.bind(this);
    s.togglePlay = this.togglePlay.bind(this);
    s.seekTo = this.seekTo.bind(this);
    s.setStemVolume = this.setStemVolume.bind(this);
    s.exportLosslessWav = this.exportLosslessWav.bind(this);
  }

  public static async loadVideoFile(file: File): Promise<void> {
    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.getElementById('video') as HTMLVideoElement;
    if (!videoEl) return;

    this.videoPlayer = new VideoPlayer(videoEl);
    await this.videoPlayer.loadSource(objectUrl);

    store.setState({
      video: {
        file,
        objectUrl,
        durationSeconds: this.videoPlayer.duration,
        width: videoEl.videoWidth || 640,
        height: videoEl.videoHeight || 360,
        fps: 30,
        currentTime: 0,
        isPlaying: false,
      },
      telemetry: {
        status: 'idle',
        progressPct: 0,
        sampleRateHz: 10,
        vectors: [],
        detectedImpacts: [],
      },
    });
  }

  public static async runAnalysis(): Promise<void> {
    const { video } = store.getState();
    if (!video.objectUrl || !this.videoPlayer) {
      throw new Error('No video loaded. Please drop an animation clip first.');
    }

    store.setState({
      telemetry: {
        ...store.getState().telemetry,
        status: 'analyzing',
        progressPct: 0,
      },
    });

    const videoEl = this.videoPlayer.videoElement;
    const duration = video.durationSeconds || 15;
    const fps = video.fps || 30;
    const totalFrames = Math.max(2, Math.ceil(duration * fps));

    const W = 160;
    const H = 90;
    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create offscreen context');

    const engine = new OpticalFlowEngine();
    engine.init({ width: W, height: H, fps });

    const vectors: TelemetryVector[] = [];

    // Frame extraction loop with cooperative yields to keep UI unblocked
    for (let f = 0; f < totalFrames; f++) {
      const targetTime = Math.min(duration - 0.001, f / fps);

      // Seek cleanly
      await new Promise<void>((resolve) => {
        if (Math.abs(videoEl.currentTime - targetTime) < 0.01) {
          resolve();
          return;
        }
        videoEl.addEventListener('seeked', () => resolve(), { once: true });
        videoEl.currentTime = targetTime;
      });

      ctx.drawImage(videoEl, 0, 0, W, H);
      const imgData = ctx.getImageData(0, 0, W, H);

      const res = engine.processFrame(f, targetTime * 1000, imgData.data, totalFrames);
      vectors.push(res.vector);

      if (f % 5 === 0 || f === totalFrames - 1) {
        store.setState({
          telemetry: {
            ...store.getState().telemetry,
            progressPct: res.progress.percent,
            vectors: [...vectors],
          },
        });
        // Cooperative yield
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    videoEl.currentTime = 0;

    const finalTelemetry: MathematicalTelemetry = engine.finish();

    store.setState({
      telemetry: {
        status: 'ready',
        progressPct: 100,
        sampleRateHz: 10,
        vectors: finalTelemetry.summary,
        detectedImpacts: finalTelemetry.detectedImpacts,
      },
      orchestrator: {
        ...store.getState().orchestrator,
        isGenerating: true,
      },
    });

    // Cognitive Orchestration (with 100% offline deterministic fallback)
    const mood = store.getState().orchestrator.mood;
    const cueSheet = await this.orchestratorClient.orchestrate(finalTelemetry, mood);

    this.audioEngine.init();
    this.audioEngine.loadCueSheet(cueSheet);

    store.setState({
      orchestrator: {
        ...store.getState().orchestrator,
        cueSheet,
        isGenerating: false,
        copilotMessages: [
          ...store.getState().orchestrator.copilotMessages,
          {
            role: 'assistant',
            text: `✦ Orchestration complete: Generated ${cueSheet.foley_events.length} frame-locked Foley cues and adaptive score profile in ${cueSheet.composition_profile.key_root} ${cueSheet.composition_profile.scale_mode}.`,
            timestamp: new Date(),
          },
        ],
      },
    });
  }

  public static async togglePlay(): Promise<void> {
    if (!this.videoPlayer) return;
    this.audioEngine.init();

    if (this.videoPlayer.isPaused) {
      await this.videoPlayer.play();
      this.audioEngine.startPlayback(this.videoPlayer.currentTime);
      store.setState({
        video: { ...store.getState().video, isPlaying: true },
      });
    } else {
      this.videoPlayer.pause();
      this.audioEngine.pausePlayback();
      store.setState({
        video: { ...store.getState().video, isPlaying: false },
      });
    }
  }

  public static seekTo(timeSeconds: number): void {
    if (!this.videoPlayer) return;
    this.videoPlayer.seek(timeSeconds);
    this.audioEngine.seekPlayback(timeSeconds);
    store.setState({
      video: { ...store.getState().video, currentTime: timeSeconds },
    });
  }

  public static setStemVolume(stem: 'atmosphere' | 'pulse' | 'foley' | 'texture', vol: number): void {
    const stemMap = {
      atmosphere: 'atmosphere',
      pulse: 'motionPulse',
      foley: 'foleyImpact',
      texture: 'textureShimmer',
    } as const;

    if (this.audioEngine.mixer) {
      this.audioEngine.mixer.setVolume(stemMap[stem], vol);
    }
  }

  public static async exportLosslessWav(): Promise<Blob> {
    const { video } = store.getState();
    const duration = video.durationSeconds || 15;
    const buffer = await this.audioEngine.renderOfflineWav(duration);
    return new Blob([buffer], { type: 'audio/wav' });
  }
}

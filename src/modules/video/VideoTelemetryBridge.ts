/**
 * src/modules/video/VideoTelemetryBridge.ts
 * Coordinates HTML5 video playback timestamps with WebAudio clock
 * Implements Section 8.2 of SONICFRAME Enterprise Architecture v4.0
 */

import type { AudioEngine } from '../audio/AudioEngine';
import type { VideoPlayer } from './VideoPlayer';

export class VideoTelemetryBridge {
  private video: VideoPlayer;
  private audio: AudioEngine;
  private animId: number | null = null;
  private onTick?: (timeSec: number) => void;

  constructor(video: VideoPlayer, audio: AudioEngine, onTick?: (timeSec: number) => void) {
    this.video = video;
    this.audio = audio;
    this.onTick = onTick;
  }

  public startSync(): void {
    const loop = () => {
      const curTime = this.video.currentTime;
      this.audio.updateVideoTime(curTime);
      if (this.onTick) this.onTick(curTime);

      if (!this.video.isPaused) {
        this.animId = requestAnimationFrame(loop);
      }
    };
    this.animId = requestAnimationFrame(loop);
  }

  public stopSync(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }
}

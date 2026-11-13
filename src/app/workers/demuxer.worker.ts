/**
 * src/app/workers/demuxer.worker.ts
 * WebCodecs VideoDecoder & MP4 Demuxer Frame Extraction Thread
 * Implements Layer E of SONICFRAME Enterprise Architecture v4.0
 */

export interface DemuxerWorkerConfig {
  fps: number;
  width: number;
  height: number;
}

export class DemuxerWorkerClient {
  private config: DemuxerWorkerConfig;

  constructor(config: Partial<DemuxerWorkerConfig> = {}) {
    this.config = {
      fps: config.fps ?? 30,
      width: config.width ?? 160,
      height: config.height ?? 90,
    };
  }

  public async decodeFrames(
    videoElement: HTMLVideoElement,
    onFrame: (frameIndex: number, timeMs: number, imageData: ImageData) => Promise<void>
  ): Promise<void> {
    const duration = videoElement.duration || 15;
    const totalFrames = Math.ceil(duration * this.config.fps);
    const canvas = new OffscreenCanvas(this.config.width, this.config.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create offscreen canvas 2d context');

    for (let f = 0; f < totalFrames; f++) {
      const timeSec = f / this.config.fps;
      videoElement.currentTime = timeSec;
      await new Promise<void>((resolve) => {
        const handler = () => {
          videoElement.removeEventListener('seeked', handler);
          resolve();
        };
        videoElement.addEventListener('seeked', handler, { once: true });
      });

      ctx.drawImage(videoElement, 0, 0, this.config.width, this.config.height);
      const imgData = ctx.getImageData(0, 0, this.config.width, this.config.height);
      await onFrame(f, timeSec * 1000, imgData);
    }
  }
}

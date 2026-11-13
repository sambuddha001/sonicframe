/**
 * src/modules/video/VideoPlayer.ts
 * HTML5 Video Player Wrapper & Frame Scrubber
 * Implements Section 8.2 of SONICFRAME Enterprise Architecture v4.0
 */

export class VideoPlayer {
  public videoElement: HTMLVideoElement;

  constructor(element: HTMLVideoElement) {
    this.videoElement = element;
  }

  public loadSource(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.videoElement.src = url;
      this.videoElement.load();
      this.videoElement.onloadedmetadata = () => {
        this.videoElement.style.display = 'block';
        resolve();
      };
      this.videoElement.onerror = () => {
        reject(new Error('Failed to load video source'));
      };
    });
  }

  public play(): Promise<void> {
    return this.videoElement.play();
  }

  public pause(): void {
    this.videoElement.pause();
  }

  public seek(timeSeconds: number): void {
    this.videoElement.currentTime = Math.max(0, Math.min(this.videoElement.duration || 0, timeSeconds));
  }

  public stepFrame(direction: 1 | -1, fps = 30): void {
    const frameInterval = 1 / fps;
    this.seek(this.videoElement.currentTime + direction * frameInterval);
  }

  public get duration(): number {
    return this.videoElement.duration || 0;
  }

  public get currentTime(): number {
    return this.videoElement.currentTime || 0;
  }

  public get isPaused(): boolean {
    return this.videoElement.paused;
  }
}

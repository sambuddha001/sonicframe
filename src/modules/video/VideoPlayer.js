/**
 * src/modules/video/VideoPlayer.ts
 * HTML5 Video Player Wrapper & Frame Scrubber
 * Implements Section 8.2 of SONICFRAME Enterprise Architecture v4.0
 */
export class VideoPlayer {
    videoElement;
    constructor(element) {
        this.videoElement = element;
    }
    loadSource(url) {
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
    play() {
        return this.videoElement.play();
    }
    pause() {
        this.videoElement.pause();
    }
    seek(timeSeconds) {
        this.videoElement.currentTime = Math.max(0, Math.min(this.videoElement.duration || 0, timeSeconds));
    }
    stepFrame(direction, fps = 30) {
        const frameInterval = 1 / fps;
        this.seek(this.videoElement.currentTime + direction * frameInterval);
    }
    get duration() {
        return this.videoElement.duration || 0;
    }
    get currentTime() {
        return this.videoElement.currentTime || 0;
    }
    get isPaused() {
        return this.videoElement.paused;
    }
}

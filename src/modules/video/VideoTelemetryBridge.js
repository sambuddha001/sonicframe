/**
 * src/modules/video/VideoTelemetryBridge.ts
 * Coordinates HTML5 video playback timestamps with WebAudio clock
 * Implements Section 8.2 of SONICFRAME Enterprise Architecture v4.0
 */
export class VideoTelemetryBridge {
    video;
    audio;
    animId = null;
    onTick;
    constructor(video, audio, onTick) {
        this.video = video;
        this.audio = audio;
        this.onTick = onTick;
    }
    startSync() {
        const loop = () => {
            const curTime = this.video.currentTime;
            this.audio.updateVideoTime(curTime);
            if (this.onTick)
                this.onTick(curTime);
            if (!this.video.isPaused) {
                this.animId = requestAnimationFrame(loop);
            }
        };
        this.animId = requestAnimationFrame(loop);
    }
    stopSync() {
        if (this.animId !== null) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
    }
}

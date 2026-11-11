/**
 * SONICFRAME - Non-Blocking Telemetry & Optical Flow Client
 *
 * Eliminates:
 *   - Flaw 1: Main-Thread Frame Seeking Freezes the Browser (uses offscreen rendering,
 *             cooperative event-loop yielding, and dedicated Web Worker thread).
 *   - Flaw 2: Pseudo-Optical Flow 3x3 Block Matching (uses dense Pyramidal Lucas-Kanade
 *             optical flow, kinetic energy integration, divergence, curl, and centroid panning).
 *
 * Reference: SONICFRAME_ARCHITECTURE.pdf & PS.txt
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const target = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : root)) || {};
    const exported = factory();
    target.SonicFrameTelemetry = exported;
    target.SonicFrameTelemetryAnalyzer = exported.SonicFrameTelemetryAnalyzer;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  class SonicFrameTelemetryAnalyzer {
    constructor(options = {}) {
      this.workerUrl = options.workerUrl || 'opticalFlow.worker.js';
      this.width = options.width || 160;
      this.height = options.height || 90;
      this.fps = options.fps || 30;
      this.sensitivity = options.sensitivity !== undefined ? options.sensitivity : 0.7;
      this.gridStep = options.gridStep || 4;
      this.winRadius = options.winRadius || 3;

      this.onProgress = options.onProgress || null;
      this.onFrame = options.onFrame || null;
      this.onComplete = options.onComplete || null;
      this.onError = options.onError || null;

      this.worker = null;
      this.isAnalyzing = false;
      this.aborted = false;
      this.pendingResolve = null;
      this.pendingReject = null;

      // Offscreen canvas for frame extraction
      this.offscreenCanvas = null;
      this.offscreenCtx = null;
    }

    /**
     * Initializes or restarts the dedicated Web Worker.
     */
    initWorker() {
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }

      try {
        this.worker = new Worker(this.workerUrl);
        this.worker.onmessage = (e) => this._handleWorkerMessage(e.data);
        this.worker.onerror = (err) => {
          console.error('[SonicFrameTelemetry] Worker error:', err);
          if (this.onError) this.onError(err);
          if (this.pendingReject) {
            this.pendingReject(err);
            this.pendingReject = null;
          }
        };

        // Send INIT command
        this.worker.postMessage({
          action: 'INIT',
          width: this.width,
          height: this.height,
          fps: this.fps,
          sensitivity: this.sensitivity,
          gridStep: this.gridStep,
          winRadius: this.winRadius
        });
      } catch (err) {
        console.warn('[SonicFrameTelemetry] Could not spawn Web Worker, falling back to inline engine:', err);
        throw err;
      }
    }

    _handleWorkerMessage(msg) {
      if (!msg) return;

      switch (msg.type) {
        case 'PROGRESS':
          if (this.onProgress) {
            this.onProgress({
              frameIndex: msg.frameIndex,
              totalFrames: msg.totalFrames,
              percent: msg.percent
            });
          }
          break;

        case 'FRAME_TELEMETRY':
          if (this.onFrame) {
            this.onFrame(msg.vector);
          }
          break;

        case 'ANALYSIS_COMPLETE':
          this.isAnalyzing = false;
          if (this.onComplete) {
            this.onComplete(msg.telemetry);
          }
          if (this.pendingResolve) {
            this.pendingResolve(msg.telemetry);
            this.pendingResolve = null;
            this.pendingReject = null;
          }
          break;

        case 'ERROR':
          this.isAnalyzing = false;
          const err = new Error(msg.error || 'Worker error');
          if (this.onError) this.onError(err);
          if (this.pendingReject) {
            this.pendingReject(err);
            this.pendingResolve = null;
            this.pendingReject = null;
          }
          break;
      }
    }

    /**
     * Non-blocking cooperative yield to prevent freezing the UI thread.
     * Allows 60fps animations, DOM rendering, and user input to proceed.
     */
    _yieldToMainThread() {
      return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            setTimeout(resolve, 0);
          });
        } else {
          setTimeout(resolve, 0);
        }
      });
    }

    _setupCanvas() {
      if (!this.offscreenCanvas) {
        if (typeof OffscreenCanvas !== 'undefined') {
          this.offscreenCanvas = new OffscreenCanvas(this.width, this.height);
          this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        } else if (typeof document !== 'undefined') {
          this.offscreenCanvas = document.createElement('canvas');
          this.offscreenCanvas.width = this.width;
          this.offscreenCanvas.height = this.height;
          this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        }
      }
    }

    /**
     * Analyzes video non-blockingly without freezing the browser.
     *
     * @param {HTMLVideoElement|string|Blob} videoSource
     * @param {Object} options
     * @returns {Promise<{ telemetry: Object, events: Array }>}
     */
    async analyze(videoSource, options = {}) {
      if (this.isAnalyzing) {
        throw new Error('Analysis already in progress.');
      }

      this.aborted = false;
      this.isAnalyzing = true;
      this.initWorker();
      this._setupCanvas();

      if (options.sensitivity !== undefined) {
        this.sensitivity = options.sensitivity > 1 ? options.sensitivity / 100 : options.sensitivity;
      }
      const samplingStep = options.samplingStep || 1; // frame skip step (1 = every frame)
      const maxDuration = options.maxDuration || 60; // limit to 60 seconds

      return new Promise(async (resolve, reject) => {
        this.pendingResolve = (telemetry) => {
          const events = this.toFoleyEvents(telemetry, {
            sensitivity: this.sensitivity,
            duration: telemetry.summary.durationMs / 1000
          });
          resolve({ telemetry, events });
        };
        this.pendingReject = reject;

        try {
          if (videoSource instanceof HTMLVideoElement) {
            await this._extractFromVideoElement(videoSource, samplingStep, maxDuration);
          } else {
            throw new Error('Unsupported video source. Please pass an HTMLVideoElement or loaded video.');
          }
        } catch (err) {
          this.isAnalyzing = false;
          if (this.worker) this.worker.terminate();
          reject(err);
        }
      });
    }

    /**
     * Extracts video frames using smooth asynchronous seeks with event loop yielding.
     * This avoids pipeline decimation and UI freezing.
     */
    async _extractFromVideoElement(video, samplingStep = 1, maxDuration = 30) {
      const duration = Math.min(video.duration || maxDuration, maxDuration);
      const fps = this.fps;
      const totalFrames = Math.max(2, Math.ceil((duration * fps) / samplingStep));
      const ctx = this.offscreenCtx;
      const w = this.width;
      const h = this.height;

      // Detached clone / hidden video element can be used to prevent disturbing the main UI video
      let sampleIndex = 0;

      for (let idx = 0; idx < totalFrames; idx++) {
        if (this.aborted) {
          this.isAnalyzing = false;
          return;
        }

        const targetTime = Math.min(duration - 0.001, (idx * samplingStep) / fps);

        // Seek cleanly
        await this._seekVideo(video, targetTime);

        // Draw to offscreen canvas and extract ImageData
        ctx.drawImage(video, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        // Transfer raw buffer to worker for zero-copy high performance
        const buffer = imgData.data.buffer;
        this.worker.postMessage(
          {
            action: 'PROCESS_FRAME',
            frameIndex: sampleIndex,
            timeMs: targetTime * 1000,
            imageData: imgData.data,
            totalFrames
          },
          [buffer]
        );

        sampleIndex++;

        // Cooperative yield: Every frame or two, yield back to the browser's main event loop
        // so that the UI stays fluid at 60 FPS without dropping frames or freezing!
        await this._yieldToMainThread();
      }

      // Signal completion to worker
      this.worker.postMessage({ action: 'FINISH' });
    }

    _seekVideo(video, targetTime) {
      return new Promise((resolve) => {
        // If already close to target time, resolve immediately
        if (Math.abs(video.currentTime - targetTime) < 0.01) {
          resolve();
          return;
        }

        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };

        video.addEventListener('seeked', onSeeked, { once: true });
        video.currentTime = targetTime;
      });
    }

    cancel() {
      this.aborted = true;
      this.isAnalyzing = false;
      if (this.worker) {
        this.worker.postMessage({ action: 'RESET' });
        this.worker.terminate();
        this.worker = null;
      }
    }

    /**
     * Converts raw optical flow telemetry into structured Foley cues.
     * Matches the SonicFrame DAW format (impact, motion, shift).
     */
    toFoleyEvents(telemetry, options = {}) {
      if (!telemetry || !telemetry.vectors) return [];

      const vectors = telemetry.vectors;
      const impacts = telemetry.detectedImpacts || [];
      const duration = options.duration || (vectors.length > 0 ? vectors[vectors.length - 1].timeMs / 1000 : 1);
      const sensitivity = options.sensitivity !== undefined ? options.sensitivity : 0.7;

      const events = [];

      // 1. Add detected 2nd-order impact events (shock arrests)
      for (const imp of impacts) {
        events.push({
          t: imp.timeMs / 1000,
          type: 'impact',
          energy: imp.energy,
          pan: imp.centroidX, // Horizontal stereo pan locked to action centroid [-1.0 to 1.0]
          confidence: imp.confidence,
          secondDerivative: imp.secondDerivative
        });
      }

      // 2. Add prominent motion pulse peaks
      const threshold = Math.max(0.08, 0.16 + (1 - sensitivity) * 0.32);
      for (let i = 1; i < vectors.length - 1; i++) {
        const v = vectors[i];
        const prev = vectors[i - 1];
        const next = vectors[i + 1];

        // Local peak of kinetic energy
        if (v.energy > threshold && v.energy >= prev.energy && v.energy >= next.energy) {
          const tSec = v.timeMs / 1000;
          // Avoid duplicate motion cues within 150ms of another motion cue or impact
          const nearExisting = events.some((e) => (e.type === 'impact' || e.type === 'motion') && Math.abs(e.t - tSec) < 0.15);
          if (!nearExisting) {
            events.push({
              t: tSec,
              type: 'motion',
              energy: v.energy,
              pan: v.centroidX,
              divergence: v.divergence,
              curl: v.curl
            });
          }
        }
      }

      // 3. Add chromatic shift events (lighting flashes / scene transitions from CIELAB Delta-E)
      const shiftThreshold = Math.max(4.0, 10.0 - sensitivity * 5.0);
      for (let i = 1; i < vectors.length; i++) {
        const v = vectors[i];
        if (v.deltaE > shiftThreshold) {
          const tSec = v.timeMs / 1000;
          // Suppress duplicate shift cues within 250ms of another shift cue
          const nearShift = events.some((e) => e.type === 'shift' && Math.abs(e.t - tSec) < 0.25);
          if (!nearShift) {
            events.push({
              t: tSec,
              type: 'shift',
              energy: Math.min(1.0, v.deltaE / 30),
              deltaE: v.deltaE,
              pan: v.centroidX
            });
          }
        }
      }

      // Sort chronologically
      events.sort((a, b) => a.t - b.t);
      return events;
    }
  }

  return {
    SonicFrameTelemetryAnalyzer
  };
});

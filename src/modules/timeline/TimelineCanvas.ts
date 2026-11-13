/**
 * src/modules/timeline/TimelineCanvas.ts
 * High-DPI Canvas & DOM Multi-Track DAW Timeline
 * Implements Section 8.1 & 8.2 of SONICFRAME Enterprise Architecture v4.0
 */

import type { SonicFrameCueSheet, FoleyCue } from '../../types/cueSheet';
import type { TelemetryVector } from '../../types/telemetry';

export class TimelineCanvas {
  private container: HTMLElement;
  private duration = 15;
  private onSeek: (timeSec: number) => void;

  constructor(container: HTMLElement, onSeek: (timeSec: number) => void) {
    this.container = container;
    this.onSeek = onSeek;
    this.initClickToSeek();
  }

  public setDuration(dur: number): void {
    this.duration = Math.max(1, dur);
  }

  private initClickToSeek(): void {
    this.container.addEventListener('click', (e) => {
      const rect = this.container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      this.onSeek(ratio * this.duration);
    });
  }

  public render(vectors: TelemetryVector[], cues: FoleyCue[]): void {
    const trackLanes = this.container.querySelectorAll<HTMLElement>('.track-lane');
    if (trackLanes.length < 3) return;

    const motionLane = trackLanes[0]!;
    const foleyLane = trackLanes[1]!;
    const scoreLane = trackLanes[2]!;

    // Clear lanes (preserve playheads)
    [motionLane, foleyLane, scoreLane].forEach((lane) => {
      lane.querySelectorAll('.event').forEach((el) => el.remove());
    });

    // 1. Motion Track: render continuous kinetic energy markers
    vectors.forEach((v) => {
      const tSec = v.timeMs / 1000;
      const el = document.createElement('i');
      el.className = 'event motion';
      el.style.left = `${(tSec / this.duration) * 100}%`;
      el.style.width = `${Math.max(0.35, (100 / this.duration) * 0.03)}%`;
      el.style.opacity = `${0.25 + Math.min(0.75, v.kineticEnergy * 1.5)}`;
      motionLane.appendChild(el);
    });

    // 2. Foley Track: render frame-locked impact hits
    cues.forEach((c) => {
      const tSec = c.timestamp_ms / 1000;
      const el = document.createElement('i');
      el.className = `event ${c.category.includes('metal') ? 'impact' : 'motion'}`;
      el.style.left = `${(tSec / this.duration) * 100}%`;
      el.style.width = '1.2%';
      el.title = `${c.category} @ ${(tSec).toFixed(3)}s (vel: ${c.velocity})`;
      foleyLane.appendChild(el);
    });

    // 3. Score Track: render ambient chord density blocks
    for (let t = 0; t < this.duration; t += Math.max(1.2, this.duration / 9)) {
      const el = document.createElement('i');
      el.className = 'event ambience';
      el.style.left = `${(t / this.duration) * 100}%`;
      el.style.width = `${Math.max(2, Math.min(8, (100 / this.duration) * 2.5))}%`;
      scoreLane.appendChild(el);
    }
  }

  public updatePlayhead(timeSec: number): void {
    const pct = Math.max(0, Math.min(100, (timeSec / this.duration) * 100));
    this.container.querySelectorAll<HTMLElement>('.playhead').forEach((p) => {
      p.style.left = `${pct}%`;
    });
  }
}

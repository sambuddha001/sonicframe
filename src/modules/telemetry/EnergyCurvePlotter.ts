/**
 * src/modules/telemetry/EnergyCurvePlotter.ts
 * Real-time Kinetic Energy Curve Plotter & Acceleration Spikes
 * Implements Section 8.2 of SONICFRAME Enterprise Architecture v4.0
 */

import type { TelemetryVector } from '../../types/telemetry';

export class EnergyCurvePlotter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  public render(vectors: TelemetryVector[], currentFrame = 0): void {
    if (!this.ctx || vectors.length === 0) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Find max energy
    let maxE = 0.1;
    for (const v of vectors) {
      if (v.kineticEnergy > maxE) maxE = v.kineticEnergy;
    }

    // Draw grid
    ctx.strokeStyle = '#26324744';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();

    // Draw Energy Curve
    ctx.strokeStyle = '#5ce1e6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const stepX = w / Math.max(1, vectors.length - 1);
    vectors.forEach((v, idx) => {
      const x = idx * stepX;
      const y = h - (v.kineticEnergy / maxE) * (h * 0.85) - 4;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Playhead line
    if (currentFrame >= 0 && currentFrame < vectors.length) {
      const curX = currentFrame * stepX;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(curX, 0);
      ctx.lineTo(curX, h);
      ctx.stroke();
    }
  }
}

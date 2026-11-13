/**
 * src/modules/telemetry/VectorFieldCanvas.ts
 * Renders dense optical flow arrows and kinetic motion heatmap
 * Implements Section 8.2 of SONICFRAME Enterprise Architecture v4.0
 */

export class VectorFieldCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  public renderFlowField(u: Float32Array, v: Float32Array, gw: number, gh: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#5ce1e6';
    ctx.lineWidth = 1.2;

    const cellW = w / gw;
    const cellH = h / gh;

    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const idx = j * gw + i;
        const dx = u[idx]! * 3;
        const dy = v[idx]! * 3;
        const mag = Math.sqrt(dx * dx + dy * dy);

        if (mag > 0.5) {
          const x0 = i * cellW + cellW * 0.5;
          const y0 = j * cellH + cellH * 0.5;

          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + dx, y0 + dy);
          ctx.stroke();
        }
      }
    }
  }
}

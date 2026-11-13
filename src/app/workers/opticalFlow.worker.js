/**
 * src/app/workers/opticalFlow.worker.ts
 * Dedicated Web Worker for Optical Flow & Mathematical Telemetry Extraction
 * Implements Layer E of SONICFRAME Enterprise Architecture v4.0
 */
import { PeakDetector } from '../../modules/telemetry/PeakDetector';
// Linearize sRGB to CIE XYZ and convert to CIELAB (D65 illuminant)
export function rgbToCielab(r255, g255, b255) {
    const r = r255 / 255;
    const g = g255 / 255;
    const b = b255 / 255;
    const rLin = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    const gLin = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    const bLin = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    const X = (rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375) / 0.95047;
    const Y = (rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.0721750) / 1.00000;
    const Z = (rLin * 0.0193339 + gLin * 0.1191920 + bLin * 0.9503041) / 1.08883;
    const delta = 6 / 29;
    const delta3 = delta * delta * delta;
    const fx = X > delta3 ? Math.cbrt(X) : (X / (3 * delta * delta)) + (4 / 29);
    const fy = Y > delta3 ? Math.cbrt(Y) : (Y / (3 * delta * delta)) + (4 / 29);
    const fz = Z > delta3 ? Math.cbrt(Z) : (Z / (3 * delta * delta)) + (4 / 29);
    return {
        L: 116 * fy - 16,
        a: 500 * (fx - fy),
        b: 200 * (fy - fz),
    };
}
export function computeFrameMeanLab(rgbaData, width, height, sampleStep = 2) {
    let sumL = 0, sumA = 0, sumB = 0, count = 0;
    const rowStride = width * 4;
    for (let y = 0; y < height; y += sampleStep) {
        const rowOffset = y * rowStride;
        for (let x = 0; x < width; x += sampleStep) {
            const idx = rowOffset + x * 4;
            const lab = rgbToCielab(rgbaData[idx], rgbaData[idx + 1], rgbaData[idx + 2]);
            sumL += lab.L;
            sumA += lab.a;
            sumB += lab.b;
            count++;
        }
    }
    if (count === 0)
        return { L: 50, a: 0, b: 0 };
    return { L: sumL / count, a: sumA / count, b: sumB / count };
}
export function computeDeltaE(lab1, lab2) {
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return Math.sqrt(dL * dL + da * da + db * db);
}
export function rgbaToGrayscale(rgbaData, width, height, outGray) {
    const totalPixels = width * height;
    for (let i = 0, j = 0; i < totalPixels; i++, j += 4) {
        outGray[i] = 0.299 * rgbaData[j] + 0.587 * rgbaData[j + 1] + 0.114 * rgbaData[j + 2];
    }
}
export function downsample2x(src, w, h) {
    const nw = Math.floor(w / 2);
    const nh = Math.floor(h / 2);
    const dst = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) {
        const sy = y * 2;
        const rowDst = y * nw;
        const rowSrc0 = sy * w;
        const rowSrc1 = (sy + 1) * w;
        for (let x = 0; x < nw; x++) {
            const sx = x * 2;
            dst[rowDst + x] = 0.25 * (src[rowSrc0 + sx] +
                src[rowSrc0 + sx + 1] +
                src[rowSrc1 + sx] +
                src[rowSrc1 + sx + 1]);
        }
    }
    return { data: dst, w: nw, h: nh };
}
export function sampleBilinear(img, w, h, x, y) {
    if (x <= 0)
        x = 0;
    if (x >= w - 1)
        x = w - 1.0001;
    if (y <= 0)
        y = 0;
    if (y >= h - 1)
        y = h - 1.0001;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const fx = x - x0;
    const fy = y - y0;
    const p00 = img[y0 * w + x0];
    const p10 = img[y0 * w + x1];
    const p01 = img[y1 * w + x0];
    const p11 = img[y1 * w + x1];
    return (1 - fx) * (1 - fy) * p00 +
        fx * (1 - fy) * p10 +
        (1 - fx) * fy * p01 +
        fx * fy * p11;
}
export function computeSpatialGradients(gray, w, h, outIx, outIy) {
    for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        const rowUp = (y - 1) * w;
        const rowDown = (y + 1) * w;
        for (let x = 1; x < w - 1; x++) {
            const idx = row + x;
            outIx[idx] = 0.5 * (gray[idx + 1] - gray[idx - 1]);
            outIy[idx] = 0.5 * (gray[rowDown + x] - gray[rowUp + x]);
        }
    }
}
// Multi-Scale Pyramidal Lucas-Kanade Dense Flow
export function computeDensePyramidalLK(prevGray, currGray, width, height, gridStep = 4, winRadius = 3) {
    const Gw = Math.floor((width - 2 * winRadius) / gridStep);
    const Gh = Math.floor((height - 2 * winRadius) / gridStep);
    const u = new Float32Array(Gw * Gh);
    const v = new Float32Array(Gw * Gh);
    const l1_prev_obj = downsample2x(prevGray, width, height);
    const l1_curr_obj = downsample2x(currGray, width, height);
    const l1_prev = l1_prev_obj.data;
    const l1_curr = l1_curr_obj.data;
    const w1 = l1_prev_obj.w;
    const h1 = l1_prev_obj.h;
    const Ix1 = new Float32Array(w1 * h1);
    const Iy1 = new Float32Array(w1 * h1);
    computeSpatialGradients(l1_prev, w1, h1, Ix1, Iy1);
    const Ix0 = new Float32Array(width * height);
    const Iy0 = new Float32Array(width * height);
    computeSpatialGradients(prevGray, width, height, Ix0, Iy0);
    const r1 = Math.max(1, Math.floor(winRadius / 2));
    const lambda = 0.05;
    for (let gj = 0; gj < Gh; gj++) {
        const pY0 = winRadius + gj * gridStep;
        const pY1 = pY0 * 0.5;
        for (let gi = 0; gi < Gw; gi++) {
            const pX0 = winRadius + gi * gridStep;
            const pX1 = pX0 * 0.5;
            const gIdx = gj * Gw + gi;
            let uL1 = 0, vL1 = 0;
            for (let iter = 0; iter < 2; iter++) {
                let Gxx = 0, Gyy = 0, Gxy = 0, bx = 0, by = 0;
                for (let dy = -r1; dy <= r1; dy++) {
                    const y = Math.round(pY1 + dy);
                    if (y <= 0 || y >= h1 - 1)
                        continue;
                    const row = y * w1;
                    for (let dx = -r1; dx <= r1; dx++) {
                        const x = Math.round(pX1 + dx);
                        if (x <= 0 || x >= w1 - 1)
                            continue;
                        const idx = row + x;
                        const ix = Ix1[idx];
                        const iy = Iy1[idx];
                        const currVal = sampleBilinear(l1_curr, w1, h1, x + uL1, y + vL1);
                        const prevVal = l1_prev[idx];
                        const it = currVal - prevVal;
                        Gxx += ix * ix;
                        Gyy += iy * iy;
                        Gxy += ix * iy;
                        bx -= ix * it;
                        by -= iy * it;
                    }
                }
                const det = Gxx * Gyy - Gxy * Gxy + lambda;
                if (Math.abs(det) > 1e-4) {
                    const du = (Gyy * bx - Gxy * by) / det;
                    const dv = (Gxx * by - Gxy * bx) / det;
                    uL1 += Math.max(-4, Math.min(4, du));
                    vL1 += Math.max(-4, Math.min(4, dv));
                }
            }
            let uL0 = uL1 * 2;
            let vL0 = vL1 * 2;
            for (let iter = 0; iter < 2; iter++) {
                let Gxx = 0, Gyy = 0, Gxy = 0, bx = 0, by = 0;
                for (let dy = -winRadius; dy <= winRadius; dy++) {
                    const y = pY0 + dy;
                    if (y <= 0 || y >= height - 1)
                        continue;
                    const row = y * width;
                    for (let dx = -winRadius; dx <= winRadius; dx++) {
                        const x = pX0 + dx;
                        if (x <= 0 || x >= width - 1)
                            continue;
                        const idx = row + x;
                        const ix = Ix0[idx];
                        const iy = Iy0[idx];
                        const currVal = sampleBilinear(currGray, width, height, x + uL0, y + vL0);
                        const prevVal = prevGray[idx];
                        const it = currVal - prevVal;
                        Gxx += ix * ix;
                        Gyy += iy * iy;
                        Gxy += ix * iy;
                        bx -= ix * it;
                        by -= iy * it;
                    }
                }
                const det = Gxx * Gyy - Gxy * Gxy + lambda;
                if (Math.abs(det) > 1e-4) {
                    const du = (Gyy * bx - Gxy * by) / det;
                    const dv = (Gxx * by - Gxy * bx) / det;
                    uL0 += Math.max(-3, Math.min(3, du));
                    vL0 += Math.max(-3, Math.min(3, dv));
                }
            }
            u[gIdx] = uL0;
            v[gIdx] = vL0;
        }
    }
    return { u, v, gw: Gw, gh: Gh };
}
// Kinetic Energy Integral: E(t) = (1/WH) * sum(sqrt(u^2 + v^2))
export function computeKineticEnergy(u, v, count) {
    if (count === 0)
        return 0;
    let totalMag = 0;
    for (let i = 0; i < count; i++) {
        const ui = u[i];
        const vi = v[i];
        totalMag += Math.sqrt(ui * ui + vi * vi);
    }
    return totalMag / count;
}
// Divergence: du/dx + dv/dy; Curl: dv/dx - du/dy
export function computeDivergenceAndCurl(u, v, gw, gh) {
    if (gw < 3 || gh < 3)
        return { divergence: 0, curl: 0 };
    let sumDiv = 0, sumCurl = 0, samples = 0;
    for (let j = 1; j < gh - 1; j++) {
        const row = j * gw;
        for (let i = 1; i < gw - 1; i++) {
            const idx = row + i;
            const dudx = 0.5 * (u[idx + 1] - u[idx - 1]);
            const dvdy = 0.5 * (v[idx + gw] - v[idx - gw]);
            const dvdx = 0.5 * (v[idx + 1] - v[idx - 1]);
            const dudy = 0.5 * (u[idx + gw] - u[idx - gw]);
            sumDiv += (dudx + dvdy);
            sumCurl += (dvdx - dudy);
            samples++;
        }
    }
    return {
        divergence: samples > 0 ? sumDiv / samples : 0,
        curl: samples > 0 ? sumCurl / samples : 0,
    };
}
// Energy-Weighted Action Centroid Cx in [-1.0, 1.0] for Stereo Pan
export function computeActionCentroid(u, v, gw, gh) {
    let sumW = 0, sumX = 0, sumY = 0;
    for (let j = 0; j < gh; j++) {
        const row = j * gw;
        const ny = (j / Math.max(1, gh - 1)) * 2 - 1;
        for (let i = 0; i < gw; i++) {
            const nx = (i / Math.max(1, gw - 1)) * 2 - 1;
            const idx = row + i;
            const mag = Math.sqrt(u[idx] * u[idx] + v[idx] * v[idx]);
            sumW += mag;
            sumX += nx * mag;
            sumY += ny * mag;
        }
    }
    if (sumW < 1e-4)
        return { centroidX: 0, centroidY: 0 };
    return {
        centroidX: Math.max(-1, Math.min(1, sumX / sumW)),
        centroidY: Math.max(-1, Math.min(1, sumY / sumW)),
    };
}
export class OpticalFlowEngine {
    width = 160;
    height = 90;
    fps = 30;
    sensitivity = 0.62;
    gridStep = 4;
    winRadius = 3;
    prevGray = null;
    currGray = null;
    prevLab = null;
    vectors = [];
    peakDetector = new PeakDetector();
    init(options) {
        this.width = options.width || 160;
        this.height = options.height || 90;
        this.fps = options.fps || 30;
        this.sensitivity = options.sensitivity ?? 0.62;
        this.gridStep = options.gridStep || 4;
        this.winRadius = options.winRadius || 3;
        this.prevGray = null;
        this.currGray = null;
        this.prevLab = null;
        this.vectors = [];
        this.peakDetector.setSensitivity(this.sensitivity);
    }
    processFrame(frameIndex, timeMs, rgbaData, totalFrames) {
        if (!this.currGray) {
            this.currGray = new Float32Array(this.width * this.height);
        }
        if (!this.prevGray) {
            this.prevGray = new Float32Array(this.width * this.height);
        }
        rgbaToGrayscale(rgbaData, this.width, this.height, this.currGray);
        const currLab = computeFrameMeanLab(rgbaData, this.width, this.height);
        const deltaE = this.prevLab ? computeDeltaE(this.prevLab, currLab) : 0;
        this.prevLab = currLab;
        let energy = 0;
        let div = 0;
        let curl = 0;
        let cx = 0;
        let cy = 0;
        if (frameIndex > 0) {
            const flow = computeDensePyramidalLK(this.prevGray, this.currGray, this.width, this.height, this.gridStep, this.winRadius);
            const count = flow.gw * flow.gh;
            energy = computeKineticEnergy(flow.u, flow.v, count);
            const divCurl = computeDivergenceAndCurl(flow.u, flow.v, flow.gw, flow.gh);
            div = divCurl.divergence;
            curl = divCurl.curl;
            const centroid = computeActionCentroid(flow.u, flow.v, flow.gw, flow.gh);
            cx = centroid.centroidX;
            cy = centroid.centroidY;
        }
        this.prevGray.set(this.currGray);
        const vector = {
            timeMs: Math.round(timeMs),
            frameIndex,
            kineticEnergy: Number(energy.toFixed(4)),
            divergence: Number(div.toFixed(4)),
            curl: Number(curl.toFixed(4)),
            centroidX: Number(cx.toFixed(3)),
            centroidY: Number(cy.toFixed(3)),
            deltaColorLAB: Number(deltaE.toFixed(2)),
            isSceneCut: deltaE > 12.0,
        };
        this.vectors.push(vector);
        return {
            vector,
            progress: {
                frameIndex,
                totalFrames,
                percent: Math.min(100, Math.round(((frameIndex + 1) / totalFrames) * 100)),
            },
        };
    }
    finish() {
        const detectedImpacts = this.peakDetector.detect(this.vectors);
        const durationSeconds = this.vectors.length > 0
            ? (this.vectors[this.vectors.length - 1].timeMs / 1000)
            : 0;
        return {
            durationSeconds: Number(durationSeconds.toFixed(3)),
            fps: this.fps,
            totalFrames: this.vectors.length,
            sampleRateHz: 10,
            summary: this.vectors,
            detectedImpacts,
        };
    }
    reset() {
        this.prevGray = null;
        this.currGray = null;
        this.prevLab = null;
        this.vectors = [];
    }
}
// Worker message protocol listener
const engine = new OpticalFlowEngine();
if (typeof self !== 'undefined') {
    self.onmessage = (e) => {
        const data = e.data;
        if (!data || !data.action)
            return;
        try {
            switch (data.action) {
                case 'INIT': {
                    engine.init(data);
                    break;
                }
                case 'PROCESS_FRAME': {
                    const res = engine.processFrame(data.frameIndex, data.timeMs, data.imageData, data.totalFrames);
                    self.postMessage({ type: 'PROGRESS', ...res.progress });
                    self.postMessage({ type: 'FRAME_TELEMETRY', vector: res.vector });
                    break;
                }
                case 'FINISH': {
                    const telemetry = engine.finish();
                    self.postMessage({ type: 'ANALYSIS_COMPLETE', telemetry });
                    break;
                }
                case 'RESET': {
                    engine.reset();
                    break;
                }
            }
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            self.postMessage({ type: 'ERROR', error });
        }
    };
}

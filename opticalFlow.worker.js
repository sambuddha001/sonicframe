/**
 * SONICFRAME - Optical Flow Telemetry Web Worker
 *
 * Implements high-performance dense Lucas-Kanade / Pyramidal optical flow,
 * visual kinetic energy integration, vector divergence, vector curl,
 * action motion centroid for stereo panning, 2nd-order transient impact acceleration,
 * and CIELAB color-temperature shift detection.
 *
 * Specifications: SONICFRAME_ARCHITECTURE.pdf Layer E & PS.txt
 */

(function () {
  'use strict';

  // --- CIELAB (CIE L*a*b* D65) Color Space Calculations ---
  function rgbToCielab(r255, g255, b255) {
    const r = r255 / 255;
    const g = g255 / 255;
    const b = b255 / 255;

    // Linearize sRGB companding
    const rLin = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    const gLin = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    const bLin = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    // Convert Linear sRGB to CIE XYZ (D65 standard illuminant)
    const X = (rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375) / 0.95047;
    const Y = (rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.0721750) / 1.00000;
    const Z = (rLin * 0.0193339 + gLin * 0.1191920 + bLin * 0.9503041) / 1.08883;

    // XYZ to CIELAB transfer function
    const delta = 6 / 29;
    const delta3 = delta * delta * delta; // ~0.00885645
    const fx = X > delta3 ? Math.cbrt(X) : (X / (3 * delta * delta)) + (4 / 29);
    const fy = Y > delta3 ? Math.cbrt(Y) : (Y / (3 * delta * delta)) + (4 / 29);
    const fz = Z > delta3 ? Math.cbrt(Z) : (Z / (3 * delta * delta)) + (4 / 29);

    const L = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const bLab = 200 * (fy - fz);

    return { L, a, b: bLab };
  }

  function computeFrameMeanLab(rgbaData, width, height, sampleStep = 2) {
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

    if (count === 0) return { L: 50, a: 0, b: 0 };
    return {
      L: sumL / count,
      a: sumA / count,
      b: sumB / count
    };
  }

  function computeDeltaE(lab1, lab2) {
    if (!lab1 || !lab2) return 0;
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  // --- Image Processing & Pyramidal Lucas-Kanade Engine ---
  function rgbaToGrayscale(rgbaData, width, height, outGray) {
    const totalPixels = width * height;
    for (let i = 0, j = 0; i < totalPixels; i++, j += 4) {
      outGray[i] = 0.299 * rgbaData[j] + 0.587 * rgbaData[j + 1] + 0.114 * rgbaData[j + 2];
    }
  }

  function downsample2x(src, w, h) {
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
        dst[rowDst + x] = 0.25 * (
          src[rowSrc0 + sx] +
          src[rowSrc0 + sx + 1] +
          src[rowSrc1 + sx] +
          src[rowSrc1 + sx + 1]
        );
      }
    }

    return { data: dst, w: nw, h: nh };
  }

  function sampleBilinear(img, w, h, x, y) {
    if (x <= 0) x = 0;
    if (x >= w - 1) x = w - 1.0001;
    if (y <= 0) y = 0;
    if (y >= h - 1) y = h - 1.0001;

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

  function computeSpatialGradients(gray, w, h, outIx, outIy) {
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

  // Multi-Scale Lucas-Kanade Dense Optical Flow
  function computeDensePyramidalLK(prevGray, currGray, width, height, gridStep = 4, winRadius = 3) {
    const Gw = Math.floor((width - 2 * winRadius) / gridStep);
    const Gh = Math.floor((height - 2 * winRadius) / gridStep);
    const u = new Float32Array(Gw * Gh);
    const v = new Float32Array(Gw * Gh);

    // Build 2-level pyramid for coarse-to-fine estimation
    const l1_prev_obj = downsample2x(prevGray, width, height);
    const l1_curr_obj = downsample2x(currGray, width, height);
    const l1_prev = l1_prev_obj.data;
    const l1_curr = l1_curr_obj.data;
    const w1 = l1_prev_obj.w;
    const h1 = l1_prev_obj.h;

    // Gradients on level 1
    const Ix1 = new Float32Array(w1 * h1);
    const Iy1 = new Float32Array(w1 * h1);
    computeSpatialGradients(l1_prev, w1, h1, Ix1, Iy1);

    // Gradients on level 0
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

        // Level 1 iterations (coarse scale)
        let uL1 = 0, vL1 = 0;
        for (let iter = 0; iter < 2; iter++) {
          let Gxx = 0, Gyy = 0, Gxy = 0, bx = 0, by = 0;
          for (let dy = -r1; dy <= r1; dy++) {
            const y = Math.round(pY1 + dy);
            if (y <= 0 || y >= h1 - 1) continue;
            const row = y * w1;
            for (let dx = -r1; dx <= r1; dx++) {
              const x = Math.round(pX1 + dx);
              if (x <= 0 || x >= w1 - 1) continue;
              const idx = row + x;
              const ix = Ix1[idx];
              const iy = Iy1[idx];
              const currVal = sampleBilinear(l1_curr, w1, h1, x + uL1, y + vL1);
              const it = currVal - l1_prev[idx];

              Gxx += ix * ix;
              Gyy += iy * iy;
              Gxy += ix * iy;
              bx += ix * it;
              by += iy * it;
            }
          }
          const det = (Gxx + lambda) * (Gyy + lambda) - Gxy * Gxy;
          if (det > 1e-5) {
            const du = (-bx * (Gyy + lambda) + by * Gxy) / det;
            const dv = (-by * (Gxx + lambda) + bx * Gxy) / det;
            uL1 += Math.max(-10, Math.min(10, du));
            vL1 += Math.max(-10, Math.min(10, dv));
          }
        }

        // Upsample coarse displacement to fine level (scale by 2)
        let uL0 = uL1 * 2;
        let vL0 = vL1 * 2;

        // Level 0 iterations (fine scale refinement)
        for (let iter = 0; iter < 2; iter++) {
          let Gxx = 0, Gyy = 0, Gxy = 0, bx = 0, by = 0;
          for (let dy = -winRadius; dy <= winRadius; dy++) {
            const y = pY0 + dy;
            if (y <= 0 || y >= height - 1) continue;
            const row = y * width;
            for (let dx = -winRadius; dx <= winRadius; dx++) {
              const x = pX0 + dx;
              if (x <= 0 || x >= width - 1) continue;
              const idx = row + x;
              const ix = Ix0[idx];
              const iy = Iy0[idx];
              const currVal = sampleBilinear(currGray, width, height, x + uL0, y + vL0);
              const it = currVal - prevGray[idx];

              Gxx += ix * ix;
              Gyy += iy * iy;
              Gxy += ix * iy;
              bx += ix * it;
              by += iy * it;
            }
          }
          const det = (Gxx + lambda) * (Gyy + lambda) - Gxy * Gxy;
          if (det > 1e-5) {
            const du = (-bx * (Gyy + lambda) + by * Gxy) / det;
            const dv = (-by * (Gxx + lambda) + bx * Gxy) / det;
            uL0 += Math.max(-12, Math.min(12, du));
            vL0 += Math.max(-12, Math.min(12, dv));
          }
        }

        u[gIdx] = uL0;
        v[gIdx] = vL0;
      }
    }

    return { Gw, Gh, u, v };
  }

  // --- Kinetic & Vector Field Mathematical Operators ---

  /**
   * Kinetic Energy Integral:
   * E(t) = (1 / (W * H)) * sum(u^2 + v^2)
   */
  function computeKineticEnergy(u, v) {
    let sum = 0;
    const len = u.length;
    for (let i = 0; i < len; i++) {
      sum += u[i] * u[i] + v[i] * v[i];
    }
    return len > 0 ? sum / len : 0;
  }

  /**
   * Vector Divergence & Curl across the flow grid:
   * Div(t) = (1 / N) * sum(du/dx + dv/dy)   [captures camera push/pull & zoom expansion]
   * Curl(t) = (1 / N) * sum(dv/dx - du/dy)  [captures rotational torque & turbulence]
   */
  function computeDivergenceAndCurl(u, v, Gw, Gh, gridStep) {
    let divSum = 0;
    let curlSum = 0;
    let count = 0;

    for (let j = 1; j < Gh - 1; j++) {
      for (let i = 1; i < Gw - 1; i++) {
        const idxR = j * Gw + (i + 1);
        const idxL = j * Gw + (i - 1);
        const idxD = (j + 1) * Gw + i;
        const idxU = (j - 1) * Gw + i;

        // Central differences normalized by grid spacing
        const du_dx = (u[idxR] - u[idxL]) / (2 * gridStep);
        const dv_dy = (v[idxD] - v[idxU]) / (2 * gridStep);
        const dv_dx = (v[idxR] - v[idxL]) / (2 * gridStep);
        const du_dy = (u[idxD] - u[idxU]) / (2 * gridStep);

        divSum += (du_dx + dv_dy);
        curlSum += (dv_dx - du_dy);
        count++;
      }
    }

    return {
      divergence: count > 0 ? divSum / count : 0,
      curl: count > 0 ? curlSum / count : 0
    };
  }

  /**
   * Action Motion Centroid:
   * (centroidX, centroidY) normalized from -1.0 (left/top) to +1.0 (right/bottom),
   * weighted by kinetic energy (u^2 + v^2), for dynamic stereo panning.
   */
  function computeActionCentroid(u, v, Gw, Gh) {
    let sumEnergy = 0;
    let sumWeightedI = 0;
    let sumWeightedJ = 0;

    for (let j = 0; j < Gh; j++) {
      for (let i = 0; i < Gw; i++) {
        const idx = j * Gw + i;
        const e = u[idx] * u[idx] + v[idx] * v[idx];
        sumEnergy += e;
        sumWeightedI += i * e;
        sumWeightedJ += j * e;
      }
    }

    if (sumEnergy < 1e-6 || Gw <= 1 || Gh <= 1) {
      return { centroidX: 0, centroidY: 0 };
    }

    const meanI = sumWeightedI / sumEnergy;
    const meanJ = sumWeightedJ / sumEnergy;

    const centroidX = Math.max(-1.0, Math.min(1.0, (2 * meanI - (Gw - 1)) / (Gw - 1)));
    const centroidY = Math.max(-1.0, Math.min(1.0, (2 * meanJ - (Gh - 1)) / (Gh - 1)));

    return { centroidX, centroidY };
  }

  /**
   * Transient Impact Acceleration:
   * 2nd-order derivative I(t) = d^2E/dt^2 = E(t+1) - 2E(t) + E(t-1)
   * Triggers impact when I(t) < -theta_impact and E(t) > mu_E + k * sigma_E (shock arrest)
   */
  function detectImpacts(vectors, sensitivity = 0.7) {
    const N = vectors.length;
    if (N < 3) return [];

    let sumE = 0;
    for (let i = 0; i < N; i++) sumE += vectors[i].energy;
    const mu_E = sumE / N;

    let sumSqDiff = 0;
    for (let i = 0; i < N; i++) {
      const diff = vectors[i].energy - mu_E;
      sumSqDiff += diff * diff;
    }
    const sigma_E = Math.sqrt(sumSqDiff / N);

    // Compute second derivatives
    const I = new Float32Array(N);
    for (let t = 1; t < N - 1; t++) {
      I[t] = vectors[t + 1].energy - 2 * vectors[t].energy + vectors[t - 1].energy;
      vectors[t].secondDerivative = I[t];
    }
    vectors[0].secondDerivative = 0;
    vectors[N - 1].secondDerivative = 0;

    // Thresholds calibrated by sensitivity
    const s = Math.max(0.0, Math.min(1.0, sensitivity));
    const k = Math.max(0.1, 1.2 - 0.8 * s);
    const minEnergy = mu_E + k * sigma_E;
    const theta_impact = Math.max(0.0005, (0.35 - 0.22 * s) * Math.max(sigma_E, 0.01));

    const candidates = [];
    for (let t = 1; t < N - 1; t++) {
      const v = vectors[t];
      // Shock arrest criterion: sharp negative curvature & high energy
      if (I[t] < -theta_impact && v.energy > minEnergy) {
        const isPeak = (v.energy >= vectors[t - 1].energy && v.energy >= vectors[t + 1].energy) ||
                       (I[t] <= I[t - 1] && I[t] <= I[t + 1]);
        if (isPeak) {
          const confidence = Math.min(1.0, (Math.abs(I[t]) / theta_impact) * (v.energy / (minEnergy || 1)) * 0.5);
          candidates.push({
            frameIndex: v.frameIndex,
            timeMs: v.timeMs,
            energy: v.energy,
            secondDerivative: I[t],
            centroidX: v.centroidX,
            centroidY: v.centroidY,
            confidence
          });
        }
      }
    }

    // Temporal Non-Maximum Suppression within 160ms window
    const suppressed = [];
    const minIntervalMs = 160;
    for (const cand of candidates) {
      const prev = suppressed[suppressed.length - 1];
      if (!prev || (cand.timeMs - prev.timeMs > minIntervalMs)) {
        suppressed.push(cand);
      } else {
        if (Math.abs(cand.secondDerivative) > Math.abs(prev.secondDerivative)) {
          suppressed[suppressed.length - 1] = cand;
        }
      }
    }

    return suppressed;
  }

  // --- OpticalFlowEngine Class ---
  class OpticalFlowEngine {
    constructor() {
      this.width = 160;
      this.height = 90;
      this.fps = 30;
      this.sensitivity = 0.7;
      this.gridStep = 4;
      this.winRadius = 3;

      this.prevGray = null;
      this.currGray = null;
      this.prevLab = null;

      this.vectors = [];
      this.initialized = false;
    }

    init(config = {}) {
      this.width = config.width || 160;
      this.height = config.height || 90;
      this.fps = config.fps || 30;
      this.sensitivity = config.sensitivity !== undefined
        ? (config.sensitivity > 1 ? config.sensitivity / 100 : config.sensitivity)
        : 0.7;
      this.gridStep = config.gridStep || 4;
      this.winRadius = config.winRadius || 3;

      this.prevGray = new Float32Array(this.width * this.height);
      this.currGray = new Float32Array(this.width * this.height);
      this.prevLab = null;
      this.vectors = [];
      this.initialized = true;
    }

    reset() {
      if (this.prevGray) this.prevGray.fill(0);
      if (this.currGray) this.currGray.fill(0);
      this.prevLab = null;
      this.vectors = [];
    }

    processFrame({ frameIndex, timeMs, imageData, totalFrames }) {
      if (!this.initialized) {
        throw new Error('OpticalFlowEngine not initialized. Call init() first.');
      }

      // Resolve raw RGBA byte buffer
      let rawData;
      if (imageData instanceof Uint8ClampedArray || imageData instanceof Uint8Array) {
        rawData = imageData;
      } else if (imageData && imageData.data) {
        rawData = imageData.data;
      } else if (imageData && imageData.buffer) {
        rawData = new Uint8ClampedArray(imageData.buffer);
      } else {
        throw new Error('Unsupported imageData format in processFrame');
      }

      const tMs = timeMs !== undefined ? timeMs : (frameIndex * 1000) / this.fps;

      // 1. Compute frame mean CIELAB & Delta-E
      const currentLab = computeFrameMeanLab(rawData, this.width, this.height, 2);
      const deltaE = this.prevLab ? computeDeltaE(currentLab, this.prevLab) : 0;
      this.prevLab = currentLab;

      // 2. Convert to Grayscale
      rgbaToGrayscale(rawData, this.width, this.height, this.currGray);

      let energy = 0;
      let divergence = 0;
      let curl = 0;
      let centroidX = 0;
      let centroidY = 0;
      let Gw = Math.floor((this.width - 2 * this.winRadius) / this.gridStep);
      let Gh = Math.floor((this.height - 2 * this.winRadius) / this.gridStep);
      let u = new Float32Array(Gw * Gh);
      let v = new Float32Array(Gw * Gh);

      // If we have a preceding frame, compute true dense optical flow
      if (frameIndex > 0 && this.prevGray) {
        const flow = computeDensePyramidalLK(
          this.prevGray,
          this.currGray,
          this.width,
          this.height,
          this.gridStep,
          this.winRadius
        );
        Gw = flow.Gw;
        Gh = flow.Gh;
        u = flow.u;
        v = flow.v;

        energy = computeKineticEnergy(u, v);
        const divCurl = computeDivergenceAndCurl(u, v, Gw, Gh, this.gridStep);
        divergence = divCurl.divergence;
        curl = divCurl.curl;

        const centroid = computeActionCentroid(u, v, Gw, Gh);
        centroidX = centroid.centroidX;
        centroidY = centroid.centroidY;
      }

      // Cycle grayscale buffers
      const temp = this.prevGray;
      this.prevGray = this.currGray;
      this.currGray = temp;

      const vector = {
        frameIndex,
        timeMs: tMs,
        energy,
        divergence,
        curl,
        centroidX,
        centroidY,
        colorLab: { L: currentLab.L, a: currentLab.a, b: currentLab.b },
        deltaE,
        flowGrid: {
          width: Gw,
          height: Gh,
          u,
          v
        }
      };

      this.vectors.push(vector);

      // Calculate progress percentage if totalFrames is known
      const total = totalFrames || 0;
      const percent = total > 0 ? Math.min(100, Math.round(((frameIndex + 1) / total) * 100)) : 0;

      return {
        vector,
        progress: {
          frameIndex,
          totalFrames: total,
          percent
        }
      };
    }

    finish() {
      const detectedImpacts = detectImpacts(this.vectors, this.sensitivity);

      // Summary metrics
      let totalEnergy = 0;
      let maxEnergy = 0;
      let shiftCount = 0;
      const shiftThreshold = 6.0; // Perceptually noticeable CIELAB Delta-E threshold

      for (let i = 0; i < this.vectors.length; i++) {
        const v = this.vectors[i];
        totalEnergy += v.energy;
        if (v.energy > maxEnergy) maxEnergy = v.energy;
        if (v.deltaE > shiftThreshold) shiftCount++;
      }

      const totalFrames = this.vectors.length;
      const avgEnergy = totalFrames > 0 ? totalEnergy / totalFrames : 0;
      const durationMs = totalFrames > 0 ? this.vectors[totalFrames - 1].timeMs : 0;

      const summary = {
        totalFrames,
        durationMs,
        avgEnergy,
        maxEnergy,
        impactCount: detectedImpacts.length,
        shiftCount
      };

      return {
        vectors: this.vectors,
        detectedImpacts,
        summary
      };
    }
  }

  // --- Web Worker / Node.js Worker & Module Interface ---
  const engine = new OpticalFlowEngine();

  function handleMessage(data) {
    if (!data || !data.action) return;

    try {
      switch (data.action) {
        case 'INIT': {
          engine.init({
            width: data.width,
            height: data.height,
            fps: data.fps,
            sensitivity: data.sensitivity,
            gridStep: data.gridStep,
            winRadius: data.winRadius
          });
          break;
        }

        case 'PROCESS_FRAME': {
          const res = engine.processFrame({
            frameIndex: data.frameIndex,
            timeMs: data.timeMs,
            imageData: data.imageData,
            totalFrames: data.totalFrames
          });

          // Dispatch PROGRESS
          postReply({
            type: 'PROGRESS',
            frameIndex: res.progress.frameIndex,
            totalFrames: res.progress.totalFrames,
            percent: res.progress.percent
          });

          // Dispatch FRAME_TELEMETRY
          postReply({
            type: 'FRAME_TELEMETRY',
            vector: res.vector
          });
          break;
        }

        case 'FINISH': {
          const telemetry = engine.finish();
          postReply({
            type: 'ANALYSIS_COMPLETE',
            telemetry
          });
          break;
        }

        case 'RESET': {
          engine.reset();
          break;
        }

        default:
          console.warn('[OpticalFlowWorker] Unknown action:', data.action);
      }
    } catch (err) {
      postReply({
        type: 'ERROR',
        error: err.message,
        stack: err.stack
      });
    }
  }

  function postReply(msg) {
    if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
      self.postMessage(msg);
    } else if (typeof parentPort !== 'undefined' && parentPort) {
      parentPort.postMessage(msg);
    }
  }

  // Browser Web Worker entry
  if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.onmessage = function (e) {
      handleMessage(e.data);
    };
  }

  const exported = {
    OpticalFlowEngine,
    rgbToCielab,
    computeFrameMeanLab,
    computeDeltaE,
    computeDensePyramidalLK,
    computeKineticEnergy,
    computeDivergenceAndCurl,
    computeActionCentroid,
    detectImpacts,
    handleMessage
  };

  // Node.js worker_threads or commonjs/global exports for unit tests
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.SonicFrameWorkerEngine = exported;
    globalThis.OpticalFlowEngine = OpticalFlowEngine;
  }
})();

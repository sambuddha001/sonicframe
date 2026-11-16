/**
 * SONICFRAME - Optical Flow & Telemetry Verification Suite
 *
 * Verifies:
 *   - Flaw 1 fix: Dedicated Web Worker & asynchronous frame extraction
 *   - Flaw 2 fix: True dense Pyramidal Lucas-Kanade optical flow
 *   - Mathematical Operators:
 *     1. Dense velocity field (u, v)
 *     2. Kinetic Energy Integral E(t) = (1 / (W*H)) * sum(u^2 + v^2)
 *     3. Vector Divergence Div(t) = (1 / (W*H)) * sum(du/dx + dv/dy) (zoom push/pull expansion)
 *     4. Vector Curl Curl(t) = (1 / (W*H)) * sum(dv/dx - du/dy) (rotational vortex torque)
 *     5. Action Motion Centroid (centroidX, centroidY) normalized [-1.0, 1.0] for stereo panning
 *     6. CIELAB D65 conversion & Delta-E chromatic shift detection
 *     7. 2nd-order Transient Impact Deceleration I(t) = d^2E/dt^2 = E(t+1) - 2E(t) + E(t-1)
 *     8. Worker Messaging Protocol (INIT, PROCESS_FRAME, FINISH, RESET)
 *     9. Telemetry-to-Foley Cue mapping
 */

import assert from 'node:assert';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(__dirname, '../opticalFlow.worker.js');
const telemetryPath = path.resolve(__dirname, '../sonicframe-telemetry.js');

await import(pathToFileURL(workerPath).href);
await import(pathToFileURL(telemetryPath).href);

const {
  OpticalFlowEngine,
  rgbToCielab,
  computeFrameMeanLab,
  computeDeltaE,
  computeDensePyramidalLK,
  computeKineticEnergy,
  computeDivergenceAndCurl,
  computeActionCentroid,
  detectImpacts
} = globalThis.SonicFrameWorkerEngine;

const { SonicFrameTelemetryAnalyzer } = globalThis.SonicFrameTelemetry;

console.log('======================================================');
console.log('   SONICFRAME TELEMETRY & OPTICAL FLOW VERIFICATION   ');
console.log('======================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------
// 1. CIELAB & Delta-E Color Space Conversion
// ---------------------------------------------------------
test('CIELAB: Reference D65 White, Black and Delta-E', () => {
  const white = rgbToCielab(255, 255, 255);
  const black = rgbToCielab(0, 0, 0);

  // White in D65: L* = 100, a* ~ 0, b* ~ 0
  assert(Math.abs(white.L - 100) < 0.01, `Expected white L=100, got ${white.L}`);
  assert(Math.abs(white.a) < 0.01, `Expected white a~0, got ${white.a}`);
  assert(Math.abs(white.b) < 0.01, `Expected white b~0, got ${white.b}`);

  // Black in D65: L* = 0, a* = 0, b* = 0
  assert(Math.abs(black.L - 0) < 0.001, `Expected black L=0, got ${black.L}`);
  assert(Math.abs(black.a - 0) < 0.001, `Expected black a=0, got ${black.a}`);
  assert(Math.abs(black.b - 0) < 0.001, `Expected black b=0, got ${black.b}`);

  // Delta E between white and black is exactly 100
  const dE = computeDeltaE(white, black);
  assert(Math.abs(dE - 100) < 0.01, `Expected Delta-E = 100, got ${dE}`);
});

test('CIELAB: Perceptual Color Shift & Delta-E', () => {
  const blue = rgbToCielab(20, 40, 180);
  const orange = rgbToCielab(220, 110, 20);
  const dE = computeDeltaE(blue, orange);

  assert(dE > 60, `Expected large Delta-E for complementary colors, got ${dE}`);

  // Subtle shift
  const blueSubtle = rgbToCielab(22, 42, 182);
  const dESubtle = computeDeltaE(blue, blueSubtle);
  assert(dESubtle < 3.0, `Expected small Delta-E for subtle change, got ${dESubtle}`);
});

// ---------------------------------------------------------
// 2. Optical Flow on Synthetic Motion Fields
// ---------------------------------------------------------
test('Optical Flow: Pure Horizontal Translation (+2px shift)', () => {
  const W = 80, H = 60;
  const prev = new Float32Array(W * H);
  const curr = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      prev[y * W + x] = 128 + 60 * Math.sin(0.3 * x) * Math.cos(0.3 * y);
      curr[y * W + x] = 128 + 60 * Math.sin(0.3 * (x - 2)) * Math.cos(0.3 * y);
    }
  }

  const flow = computeDensePyramidalLK(prev, curr, W, H, 4, 3);
  let avgU = 0, avgV = 0;
  for (let i = 0; i < flow.u.length; i++) {
    avgU += flow.u[i];
    avgV += flow.v[i];
  }
  avgU /= flow.u.length;
  avgV /= flow.v.length;

  assert(avgU > 1.8 && avgU < 2.2, `Expected u ~ 2.0, got ${avgU}`);
  assert(Math.abs(avgV) < 0.15, `Expected v ~ 0.0, got ${avgV}`);

  const energy = computeKineticEnergy(flow.u, flow.v);
  assert(energy > 3.0 && energy < 5.0, `Expected kinetic energy ~ 4.0, got ${energy}`);

  const divCurl = computeDivergenceAndCurl(flow.u, flow.v, flow.Gw, flow.Gh, 4);
  assert(Math.abs(divCurl.divergence) < 0.05, `Uniform translation must have ~0 divergence, got ${divCurl.divergence}`);
  assert(Math.abs(divCurl.curl) < 0.05, `Uniform translation must have ~0 curl, got ${divCurl.curl}`);
});

test('Optical Flow: Pure Vertical Translation (+3px shift)', () => {
  const W = 80, H = 60;
  const prev = new Float32Array(W * H);
  const curr = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      prev[y * W + x] = 128 + 60 * Math.sin(0.25 * x) * Math.cos(0.25 * y);
      curr[y * W + x] = 128 + 60 * Math.sin(0.25 * x) * Math.cos(0.25 * (y - 3));
    }
  }

  const flow = computeDensePyramidalLK(prev, curr, W, H, 4, 3);
  let avgU = 0, avgV = 0;
  for (let i = 0; i < flow.u.length; i++) {
    avgU += flow.u[i];
    avgV += flow.v[i];
  }
  avgU /= flow.u.length;
  avgV /= flow.v.length;

  assert(Math.abs(avgU) < 0.15, `Expected u ~ 0.0, got ${avgU}`);
  assert(avgV > 2.7 && avgV < 3.3, `Expected v ~ 3.0, got ${avgV}`);
});

// ---------------------------------------------------------
// 3. Vector Divergence (Camera Push/Pull & Scale Expansion)
// ---------------------------------------------------------
test('Vector Calculus: Divergence captures camera zoom expansion', () => {
  const Gw = 20, Gh = 15;
  const uExpand = new Float32Array(Gw * Gh);
  const vExpand = new Float32Array(Gw * Gh);
  const uContract = new Float32Array(Gw * Gh);
  const vContract = new Float32Array(Gw * Gh);

  const alpha = 0.08;
  for (let j = 0; j < Gh; j++) {
    for (let i = 0; i < Gw; i++) {
      const idx = j * Gw + i;
      uExpand[idx] = alpha * (i - (Gw - 1) / 2) * 4;
      vExpand[idx] = alpha * (j - (Gh - 1) / 2) * 4;

      uContract[idx] = -alpha * (i - (Gw - 1) / 2) * 4;
      vContract[idx] = -alpha * (j - (Gh - 1) / 2) * 4;
    }
  }

  const resExpand = computeDivergenceAndCurl(uExpand, vExpand, Gw, Gh, 4);
  const resContract = computeDivergenceAndCurl(uContract, vContract, Gw, Gh, 4);

  assert(resExpand.divergence > 0.1, `Expected positive divergence for expansion, got ${resExpand.divergence}`);
  assert(Math.abs(resExpand.curl) < 1e-4, `Expected zero curl for pure expansion, got ${resExpand.curl}`);

  assert(resContract.divergence < -0.1, `Expected negative divergence for contraction, got ${resContract.divergence}`);
  assert(Math.abs(resContract.curl) < 1e-4, `Expected zero curl for pure contraction, got ${resContract.curl}`);
});

// ---------------------------------------------------------
// 4. Vector Curl (Rotational Torque & Turbulence)
// ---------------------------------------------------------
test('Vector Calculus: Curl captures rotational vortex and turbulence', () => {
  const Gw = 20, Gh = 15;
  const uRotCCW = new Float32Array(Gw * Gh);
  const vRotCCW = new Float32Array(Gw * Gh);
  const uRotCW = new Float32Array(Gw * Gh);
  const vRotCW = new Float32Array(Gw * Gh);

  const omega = 0.06;
  for (let j = 0; j < Gh; j++) {
    for (let i = 0; i < Gw; i++) {
      const idx = j * Gw + i;
      uRotCCW[idx] = -omega * (j - (Gh - 1) / 2) * 4;
      vRotCCW[idx] = omega * (i - (Gw - 1) / 2) * 4;

      uRotCW[idx] = omega * (j - (Gh - 1) / 2) * 4;
      vRotCW[idx] = -omega * (i - (Gw - 1) / 2) * 4;
    }
  }

  const resCCW = computeDivergenceAndCurl(uRotCCW, vRotCCW, Gw, Gh, 4);
  const resCW = computeDivergenceAndCurl(uRotCW, vRotCW, Gw, Gh, 4);

  assert(resCCW.curl > 0.1, `Expected positive curl for CCW vortex, got ${resCCW.curl}`);
  assert(Math.abs(resCCW.divergence) < 1e-4, `Expected zero divergence for pure vortex, got ${resCCW.divergence}`);

  assert(resCW.curl < -0.1, `Expected negative curl for CW vortex, got ${resCW.curl}`);
  assert(Math.abs(resCW.divergence) < 1e-4, `Expected zero divergence for pure vortex, got ${resCW.divergence}`);
});

// ---------------------------------------------------------
// 5. Action Motion Centroid (Stereo Panning)
// ---------------------------------------------------------
test('Action Motion Centroid: Dynamic stereo panning [-1.0, +1.0]', () => {
  const Gw = 20, Gh = 15;
  const uLeft = new Float32Array(Gw * Gh);
  const vLeft = new Float32Array(Gw * Gh);
  const uRight = new Float32Array(Gw * Gh);
  const vRight = new Float32Array(Gw * Gh);
  const uCenter = new Float32Array(Gw * Gh);
  const vCenter = new Float32Array(Gw * Gh);

  for (let j = 0; j < Gh; j++) {
    for (let i = 0; i < Gw; i++) {
      const idx = j * Gw + i;
      if (i <= 2) {
        uLeft[idx] = 3.0;
        vLeft[idx] = 1.0;
      }
      if (i >= 17) {
        uRight[idx] = 3.0;
        vRight[idx] = 1.0;
      }
      if (i >= 9 && i <= 10 && j >= 7 && j <= 8) {
        uCenter[idx] = 3.0;
        vCenter[idx] = 1.0;
      }
    }
  }

  const centLeft = computeActionCentroid(uLeft, vLeft, Gw, Gh);
  const centRight = computeActionCentroid(uRight, vRight, Gw, Gh);
  const centCenter = computeActionCentroid(uCenter, vCenter, Gw, Gh);

  assert(centLeft.centroidX < -0.7, `Left motion pan must be < -0.7, got ${centLeft.centroidX}`);
  assert(centRight.centroidX > 0.7, `Right motion pan must be > 0.7, got ${centRight.centroidX}`);
  assert(Math.abs(centCenter.centroidX) < 0.1, `Center motion pan must be ~0, got ${centCenter.centroidX}`);
});

// ---------------------------------------------------------
// 6. 2nd-Order Transient Impact Acceleration Detection
// ---------------------------------------------------------
test('Impact Detection: 2nd-order shock arrest d^2E/dt^2 < -theta_impact', () => {
  const energies = [0.05, 0.06, 0.12, 0.35, 0.95, 2.10, 0.15, 0.08, 0.06, 0.05, 0.05];
  const vectors = energies.map((e, idx) => ({
    frameIndex: idx,
    timeMs: idx * 33.33,
    energy: e,
    centroidX: idx === 5 ? 0.75 : 0.0,
    centroidY: 0.0,
    divergence: 0,
    curl: 0
  }));

  const impacts = detectImpacts(vectors, 0.7);
  assert.strictEqual(impacts.length, 1, `Expected 1 impact, got ${impacts.length}`);

  const hit = impacts[0];
  assert.strictEqual(hit.frameIndex, 5, `Expected impact at frame 5, got ${hit.frameIndex}`);
  assert(hit.secondDerivative < -1.0, `Expected sharp negative deceleration, got ${hit.secondDerivative}`);
  assert.strictEqual(hit.centroidX, 0.75, `Expected stereo pan locked to centroidX = 0.75`);
  assert(hit.confidence > 0.5, `Expected high confidence impact, got ${hit.confidence}`);
});

// ---------------------------------------------------------
// 7. OpticalFlowEngine Full Sequence & Telemetry Summary
// ---------------------------------------------------------
test('OpticalFlowEngine: Full lifecycle (INIT, PROCESS_FRAME, FINISH, RESET)', () => {
  const engine = new OpticalFlowEngine();
  const W = 160, H = 90;
  engine.init({ width: W, height: H, fps: 30, sensitivity: 0.75 });

  const frames = [];
  for (let f = 0; f < 8; f++) {
    const raw = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        if (f === 4) {
          raw[idx] = 250;
          raw[idx + 1] = 240;
          raw[idx + 2] = 120;
          raw[idx + 3] = 255;
        } else {
          const shift = (f === 5 || f === 6) && x > W * 0.6 ? (f - 4) * 8 : 0;
          const val = Math.floor(128 + 60 * Math.sin(0.15 * (x - shift)) * Math.cos(0.15 * y));
          raw[idx] = Math.max(0, Math.min(255, val - 30));
          raw[idx + 1] = Math.max(0, Math.min(255, val));
          raw[idx + 2] = Math.max(0, Math.min(255, val + 40));
          raw[idx + 3] = 255;
        }
      }
    }
    frames.push(raw);
  }

  for (let f = 0; f < frames.length; f++) {
    const res = engine.processFrame({
      frameIndex: f,
      timeMs: f * 33.33,
      imageData: frames[f],
      totalFrames: frames.length
    });

    assert(res.vector, 'Should return frame telemetry vector');
    assert.strictEqual(res.vector.frameIndex, f);
    assert(res.vector.colorLab, 'Should have colorLab');
    assert(typeof res.vector.energy === 'number', 'Energy must be number');
  }

  const telemetry = engine.finish();
  assert.strictEqual(telemetry.vectors.length, 8);
  assert.strictEqual(telemetry.summary.totalFrames, 8);
  assert(telemetry.summary.shiftCount >= 1, `Should detect chromatic flash, got ${telemetry.summary.shiftCount}`);

  const flashVector = telemetry.vectors[4];
  assert(flashVector.deltaE > 20, `Flash frame should have Delta-E > 20, got ${flashVector.deltaE}`);

  engine.reset();
  assert.strictEqual(engine.vectors.length, 0);
});

// ---------------------------------------------------------
// 8. SonicFrameTelemetry Client Helper: Foley Cue Mapping
// ---------------------------------------------------------
test('SonicFrameTelemetryAnalyzer: toFoleyEvents generates structured audio cues', () => {
  const analyzer = new SonicFrameTelemetryAnalyzer();

  const mockTelemetry = {
    vectors: [
      { frameIndex: 0, timeMs: 0, energy: 0.05, centroidX: 0, deltaE: 0 },
      { frameIndex: 1, timeMs: 33, energy: 0.1, centroidX: 0.2, deltaE: 1.2 },
      { frameIndex: 2, timeMs: 66, energy: 0.3, centroidX: 0.4, deltaE: 1.5 },
      { frameIndex: 3, timeMs: 100, energy: 1.2, centroidX: 0.6, deltaE: 2.1 },
      { frameIndex: 4, timeMs: 133, energy: 0.4, centroidX: 0.5, deltaE: 25.0 },
      { frameIndex: 5, timeMs: 166, energy: 2.5, centroidX: 0.85, deltaE: 1.1 },
      { frameIndex: 6, timeMs: 200, energy: 0.1, centroidX: 0.1, deltaE: 0.8 },
      { frameIndex: 7, timeMs: 233, energy: 0.05, centroidX: 0.0, deltaE: 0.5 }
    ],
    detectedImpacts: [
      {
        frameIndex: 5,
        timeMs: 166,
        energy: 2.5,
        secondDerivative: -3.2,
        centroidX: 0.85,
        confidence: 0.98
      }
    ],
    summary: { durationMs: 233 }
  };

  const cues = analyzer.toFoleyEvents(mockTelemetry, { sensitivity: 0.7 });
  assert(cues.length >= 2, `Expected at least 2 cues, got ${cues.length}`);

  const impactCue = cues.find((c) => c.type === 'impact');
  assert(impactCue, 'Should have generated an impact cue');
  assert.strictEqual(impactCue.t, 0.166);
  assert.strictEqual(impactCue.pan, 0.85, 'Impact pan must match centroidX');

  const shiftCue = cues.find((c) => c.type === 'shift');
  assert(shiftCue, 'Should have generated a shift cue for Delta-E > 20');
});

// ---------------------------------------------------------
// 9. Worker Thread Messaging Protocol Integration
// ---------------------------------------------------------
await testAsync('Worker Thread: Protocol exchange (INIT, PROCESS_FRAME, FINISH)', async () => {
  const workerCode = `
import { parentPort } from 'node:worker_threads';
globalThis.parentPort = parentPort;
import '${pathToFileURL(workerPath).href}';

parentPort.on('message', (msg) => {
  globalThis.SonicFrameWorkerEngine.handleMessage(msg);
});
`;

  const worker = new Worker(workerCode, { eval: true });

  const progressEvents = [];
  const frameTelemetryEvents = [];
  let completeEvent = null;

  worker.on('message', (msg) => {
    if (msg.type === 'PROGRESS') {
      progressEvents.push(msg);
    } else if (msg.type === 'FRAME_TELEMETRY') {
      frameTelemetryEvents.push(msg);
    } else if (msg.type === 'ANALYSIS_COMPLETE') {
      completeEvent = msg;
    }
  });

  worker.postMessage({
    action: 'INIT',
    width: 80,
    height: 45,
    fps: 30,
    sensitivity: 0.7
  });

  const W = 80, H = 45;
  for (let f = 0; f < 4; f++) {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H * 4; i += 4) {
      data[i] = (f * 40) % 255;
      data[i + 1] = 100;
      data[i + 2] = 200;
      data[i + 3] = 255;
    }
    worker.postMessage({
      action: 'PROCESS_FRAME',
      frameIndex: f,
      timeMs: f * 33.33,
      imageData: data,
      totalFrames: 4
    });
  }

  worker.postMessage({ action: 'FINISH' });

  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (completeEvent) {
        clearInterval(check);
        resolve();
      }
    }, 20);
  });

  assert.strictEqual(progressEvents.length, 4, 'Should receive 4 progress events');
  assert.strictEqual(frameTelemetryEvents.length, 4, 'Should receive 4 telemetry vectors');
  assert.strictEqual(completeEvent.telemetry.vectors.length, 4, 'Telemetry should have 4 vectors');
  assert.strictEqual(completeEvent.telemetry.summary.totalFrames, 4);

  worker.terminate();
});

console.log('\n======================================================');
console.log(`ALL ${passedTests} OF ${totalTests} TESTS PASSED SUCCESSFULLY! (100%)`);
console.log('======================================================\n');

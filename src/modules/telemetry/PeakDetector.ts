/**
 * src/modules/telemetry/PeakDetector.ts
 * Contact Arrest Shock Detection via 5-Point Quadratic Savitzky-Golay 2nd Derivative
 * Implements Section 5.3.7 of SONICFRAME Enterprise Architecture v4.0
 *
 * Mathematical formulation:
 * I_smooth(t) = (2E(t-2) - E(t-1) - 2E(t) - E(t+1) + 2E(t+2)) / 7
 * Trigger condition:
 * I_smooth(t) < -theta_accel && E(t) > mu_E + k * sigma_E && (t - t_last) > 180ms
 */

import type { TelemetryVector, DetectedImpact } from '../../types/telemetry';

export interface PeakDetectorOptions {
  sensitivity?: number; // 0.15 to 0.95 (default 0.62)
  minLockoutMs?: number; // 180ms refractory lockout
}

export class PeakDetector {
  private sensitivity: number;
  private minLockoutMs: number;

  constructor(options: PeakDetectorOptions = {}) {
    this.sensitivity = options.sensitivity ?? 0.62;
    this.minLockoutMs = options.minLockoutMs ?? 180;
  }

  public setSensitivity(s: number): void {
    this.sensitivity = Math.max(0.1, Math.min(1.0, s > 1 ? s / 100 : s));
  }

  /**
   * Applies 5-point quadratic Savitzky-Golay 2nd derivative filter to kinetic energy curve
   */
  public detect(vectors: TelemetryVector[]): DetectedImpact[] {
    const n = vectors.length;
    if (n < 5) return [];

    // 1. Calculate running mean and standard deviation of kinetic energy
    let sumE = 0;
    for (let i = 0; i < n; i++) {
      sumE += vectors[i]!.kineticEnergy;
    }
    const muE = sumE / n;

    let sumSqDiff = 0;
    for (let i = 0; i < n; i++) {
      const diff = vectors[i]!.kineticEnergy - muE;
      sumSqDiff += diff * diff;
    }
    const sigmaE = Math.sqrt(sumSqDiff / n);

    // Dynamic deceleration threshold tuned via sensitivity slider
    // Sensitivity 0.62 -> theta ~ 0.08, k ~ 0.35
    const thetaAccel = 0.25 * (1.05 - this.sensitivity);
    const k = 0.5 * (1.0 - this.sensitivity);

    const impacts: DetectedImpact[] = [];
    let lastImpactTimeMs = -Infinity;

    // Apply 5-point Savitzky-Golay convolution
    for (let t = 2; t < n - 2; t++) {
      const e_tMinus2 = vectors[t - 2]!.kineticEnergy;
      const e_tMinus1 = vectors[t - 1]!.kineticEnergy;
      const e_t = vectors[t]!.kineticEnergy;
      const e_tPlus1 = vectors[t + 1]!.kineticEnergy;
      const e_tPlus2 = vectors[t + 2]!.kineticEnergy;

      // Savitzky-Golay 2nd derivative convolution formula
      const iSmooth = (2 * e_tMinus2 - e_tMinus1 - 2 * e_t - e_tPlus1 + 2 * e_tPlus2) / 7.0;

      const currentVec = vectors[t]!;
      const timeMs = currentVec.timeMs;

      // Validation criteria:
      // 1. Sharp deceleration arrest: iSmooth < -thetaAccel
      // 2. Statistical energy prominence: e_t > muE + k * sigmaE
      // 3. 180ms lockout prevents double-triggering on sustained vibrations
      if (
        iSmooth < -thetaAccel &&
        e_t > (muE + k * sigmaE) &&
        (timeMs - lastImpactTimeMs) > this.minLockoutMs
      ) {
        impacts.push({
          timeMs: Math.round(timeMs),
          frameIndex: currentVec.frameIndex,
          acceleration: Number(iSmooth.toFixed(4)),
          energy: Number(e_t.toFixed(4)),
          centroidX: Number(currentVec.centroidX.toFixed(3)),
          confidence: Number(Math.min(1.0, Math.abs(iSmooth) / (thetaAccel * 2)).toFixed(2)),
        });
        lastImpactTimeMs = timeMs;
      }
    }

    return impacts;
  }
}

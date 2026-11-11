import assert from "node:assert/strict";
import orchestrateHandler, {
  validateAndSanitizeCueSheet,
  generateDeterministicCueSheet,
  VALID_KEYS,
  VALID_SCALE_MODES,
  VALID_CURVES,
  VALID_CATEGORIES,
  VALID_PATCH_TYPES
} from "../netlify/functions/orchestrate.js";
import SonicFrameCopilot from "../sonicframe-copilot.js";

// Helper to strictly assert SonicFrameCueSheet schema conformance
function assertValidCueSheet(sheet, label = "CueSheet") {
  assert.ok(sheet, `${label} must be defined`);
  assert.equal(typeof sheet, "object", `${label} must be an object`);

  // 1. composition_profile
  const prof = sheet.composition_profile;
  assert.ok(prof, `${label}.composition_profile missing`);
  assert.ok(VALID_KEYS.includes(prof.key_root), `Invalid key_root: ${prof.key_root}`);
  assert.ok(VALID_SCALE_MODES.includes(prof.scale_mode), `Invalid scale_mode: ${prof.scale_mode}`);
  assert.ok(Number.isInteger(prof.base_bpm) && prof.base_bpm >= 40 && prof.base_bpm <= 200, `Invalid base_bpm: ${prof.base_bpm}`);
  assert.ok(VALID_CURVES.includes(prof.intensity_curve), `Invalid intensity_curve: ${prof.intensity_curve}`);

  // 2. foley_events
  assert.ok(Array.isArray(sheet.foley_events), `${label}.foley_events must be an array`);
  assert.ok(sheet.foley_events.length > 0, `${label}.foley_events should contain events`);

  sheet.foley_events.forEach((evt, idx) => {
    assert.ok(Number.isInteger(evt.timestamp_ms) && evt.timestamp_ms >= 0, `Event [${idx}] invalid timestamp_ms: ${evt.timestamp_ms}`);
    assert.ok(Number.isInteger(evt.frame_number) && evt.frame_number >= 0, `Event [${idx}] invalid frame_number: ${evt.frame_number}`);
    assert.ok(VALID_CATEGORIES.includes(evt.category), `Event [${idx}] invalid category: ${evt.category}`);
    assert.ok(VALID_PATCH_TYPES.includes(evt.patch_type), `Event [${idx}] invalid patch_type: ${evt.patch_type}`);
    assert.ok(typeof evt.velocity === "number" && evt.velocity >= 0.0 && evt.velocity <= 1.0, `Event [${idx}] invalid velocity: ${evt.velocity}`);
    assert.ok(typeof evt.pan === "number" && evt.pan >= -1.0 && evt.pan <= 1.0, `Event [${idx}] invalid pan: ${evt.pan}`);

    const p = evt.parameters;
    assert.ok(p, `Event [${idx}] parameters missing`);
    assert.ok(typeof p.fundamental_freq === "number" && p.fundamental_freq > 0, `Event [${idx}] invalid fundamental_freq: ${p.fundamental_freq}`);
    assert.ok(typeof p.decay_seconds === "number" && p.decay_seconds > 0, `Event [${idx}] invalid decay_seconds: ${p.decay_seconds}`);
    assert.ok(typeof p.brightness === "number" && p.brightness >= 0 && p.brightness <= 1, `Event [${idx}] invalid brightness: ${p.brightness}`);
    assert.ok(typeof p.resonance_q === "number" && p.resonance_q > 0, `Event [${idx}] invalid resonance_q: ${p.resonance_q}`);
  });

  // 3. stem_automations
  const auto = sheet.stem_automations;
  assert.ok(auto, `${label}.stem_automations missing`);
  assert.ok(Array.isArray(auto.atmosphere_cutoff), `atmosphere_cutoff must be an array`);
  assert.ok(auto.atmosphere_cutoff.length > 0, `atmosphere_cutoff must have points`);
  auto.atmosphere_cutoff.forEach((pt, idx) => {
    assert.ok(Number.isInteger(pt.timestamp_ms) && pt.timestamp_ms >= 0, `Cutoff point [${idx}] invalid timestamp_ms: ${pt.timestamp_ms}`);
    assert.ok(typeof pt.value_hz === "number" && pt.value_hz >= 100 && pt.value_hz <= 15000, `Cutoff point [${idx}] invalid value_hz: ${pt.value_hz}`);
  });

  assert.ok(Array.isArray(auto.drone_density), `drone_density must be an array`);
  assert.ok(auto.drone_density.length > 0, `drone_density must have points`);
  auto.drone_density.forEach((pt, idx) => {
    assert.ok(Number.isInteger(pt.timestamp_ms) && pt.timestamp_ms >= 0, `Drone point [${idx}] invalid timestamp_ms: ${pt.timestamp_ms}`);
    assert.ok(typeof pt.gain === "number" && pt.gain >= 0.0 && pt.gain <= 1.0, `Drone point [${idx}] invalid gain: ${pt.gain}`);
  });
}

// Mock 10Hz downsampled telemetry matrix
const mockTelemetry = {
  durationSeconds: 15.0,
  totalFrames: 450,
  summary: Array.from({ length: 150 }, (_, i) => ({
    timeMs: i * 100,
    frameIndex: Math.round(i * 3),
    kineticEnergy: Math.sin(i / 10) * 0.4 + 0.4,
    divergence: Math.cos(i / 15) * 0.3,
    curl: Math.sin(i / 8) * 0.2,
    centroidX: Math.cos(i / 10) * 0.5,
    deltaColorLAB: (i % 25 === 0) ? 1.4 : 0.1
  })),
  detectedImpacts: [
    { timeMs: 1200, frameIndex: 36, energy: 0.88, centroidX: -0.45 },
    { timeMs: 4500, frameIndex: 135, energy: 0.72, centroidX: 0.35 },
    { timeMs: 8900, frameIndex: 267, energy: 0.94, centroidX: 0.10 },
    { timeMs: 12100, frameIndex: 363, energy: 0.52, centroidX: -0.20 }
  ]
};

async function runTests() {
  console.log("=== SONICFRAME Cognitive Orchestrator & Co-Pilot Test Suite ===\n");

  // TEST 1: Schema Validator & Fallback Generator
  console.log("Test 1: Verifying Local Algorithmic Cue-Sheet Generator & Schema Compliance");
  const localSheet = SonicFrameCopilot.generateLocalCueSheet(mockTelemetry, "cinematic_dark");
  assertValidCueSheet(localSheet, "LocalCueSheet");
  assert.equal(localSheet.composition_profile.key_root, "D");
  assert.equal(localSheet.composition_profile.scale_mode, "cinematic_dark");
  assert.equal(localSheet.foley_events.length >= 4, true, "Should map detected impacts to foley events");
  console.log("✓ Local algorithmic generator produced 100% schema-compliant cue sheet.");

  // TEST 2: Different Mood Profiles
  console.log("\nTest 2: Verifying Mood Mappings");
  const playfulSheet = SonicFrameCopilot.generateLocalCueSheet(mockTelemetry, "playful_bright");
  assertValidCueSheet(playfulSheet, "PlayfulSheet");
  assert.equal(playfulSheet.composition_profile.key_root, "C");
  assert.equal(playfulSheet.composition_profile.scale_mode, "lydian");

  const actionSheet = SonicFrameCopilot.generateLocalCueSheet(mockTelemetry, "action_percussive");
  assertValidCueSheet(actionSheet, "ActionSheet");
  assert.equal(actionSheet.composition_profile.key_root, "E");
  assert.equal(actionSheet.composition_profile.scale_mode, "dorian");
  console.log("✓ Mood-to-modal mappings validated across scales and root keys.");

  // TEST 3: Validation of Partial or Malformed Cues
  console.log("\nTest 3: Sanitization and Validation of Partial / Deviant Cue Sheets");
  const partialCue = {
    composition_profile: { key_root: "INVALID", scale_mode: "unknown_minor", base_bpm: 999 },
    foley_events: [
      { timestamp_ms: -50, category: "weird_hit", patch_type: "synth_lead", velocity: 5.5, pan: -4.0 }
    ],
    stem_automations: {}
  };
  const sanitized = validateAndSanitizeCueSheet(partialCue, mockTelemetry, "cinematic_dark");
  assertValidCueSheet(sanitized, "SanitizedCueSheet");
  assert.ok(VALID_KEYS.includes(sanitized.composition_profile.key_root));
  assert.ok(sanitized.composition_profile.base_bpm <= 200);
  assert.ok(VALID_CATEGORIES.includes(sanitized.foley_events[0].category));
  assert.ok(sanitized.foley_events[0].velocity <= 1.0);
  assert.ok(sanitized.foley_events[0].pan >= -1.0 && sanitized.foley_events[0].pan <= 1.0);
  console.log("✓ Malformed cue sheets sanitized strictly to specification boundaries.");

  // TEST 4: Natural Language Command Handling - Footsteps Heavier
  console.log("\nTest 4: Command - 'Make footsteps sound heavier / like wet cobblestone'");
  const initialCue = SonicFrameCopilot.generateLocalCueSheet(mockTelemetry, "cinematic_dark");
  const res1 = SonicFrameCopilot.handleCommand(
    "Make footsteps sound heavier / like wet cobblestone",
    initialCue,
    mockTelemetry
  );
  assert.equal(res1.success, true);
  assert.equal(res1.executed, true);
  assert.equal(res1.action, "modify_footsteps");
  assertValidCueSheet(res1.mutatedCueSheet, "MutatedFootstepsSheet");

  // Check that footstep parameters were altered to deep, wet acoustic properties
  const footsteps = res1.mutatedCueSheet.foley_events.filter(e => e.category.startsWith("footstep"));
  assert.ok(footsteps.length > 0, "Should have footstep events");
  footsteps.forEach(f => {
    assert.equal(f.parameters.fundamental_freq, 75, "Pitch lowered for heavy mass");
    assert.equal(f.parameters.decay_seconds, 0.38, "Decay lengthened for squishy cobblestone damping");
    assert.equal(f.parameters.resonance_q, 6.8, "Resonance tuned for stone slap");
  });
  console.log("✓ Footsteps sound heavier / wet cobblestone executed cleanly.");

  // TEST 5: Natural Language Command Handling - Increase Tension in Final 3 Seconds
  console.log("\nTest 5: Command - 'Increase score tension in the final 3 seconds'");
  const res2 = SonicFrameCopilot.handleCommand(
    "Increase score tension in the final 3 seconds",
    res1.mutatedCueSheet,
    mockTelemetry
  );
  assert.equal(res2.success, true);
  assert.equal(res2.executed, true);
  assert.equal(res2.action, "increase_tension");
  assert.equal(res2.mutatedCueSheet.composition_profile.intensity_curve, "exponential_build");

  // Verify cutoff frequencies and drone densities in final 3 seconds (>= 12000ms)
  const finalCutoffs = res2.mutatedCueSheet.stem_automations.atmosphere_cutoff.filter(pt => pt.timestamp_ms >= 12000);
  assert.ok(finalCutoffs.length > 0, "Should have cutoff points in final 3s");
  finalCutoffs.forEach(pt => {
    assert.ok(pt.value_hz >= 3500, `Cutoff should sweep high in tension window: ${pt.value_hz}Hz`);
  });

  const finalDrones = res2.mutatedCueSheet.stem_automations.drone_density.filter(pt => pt.timestamp_ms >= 12000);
  assert.ok(finalDrones.length > 0, "Should have drone points in final 3s");
  finalDrones.forEach(pt => {
    assert.ok(pt.gain >= 0.75, `Drone gain escalated in tension window: ${pt.gain}`);
  });
  console.log("✓ Final 3s score tension build verified.");

  // TEST 6: Natural Language Command Handling - Double Decay on Metallic Clashes
  console.log("\nTest 6: Command - 'Double the decay time on all metallic clashes'");
  const res3 = SonicFrameCopilot.handleCommand(
    "Double the decay time on all metallic clashes",
    res2.mutatedCueSheet,
    mockTelemetry
  );
  assert.equal(res3.success, true);
  assert.equal(res3.executed, true);
  assert.equal(res3.action, "modify_metallic_decay");
  const metalClashes = res3.mutatedCueSheet.foley_events.filter(e => e.category === "impact_metallic");
  assert.ok(metalClashes.length > 0, "Should contain metallic clashes");
  metalClashes.forEach(m => {
    assert.ok(m.parameters.decay_seconds >= 0.8, `Decay seconds doubled: ${m.parameters.decay_seconds}`);
  });
  console.log("✓ Metallic clash decay doubling verified.");

  // TEST 7: Natural Language Command Handling - Set Key & Scale
  console.log("\nTest 7: Command - 'Set key to D minor / cinematic dark'");
  const res4 = SonicFrameCopilot.handleCommand(
    "Set key to D minor / cinematic dark",
    res3.mutatedCueSheet,
    mockTelemetry
  );
  assert.equal(res4.success, true);
  assert.equal(res4.executed, true);
  assert.equal(res4.action, "set_musical_key");
  assert.equal(res4.mutatedCueSheet.composition_profile.key_root, "D");
  assert.equal(res4.mutatedCueSheet.composition_profile.scale_mode, "cinematic_dark");
  console.log("✓ Composition key and scale mode set.");

  // TEST 8: Natural Language Command Handling - Mute Atmosphere
  console.log("\nTest 8: Command - 'Mute the atmosphere stem'");
  const res5 = SonicFrameCopilot.handleCommand(
    "Mute the atmosphere stem",
    res4.mutatedCueSheet,
    mockTelemetry
  );
  assert.equal(res5.success, true);
  assert.equal(res5.executed, true);
  assert.equal(res5.action, "mute_stem");
  assert.deepEqual(res5.stemChanges, { atmosphere: { muted: true } });
  console.log("✓ Atmosphere stem muted verified.");

  // TEST 9: Netlify Endpoint Integration (POST /.netlify/functions/orchestrate)
  console.log("\nTest 9: Netlify orchestrate function invocation & offline fallback");
  const mockReq = new Request("http://localhost/.netlify/functions/orchestrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telemetry: mockTelemetry,
      mood: "cinematic_dark"
    })
  });

  const response = await orchestrateHandler(mockReq);
  assert.equal(response.status, 200, "Should return HTTP 200");
  const resJson = await response.json();
  assert.equal(resJson.success, true, "Response success must be true");
  assertValidCueSheet(resJson.cueSheet, "OrchestrateEndpointCueSheet");
  console.log(`✓ Orchestrate endpoint returned HTTP 200 with valid cue sheet (source: ${resJson.source}).`);

  // TEST 10: Netlify OPTIONS CORS Preflight
  console.log("\nTest 10: Netlify OPTIONS preflight request");
  const optionsReq = new Request("http://localhost/.netlify/functions/orchestrate", {
    method: "OPTIONS"
  });
  const optRes = await orchestrateHandler(optionsReq);
  assert.equal(optRes.status, 204, "OPTIONS must return 204 No Content");
  console.log("✓ CORS preflight OPTIONS returns 204.");

  console.log("\n=======================================================");
  console.log("🎉 ALL 10 ORCHESTRATOR & CO-PILOT TESTS PASSED PERFECTLY!");
  console.log("=======================================================");
}

runTests().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});

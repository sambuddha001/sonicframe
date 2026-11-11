/**
 * SONICFRAME COPILOT & CLIENT-SIDE ORCHESTRATOR
 * Optical-flow driven foley, procedural score engine & natural language timeline mutator.
 * Follows specifications in SONICFRAME_ARCHITECTURE.pdf and PS.txt.
 */

// Constants strictly adhering to SONICFRAME_ARCHITECTURE.pdf JSON schema
export const VALID_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const VALID_SCALE_MODES = ["dorian", "aeolian", "phrygian", "lydian", "minor_pentatonic", "cinematic_dark"];
export const VALID_CURVES = ["exponential_build", "sudden_drop", "sustained_tension", "dynamic_waves"];
export const VALID_CATEGORIES = [
  "impact_heavy",
  "impact_metallic",
  "whoosh_pass",
  "footstep_wood",
  "footstep_gravel",
  "ambient_glitch"
];
export const VALID_PATCH_TYPES = ["modal_resonator", "granular_cluster", "filtered_noise_burst"];

const STORAGE_KEY_TELEMETRY = "sonicframe_active_telemetry";
const STORAGE_KEY_CUESHEET = "sonicframe_active_cuesheet";

// In-memory state cache
const state = {
  activeTelemetry: null,
  activeCueSheet: null,
  mood: "cinematic_dark",
  history: []
};

// Restore cached state from sessionStorage if available in browser
try {
  if (typeof window !== "undefined" && window.sessionStorage) {
    const cachedTel = window.sessionStorage.getItem(STORAGE_KEY_TELEMETRY);
    if (cachedTel) state.activeTelemetry = JSON.parse(cachedTel);
    const cachedCue = window.sessionStorage.getItem(STORAGE_KEY_CUESHEET);
    if (cachedCue) state.activeCueSheet = JSON.parse(cachedCue);
  }
} catch (e) {
  // SessionStorage not available or restricted
}

/**
 * Validates and sanitizes any SonicFrameCueSheet against the schema.
 */
export function validateCueSheet(cueSheet, telemetry = {}, mood = "cinematic_dark") {
  if (!cueSheet || typeof cueSheet !== "object") {
    return generateLocalCueSheet(telemetry, mood);
  }

  // 1. Composition profile
  const rawProf = cueSheet.composition_profile || {};
  let key_root = typeof rawProf.key_root === "string" ? rawProf.key_root.toUpperCase().trim() : "D";
  if (!VALID_KEYS.includes(key_root)) key_root = "D";

  let scale_mode = typeof rawProf.scale_mode === "string" ? rawProf.scale_mode.toLowerCase().trim() : "cinematic_dark";
  if (!VALID_SCALE_MODES.includes(scale_mode)) scale_mode = "cinematic_dark";

  let base_bpm = Number.isInteger(rawProf.base_bpm) ? rawProf.base_bpm : Math.round(Number(rawProf.base_bpm) || 88);
  base_bpm = Math.max(40, Math.min(200, base_bpm));

  let intensity_curve = typeof rawProf.intensity_curve === "string" ? rawProf.intensity_curve.toLowerCase().trim() : "exponential_build";
  if (!VALID_CURVES.includes(intensity_curve)) intensity_curve = "exponential_build";

  const composition_profile = {
    key_root,
    scale_mode,
    base_bpm,
    intensity_curve
  };

  // 2. Foley events
  const rawEvents = Array.isArray(cueSheet.foley_events) ? cueSheet.foley_events : [];
  const durationSec = Number(telemetry.durationSeconds) || 15;
  const maxMs = Math.round(durationSec * 1000);

  let foley_events = rawEvents.map((evt, idx) => {
    const rawTs = Number(evt.timestamp_ms);
    const timestamp_ms = Number.isFinite(rawTs) ? Math.max(0, Math.min(maxMs + 2000, Math.round(rawTs))) : Math.round(idx * 750);
    const frame_number = Number.isInteger(evt.frame_number) ? evt.frame_number : Math.round(timestamp_ms * 30 / 1000);

    let category = typeof evt.category === "string" ? evt.category.toLowerCase().trim() : "impact_heavy";
    if (!VALID_CATEGORIES.includes(category)) {
      if (category.includes("metal")) category = "impact_metallic";
      else if (category.includes("wood")) category = "footstep_wood";
      else if (category.includes("gravel")) category = "footstep_gravel";
      else if (category.includes("whoosh")) category = "whoosh_pass";
      else if (category.includes("glitch")) category = "ambient_glitch";
      else category = "impact_heavy";
    }

    let patch_type = typeof evt.patch_type === "string" ? evt.patch_type.toLowerCase().trim() : "";
    if (!VALID_PATCH_TYPES.includes(patch_type)) {
      if (category === "whoosh_pass") patch_type = "filtered_noise_burst";
      else if (category === "footstep_gravel" || category === "ambient_glitch") patch_type = "granular_cluster";
      else patch_type = "modal_resonator";
    }

    const velocity = Number.isFinite(Number(evt.velocity)) ? Math.max(0.0, Math.min(1.0, Number(evt.velocity))) : 0.7;
    const pan = Number.isFinite(Number(evt.pan)) ? Math.max(-1.0, Math.min(1.0, Number(evt.pan))) : 0.0;

    const rawParams = evt.parameters || {};
    const defaultFreq = category === "impact_heavy" ? 65 : category === "impact_metallic" ? 340 : category === "footstep_wood" ? 135 : 240;
    const fundamental_freq = Number.isFinite(Number(rawParams.fundamental_freq)) && Number(rawParams.fundamental_freq) > 0 ? Number(rawParams.fundamental_freq) : defaultFreq;
    const decay_seconds = Number.isFinite(Number(rawParams.decay_seconds)) && Number(rawParams.decay_seconds) > 0 ? Number(rawParams.decay_seconds) : (category.includes("impact") ? 0.6 : 0.25);
    const brightness = Number.isFinite(Number(rawParams.brightness)) ? Math.max(0.0, Math.min(1.0, Number(rawParams.brightness))) : 0.7;
    const resonance_q = Number.isFinite(Number(rawParams.resonance_q)) && Number(rawParams.resonance_q) > 0 ? Number(rawParams.resonance_q) : (category === "impact_metallic" ? 12.0 : 4.5);

    return {
      timestamp_ms,
      frame_number,
      category,
      patch_type,
      velocity: Number(velocity.toFixed(3)),
      pan: Number(pan.toFixed(3)),
      parameters: {
        fundamental_freq: Number(fundamental_freq.toFixed(2)),
        decay_seconds: Number(decay_seconds.toFixed(3)),
        brightness: Number(brightness.toFixed(3)),
        resonance_q: Number(resonance_q.toFixed(2))
      }
    };
  });

  foley_events.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  if (foley_events.length === 0) {
    const fallback = generateLocalCueSheet(telemetry, mood);
    foley_events = fallback.foley_events;
  }

  // 3. Stem automations
  const rawAutomations = cueSheet.stem_automations || {};
  let atmosphere_cutoff = Array.isArray(rawAutomations.atmosphere_cutoff)
    ? rawAutomations.atmosphere_cutoff.map(pt => ({
        timestamp_ms: Math.round(Number(pt.timestamp_ms) || 0),
        value_hz: Math.max(100, Math.min(12000, Number(pt.value_hz) || 450))
      }))
    : [];

  let drone_density = Array.isArray(rawAutomations.drone_density)
    ? rawAutomations.drone_density.map(pt => ({
        timestamp_ms: Math.round(Number(pt.timestamp_ms) || 0),
        gain: Math.max(0.0, Math.min(1.0, Number(pt.gain) || 0.3))
      }))
    : [];

  if (atmosphere_cutoff.length === 0 || drone_density.length === 0) {
    const fallbackAutos = generateLocalCueSheet(telemetry, mood).stem_automations;
    if (atmosphere_cutoff.length === 0) atmosphere_cutoff = fallbackAutos.atmosphere_cutoff;
    if (drone_density.length === 0) drone_density = fallbackAutos.drone_density;
  }

  atmosphere_cutoff.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  drone_density.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  return {
    composition_profile,
    foley_events,
    stem_automations: {
      atmosphere_cutoff,
      drone_density
    }
  };
}

/**
 * Local algorithmic fallback cue-sheet generator that maps motion peaks,
 * divergence, and centroids directly into valid cues even offline or without API keys.
 */
export function generateLocalCueSheet(telemetry = {}, mood = "cinematic_dark") {
  const durationSec = Number(telemetry.durationSeconds) || 15;
  const normMood = (mood || "cinematic_dark").toLowerCase();

  let key_root = "D";
  let scale_mode = "cinematic_dark";
  let base_bpm = 88;
  let intensity_curve = "exponential_build";

  if (normMood.includes("playful")) {
    key_root = "C";
    scale_mode = "lydian";
    base_bpm = 120;
    intensity_curve = "dynamic_waves";
  } else if (normMood.includes("action")) {
    key_root = "E";
    scale_mode = "dorian";
    base_bpm = 136;
    intensity_curve = "exponential_build";
  } else if (normMood.includes("ambient") || normMood.includes("sci_fi")) {
    key_root = "A";
    scale_mode = "phrygian";
    base_bpm = 72;
    intensity_curve = "sustained_tension";
  }

  const foley_events = [];
  const impacts = Array.isArray(telemetry.detectedImpacts) ? telemetry.detectedImpacts : [];

  if (impacts.length > 0) {
    impacts.forEach((imp, idx) => {
      const ts = Math.round(imp.timeMs != null ? imp.timeMs : (imp.frameIndex ? imp.frameIndex / 30 * 1000 : idx * 1200));
      const frame = imp.frameIndex != null ? imp.frameIndex : Math.round(ts * 30 / 1000);
      const energy = Math.max(0.1, Math.min(1.0, Number(imp.energy) || 0.6));
      const pan = Math.max(-1.0, Math.min(1.0, Number(imp.centroidX) || 0.0));

      let category = "impact_heavy";
      let patch_type = "modal_resonator";
      let fundamental_freq = 65;
      let decay_seconds = 0.55 + energy * 0.4;
      let brightness = 0.75;
      let resonance_q = 6.0;

      if (energy > 0.75) {
        if (idx % 2 === 1) {
          category = "impact_metallic";
          fundamental_freq = 320;
          brightness = 0.9;
          resonance_q = 12.0;
        } else {
          category = "impact_heavy";
          fundamental_freq = 55;
          brightness = 0.8;
          resonance_q = 5.0;
        }
      } else if (energy > 0.45) {
        category = "footstep_wood";
        fundamental_freq = 135;
        decay_seconds = 0.22;
        brightness = 0.45;
        resonance_q = 3.5;
      } else {
        category = "footstep_gravel";
        patch_type = "granular_cluster";
        fundamental_freq = 260;
        decay_seconds = 0.18;
        brightness = 0.6;
        resonance_q = 2.0;
      }

      foley_events.push({
        timestamp_ms: ts,
        frame_number: frame,
        category,
        patch_type,
        velocity: Number(energy.toFixed(3)),
        pan: Number(pan.toFixed(3)),
        parameters: {
          fundamental_freq,
          decay_seconds: Number(decay_seconds.toFixed(3)),
          brightness,
          resonance_q
        }
      });
    });
  } else if (Array.isArray(telemetry.summary) && telemetry.summary.length > 0) {
    const samples = telemetry.summary;
    for (let i = 1; i < samples.length - 1; i++) {
      const prev = samples[i - 1].kineticEnergy || 0;
      const curr = samples[i].kineticEnergy || 0;
      const next = samples[i + 1].kineticEnergy || 0;

      if (curr > 0.35 && curr >= prev && curr >= next) {
        const ts = samples[i].timeMs || Math.round(i * 100);
        const pan = samples[i].centroidX || 0.0;
        foley_events.push({
          timestamp_ms: ts,
          frame_number: samples[i].frameIndex || Math.round(ts * 30 / 1000),
          category: curr > 0.6 ? "impact_heavy" : "footstep_wood",
          patch_type: "modal_resonator",
          velocity: Number(Math.min(1.0, curr).toFixed(3)),
          pan: Number(Math.max(-1.0, Math.min(1.0, pan)).toFixed(3)),
          parameters: {
            fundamental_freq: curr > 0.6 ? 65 : 140,
            decay_seconds: curr > 0.6 ? 0.65 : 0.24,
            brightness: 0.7,
            resonance_q: 5.0
          }
        });
      }
    }
  }

  if (foley_events.length === 0) {
    const totalMs = Math.round(durationSec * 1000);
    [0.2, 0.5, 0.85].forEach((ratio, idx) => {
      const ts = Math.round(totalMs * ratio);
      foley_events.push({
        timestamp_ms: ts,
        frame_number: Math.round(ts * 30 / 1000),
        category: idx === 1 ? "impact_metallic" : idx === 2 ? "impact_heavy" : "whoosh_pass",
        patch_type: idx === 0 ? "filtered_noise_burst" : "modal_resonator",
        velocity: 0.75,
        pan: idx === 0 ? -0.4 : idx === 1 ? 0.3 : 0.0,
        parameters: {
          fundamental_freq: idx === 1 ? 340 : idx === 2 ? 65 : 220,
          decay_seconds: idx === 0 ? 0.45 : idx === 1 ? 0.7 : 0.6,
          brightness: 0.8,
          resonance_q: idx === 1 ? 10.0 : 4.0
        }
      });
    });
  }

  foley_events.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  const atmosphere_cutoff = [];
  const drone_density = [];
  const totalMs = Math.round(durationSec * 1000);

  if (Array.isArray(telemetry.summary) && telemetry.summary.length > 0) {
    const step = Math.max(1, Math.floor(telemetry.summary.length / 12));
    for (let j = 0; j < telemetry.summary.length; j += step) {
      const s = telemetry.summary[j];
      const sTs = Math.round(s.timeMs || (j / telemetry.summary.length * totalMs));
      const energy = s.kineticEnergy || 0.1;
      const divergence = s.divergence || 0.0;
      const cutoff = Math.round(Math.max(250, Math.min(7500, 400 + (divergence + 0.5) * 1200 + energy * 2800)));
      const gain = Number(Math.max(0.1, Math.min(0.95, 0.2 + energy * 0.65)).toFixed(3));

      atmosphere_cutoff.push({ timestamp_ms: sTs, value_hz: cutoff });
      drone_density.push({ timestamp_ms: sTs, gain });
    }
  } else {
    for (let p = 0; p <= 8; p++) {
      const pTs = Math.round((p / 8) * totalMs);
      const progress = p / 8;
      const cutoff = Math.round(350 + Math.pow(progress, 1.8) * 3200);
      const gain = Number((0.2 + Math.pow(progress, 1.5) * 0.6).toFixed(3));
      atmosphere_cutoff.push({ timestamp_ms: pTs, value_hz: cutoff });
      drone_density.push({ timestamp_ms: pTs, gain });
    }
  }

  return {
    composition_profile: {
      key_root,
      scale_mode,
      base_bpm,
      intensity_curve
    },
    foley_events,
    stem_automations: {
      atmosphere_cutoff,
      drone_density
    }
  };
}

/**
 * Sends telemetry to /.netlify/functions/orchestrate.
 * If remote endpoint fails or is offline, falls back seamlessly to local engine.
 */
export async function orchestrate(telemetry, mood) {
  telemetry = telemetry || state.activeTelemetry || {};
  mood = mood || state.mood || "cinematic_dark";

  try {
    const res = await fetch("/.netlify/functions/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telemetry, mood })
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json();
    if (data && data.success && data.cueSheet) {
      const validCue = validateCueSheet(data.cueSheet, telemetry, mood);
      setActiveState({ telemetry, cueSheet: validCue, mood });
      return {
        success: true,
        source: data.source || "remote",
        cueSheet: validCue
      };
    }
    throw new Error(data.error || "Invalid response structure");
  } catch (err) {
    console.warn("SonicFrame orchestrate endpoint fallback triggered:", err.message);
    const fallbackCue = generateLocalCueSheet(telemetry, mood);
    setActiveState({ telemetry, cueSheet: fallbackCue, mood });
    return {
      success: true,
      source: "local_algorithmic",
      message: "Generated cue sheet via client-side optical flow heuristic engine.",
      cueSheet: fallbackCue
    };
  }
}

/**
 * Parses natural language commands and mutates the active cue sheet or stem parameters in real-time.
 */
export function handleCommand(naturalLanguagePrompt, activeCueSheet, telemetry) {
  const prompt = (naturalLanguagePrompt || "").trim();
  if (!prompt) {
    return {
      success: false,
      message: "Please enter a sound design or score command."
    };
  }

  let cueSheet = activeCueSheet || state.activeCueSheet;
  telemetry = telemetry || state.activeTelemetry || {};

  if (!cueSheet) {
    cueSheet = generateLocalCueSheet(telemetry, state.mood);
  } else {
    cueSheet = JSON.parse(JSON.stringify(cueSheet));
  }

  const lower = prompt.toLowerCase();
  let executed = false;
  let action = "general_query";
  let message = "";
  let stemChanges = null;
  let compositionChanges = null;

  // 1. Footsteps heavier / wet cobblestone
  if (
    (lower.includes("footstep") && (lower.includes("heavier") || lower.includes("heavy") || lower.includes("wet") || lower.includes("cobblestone") || lower.includes("mud") || lower.includes("deep") || lower.includes("thud"))) ||
    lower.includes("wet cobblestone")
  ) {
    let count = 0;
    cueSheet.foley_events.forEach(evt => {
      if (evt.category.includes("footstep") || evt.category === "footstep_wood" || evt.category === "footstep_gravel") {
        evt.category = "footstep_wood";
        evt.patch_type = "modal_resonator";
        evt.parameters.fundamental_freq = 75;
        evt.parameters.decay_seconds = 0.38;
        evt.parameters.brightness = 0.38;
        evt.parameters.resonance_q = 6.8;
        count++;
      }
    });

    if (count === 0 && cueSheet.foley_events.length > 0) {
      cueSheet.foley_events.slice(0, 2).forEach(evt => {
        evt.category = "footstep_wood";
        evt.patch_type = "modal_resonator";
        evt.parameters.fundamental_freq = 75;
        evt.parameters.decay_seconds = 0.38;
        evt.parameters.brightness = 0.38;
        evt.parameters.resonance_q = 6.8;
        count++;
      });
    }

    executed = true;
    action = "modify_footsteps";
    message = `Adjusted ${count} footstep cues: lowered fundamental pitch to 75Hz, extended decay (0.38s), and boosted modal damping for a heavy, wet cobblestone impact.`;
  }

  // 2. Increase tension in final N seconds
  else if (
    (lower.includes("tension") || lower.includes("crescendo") || lower.includes("build")) &&
    (lower.includes("final") || lower.includes("last") || lower.includes("ending"))
  ) {
    const secMatch = lower.match(/(?:final|last)\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/);
    const tensionSec = secMatch ? parseFloat(secMatch[1]) : 3.0;

    const durationSec = Number(telemetry.durationSeconds) || 15;
    const totalMs = Math.round(durationSec * 1000);
    const startTensionMs = Math.max(0, totalMs - Math.round(tensionSec * 1000));

    cueSheet.stem_automations.atmosphere_cutoff.forEach(pt => {
      if (pt.timestamp_ms >= startTensionMs) {
        const progress = (pt.timestamp_ms - startTensionMs) / (totalMs - startTensionMs || 1);
        pt.value_hz = Math.round(Math.min(9000, Math.max(pt.value_hz, 3500 + progress * 4000)));
      }
    });

    cueSheet.stem_automations.drone_density.forEach(pt => {
      if (pt.timestamp_ms >= startTensionMs) {
        const progress = (pt.timestamp_ms - startTensionMs) / (totalMs - startTensionMs || 1);
        pt.gain = Number(Math.min(0.98, Math.max(pt.gain, 0.75 + progress * 0.23)).toFixed(3));
      }
    });

    cueSheet.composition_profile.intensity_curve = "exponential_build";
    compositionChanges = { intensity_curve: "exponential_build" };
    stemChanges = { atmosphere: { boostCutoff: 5800 }, pulse: { gain: 0.85 } };

    executed = true;
    action = "increase_tension";
    message = `Increased score tension in the final ${tensionSec} seconds: ramped atmosphere filter cutoff up to 7500Hz, escalated drone density to 98%, and set intensity curve to exponential_build.`;
  }

  // 3. Double decay time on metallic clashes
  else if (
    (lower.includes("decay") || lower.includes("sustain") || lower.includes("ring")) &&
    (lower.includes("metal") || lower.includes("clash") || lower.includes("blade") || lower.includes("sword"))
  ) {
    let factor = 2.0;
    if (lower.includes("triple")) factor = 3.0;
    else if (lower.includes("half")) factor = 0.5;

    let clashCount = 0;
    cueSheet.foley_events.forEach(evt => {
      if (evt.category === "impact_metallic" || evt.category.includes("metal")) {
        evt.parameters.decay_seconds = Number((evt.parameters.decay_seconds * factor).toFixed(3));
        evt.parameters.resonance_q = Number((evt.parameters.resonance_q * 1.3).toFixed(2));
        clashCount++;
      }
    });

    if (clashCount === 0 && cueSheet.foley_events.length > 0) {
      cueSheet.foley_events[0].category = "impact_metallic";
      cueSheet.foley_events[0].patch_type = "modal_resonator";
      cueSheet.foley_events[0].parameters.fundamental_freq = 340;
      cueSheet.foley_events[0].parameters.decay_seconds = Number((0.6 * factor).toFixed(3));
      cueSheet.foley_events[0].parameters.brightness = 0.92;
      cueSheet.foley_events[0].parameters.resonance_q = 14.0;
      clashCount = 1;
    }

    executed = true;
    action = "modify_metallic_decay";
    message = `Multiplied decay time by ${factor}x on ${clashCount} metallic clash cues (sustained ringing up to ${cueSheet.foley_events[0]?.parameters.decay_seconds || 0.9}s).`;
  }

  // 4. Set key to X minor / major / mode
  else if (lower.includes("key") || lower.includes("scale") || lower.includes("cinematic dark")) {
    let keyFound = null;
    for (const k of VALID_KEYS) {
      const keyRegex = new RegExp("(?:key\\s+to\\s+|key\\s+of\\s+|in\\s+)([A-Ga-g][#b]?)", "i");
      const km = lower.match(keyRegex);
      if (km && km[1]) {
        let note = km[1].toUpperCase();
        if (note === "BB") note = "A#";
        if (note === "EB") note = "D#";
        if (note === "AB") note = "G#";
        if (note === "DB") note = "C#";
        if (note === "GB") note = "F#";
        if (VALID_KEYS.includes(note)) keyFound = note;
        break;
      }
    }

    let modeFound = null;
    if (lower.includes("cinematic dark") || lower.includes("cinematic_dark")) modeFound = "cinematic_dark";
    else if (lower.includes("dorian")) modeFound = "dorian";
    else if (lower.includes("phrygian")) modeFound = "phrygian";
    else if (lower.includes("lydian")) modeFound = "lydian";
    else if (lower.includes("pentatonic")) modeFound = "minor_pentatonic";
    else if (lower.includes("minor")) modeFound = "aeolian";
    else if (lower.includes("major")) modeFound = "lydian";

    if (keyFound) cueSheet.composition_profile.key_root = keyFound;
    if (modeFound) cueSheet.composition_profile.scale_mode = modeFound;

    executed = true;
    action = "set_musical_key";
    compositionChanges = {
      key_root: cueSheet.composition_profile.key_root,
      scale_mode: cueSheet.composition_profile.scale_mode
    };
    message = `Set composition key to ${cueSheet.composition_profile.key_root} (${cueSheet.composition_profile.scale_mode}).`;
  }

  // 5. Mute / unmute / solo stems
  else if (
    lower.includes("mute") || lower.includes("silence") ||
    lower.includes("unmute") || lower.includes("turn off") || lower.includes("turn on")
  ) {
    const isMute = !lower.includes("unmute") && !lower.includes("turn on");
    let targetStem = "atmosphere";

    if (lower.includes("atmosphere") || lower.includes("ambience") || lower.includes("drone")) {
      targetStem = "atmosphere";
    } else if (lower.includes("foley") || lower.includes("impact")) {
      targetStem = "foley";
    } else if (lower.includes("pulse") || lower.includes("motion")) {
      targetStem = "pulse";
    } else if (lower.includes("texture") || lower.includes("shimmer")) {
      targetStem = "texture";
    }

    stemChanges = { [targetStem]: { muted: isMute } };

    executed = true;
    action = isMute ? "mute_stem" : "unmute_stem";
    message = `${isMute ? "Muted" : "Unmuted"} the ${targetStem.charAt(0).toUpperCase() + targetStem.slice(1)} stem.`;
  }

  // 6. Tempo / BPM changes
  else if (lower.includes("bpm") || lower.includes("tempo") || lower.includes("speed up") || lower.includes("slow down")) {
    const bpmMatch = lower.match(/(\d+)\s*bpm/i) || lower.match(/tempo\s*(?:to\s*)?(\d+)/i);
    let newBpm = bpmMatch ? parseInt(bpmMatch[1], 10) : (lower.includes("speed up") ? cueSheet.composition_profile.base_bpm + 20 : cueSheet.composition_profile.base_bpm - 20);
    newBpm = Math.max(40, Math.min(200, newBpm));

    cueSheet.composition_profile.base_bpm = newBpm;
    compositionChanges = { base_bpm: newBpm };

    executed = true;
    action = "set_tempo";
    message = `Adjusted master score tempo to ${newBpm} BPM.`;
  }

  // 7. Brightness / transient filtering
  else if (lower.includes("bright") || lower.includes("crisp") || lower.includes("darker")) {
    const makeBrighter = !lower.includes("darker");
    cueSheet.foley_events.forEach(evt => {
      evt.parameters.brightness = makeBrighter
        ? Math.min(1.0, evt.parameters.brightness + 0.25)
        : Math.max(0.1, evt.parameters.brightness - 0.25);
    });

    executed = true;
    action = "adjust_brightness";
    message = `${makeBrighter ? "Brightened" : "Darkened"} all foley transient responses across the cue sheet.`;
  }

  // 8. General conversational reply / audio co-pilot guidance
  else {
    executed = false;
    action = "conversational_advice";
    const cueCount = cueSheet.foley_events.length;
    const keyInfo = `${cueSheet.composition_profile.key_root} ${cueSheet.composition_profile.scale_mode}`;
    const bpmInfo = `${cueSheet.composition_profile.base_bpm} BPM`;

    message = `✦ SonicFrame Co-Pilot: Active timeline has ${cueCount} foley cues in ${keyInfo} at ${bpmInfo}.\n` +
      "You can command sound adjustments directly, such as:\n" +
      "• 'Make footsteps sound heavier / like wet cobblestone'\n" +
      "• 'Increase score tension in the final 3 seconds'\n" +
      "• 'Double the decay time on all metallic clashes'\n" +
      "• 'Set key to D minor / cinematic dark'\n" +
      "• 'Mute the atmosphere stem'";
  }

  const validated = validateCueSheet(cueSheet, telemetry, state.mood);
  setActiveState({ telemetry, cueSheet: validated, mood: state.mood });

  if (typeof window !== "undefined") {
    if (stemChanges) applyStemChanges(stemChanges);
    syncStudioTimeline(validated);
  }

  return {
    success: true,
    executed,
    action,
    message,
    mutatedCueSheet: validated,
    stemChanges,
    compositionChanges
  };
}

/**
 * Applies stem changes (mute/volume) directly to DOM controls in studio.html.
 */
export function applyStemChanges(stemChanges) {
  if (typeof document === "undefined") return;

  const stemMapping = {
    atmosphere: "ambience",
    ambience: "ambience",
    foley: "foley",
    pulse: "pulse",
    texture: "texture"
  };

  Object.keys(stemChanges).forEach(stemKey => {
    const domPrefix = stemMapping[stemKey] || stemKey;
    const change = stemChanges[stemKey];

    const toggle = document.getElementById(domPrefix + "On");
    if (toggle && change.muted !== undefined) {
      toggle.checked = !change.muted;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const slider = document.getElementById(domPrefix + "Vol");
    if (slider && change.gain !== undefined) {
      const pct = Math.round(change.gain * 100);
      slider.value = pct;
      const pctLabel = document.getElementById(domPrefix + "Pct");
      if (pctLabel) pctLabel.textContent = pct + "%";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

/**
 * Syncs the updated cue sheet to studio.html events list & timeline tracks if present.
 */
export function syncStudioTimeline(cueSheet) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  window.__SONICFRAME_CUE_SHEET__ = cueSheet;

  const eventList = document.getElementById("eventList");
  if (eventList && Array.isArray(cueSheet.foley_events)) {
    eventList.innerHTML = "";
    cueSheet.foley_events.slice(0, 30).forEach(e => {
      const row = document.createElement("div");
      row.className = "event-row";
      const label = e.category.replace(/_/g, " ").toUpperCase();
      const sec = (e.timestamp_ms / 1000).toFixed(3);
      row.innerHTML = `<time>00:${sec}</time><span>${label} (${e.patch_type})</span><small>${Math.round(e.velocity * 100)}% VEL</small>`;
      row.style.cursor = "pointer";
      row.onclick = () => {
        const vid = document.getElementById("video");
        if (vid) vid.currentTime = e.timestamp_ms / 1000;
      };
      eventList.appendChild(row);
    });
  }

  const timelineState = document.getElementById("timelineState");
  if (timelineState) {
    timelineState.textContent = cueSheet.foley_events.length + " CUES (CO-PILOT SYNCED)";
  }
}

/**
 * Updates in-memory and persisted active state.
 */
export function setActiveState(newState) {
  if (!newState) return;
  if (newState.telemetry) state.activeTelemetry = newState.telemetry;
  if (newState.cueSheet) state.activeCueSheet = newState.cueSheet;
  if (newState.mood) state.mood = newState.mood;

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      if (state.activeTelemetry) {
        window.sessionStorage.setItem(STORAGE_KEY_TELEMETRY, JSON.stringify(state.activeTelemetry));
      }
      if (state.activeCueSheet) {
        window.sessionStorage.setItem(STORAGE_KEY_CUESHEET, JSON.stringify(state.activeCueSheet));
      }
    }
  } catch (e) {
    // Ignore sessionStorage exceptions
  }
}

/**
 * Retrieves active telemetry and cue sheet from memory or storage.
 */
export function getActiveState() {
  return {
    telemetry: state.activeTelemetry,
    cueSheet: state.activeCueSheet,
    mood: state.mood
  };
}

const SonicFrameCopilot = {
  VALID_KEYS,
  VALID_SCALE_MODES,
  VALID_CURVES,
  VALID_CATEGORIES,
  VALID_PATCH_TYPES,
  validateCueSheet,
  generateLocalCueSheet,
  orchestrate,
  handleCommand,
  applyStemChanges,
  syncStudioTimeline,
  setActiveState,
  getActiveState
};

// Expose globally in browser environment
if (typeof window !== "undefined") {
  window.SonicFrameCopilot = SonicFrameCopilot;
}

export default SonicFrameCopilot;

import { GoogleGenerativeAI } from "@google/generative-ai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Allowed schema enums according to SONICFRAME_ARCHITECTURE.pdf
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

const SYSTEM_PROMPT = `You are SONICFRAME, an elite Hollywood Sound Designer and Adaptive Film Composer.
You receive millisecond-accurate mathematical motion telemetry extracted via Optical Flow from a silent animation.
Your task is to score this clip by generating a frame-accurate cue sheet:
1. Map kinetic energy spikes and deceleration peaks to Foley impacts (metal clashes, footsteps, punches, body falls).
2. Use horizontal motion centroids (centroidX: -1.0 left to +1.0 right) to automate audio stereo panning.
3. Align base musical tempo (BPM) and scale mode to the energy velocity curves.
4. Generate atmosphere filter cutoff and drone density automations over time.

You MUST reply ONLY with valid JSON conforming strictly to this SonicFrameCueSheet JSON schema:
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SonicFrameCueSheet",
  "type": "object",
  "required": ["composition_profile", "foley_events", "stem_automations"],
  "properties": {
    "composition_profile": {
      "type": "object",
      "required": ["key_root", "scale_mode", "base_bpm", "intensity_curve"],
      "properties": {
        "key_root": { "type": "string", "enum": ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] },
        "scale_mode": { "type": "string", "enum": ["dorian", "aeolian", "phrygian", "lydian", "minor_pentatonic", "cinematic_dark"] },
        "base_bpm": { "type": "integer", "minimum": 40, "maximum": 200 },
        "intensity_curve": { "type": "string", "enum": ["exponential_build", "sudden_drop", "sustained_tension", "dynamic_waves"] }
      }
    },
    "foley_events": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["timestamp_ms", "frame_number", "category", "patch_type", "velocity", "pan", "parameters"],
        "properties": {
          "timestamp_ms": { "type": "integer" },
          "frame_number": { "type": "integer" },
          "category": { "type": "string", "enum": ["impact_heavy", "impact_metallic", "whoosh_pass", "footstep_wood", "footstep_gravel", "ambient_glitch"] },
          "patch_type": { "type": "string", "enum": ["modal_resonator", "granular_cluster", "filtered_noise_burst"] },
          "velocity": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
          "pan": { "type": "number", "minimum": -1.0, "maximum": 1.0 },
          "parameters": {
            "type": "object",
            "required": ["fundamental_freq", "decay_seconds", "brightness", "resonance_q"],
            "properties": {
              "fundamental_freq": { "type": "number" },
              "decay_seconds": { "type": "number" },
              "brightness": { "type": "number" },
              "resonance_q": { "type": "number" }
            }
          }
        }
      }
    },
    "stem_automations": {
      "type": "object",
      "required": ["atmosphere_cutoff", "drone_density"],
      "properties": {
        "atmosphere_cutoff": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["timestamp_ms", "value_hz"],
            "properties": { "timestamp_ms": { "type": "integer" }, "value_hz": { "type": "number" } }
          }
        },
        "drone_density": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["timestamp_ms", "gain"],
            "properties": { "timestamp_ms": { "type": "integer" }, "gain": { "type": "number" } }
          }
        }
      }
    }
  }
}
Do NOT wrap your JSON in markdown code blocks or add preamble/postscript text. Output raw JSON only.`;

/**
 * Validates and strictly sanitizes a SonicFrameCueSheet object.
 * Fixes missing fields or invalid enums to ensure strict compliance with SONICFRAME_ARCHITECTURE.pdf.
 */
export function validateAndSanitizeCueSheet(cueSheet, telemetry = {}, mood = "cinematic_dark") {
  if (!cueSheet || typeof cueSheet !== "object") {
    return generateDeterministicCueSheet(telemetry, mood);
  }

  // 1. Composition Profile
  const rawProfile = cueSheet.composition_profile || {};
  let key_root = typeof rawProfile.key_root === "string" ? rawProfile.key_root.toUpperCase().trim() : "D";
  if (!VALID_KEYS.includes(key_root)) {
    key_root = mood.includes("playful") ? "C" : mood.includes("action") ? "E" : mood.includes("ambient") ? "A" : "D";
  }

  let scale_mode = typeof rawProfile.scale_mode === "string" ? rawProfile.scale_mode.toLowerCase().trim() : "cinematic_dark";
  if (!VALID_SCALE_MODES.includes(scale_mode)) {
    if (scale_mode.includes("minor")) scale_mode = "aeolian";
    else if (scale_mode.includes("major")) scale_mode = "lydian";
    else scale_mode = mood.includes("playful") ? "lydian" : mood.includes("ambient") ? "phrygian" : "cinematic_dark";
  }

  let base_bpm = Number.isInteger(rawProfile.base_bpm) ? rawProfile.base_bpm : Math.round(Number(rawProfile.base_bpm) || 88);
  base_bpm = Math.max(40, Math.min(200, base_bpm));

  let intensity_curve = typeof rawProfile.intensity_curve === "string" ? rawProfile.intensity_curve.toLowerCase().trim() : "exponential_build";
  if (!VALID_CURVES.includes(intensity_curve)) {
    intensity_curve = "exponential_build";
  }

  const composition_profile = {
    key_root,
    scale_mode,
    base_bpm,
    intensity_curve
  };

  // 2. Foley Events
  const rawEvents = Array.isArray(cueSheet.foley_events) ? cueSheet.foley_events : [];
  const durationSec = Number(telemetry.durationSeconds) || 15;
  const maxMs = Math.round(durationSec * 1000);

  const foley_events = rawEvents.map((evt, idx) => {
    const rawTs = Number(evt.timestamp_ms);
    const timestamp_ms = Number.isFinite(rawTs) ? Math.max(0, Math.min(maxMs + 2000, Math.round(rawTs))) : Math.round(idx * 800);
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
    const defaultFreq = category === "impact_heavy" ? 65 : category === "impact_metallic" ? 360 : category === "footstep_wood" ? 130 : 250;
    const fundamental_freq = Number.isFinite(Number(rawParams.fundamental_freq)) && Number(rawParams.fundamental_freq) > 0 ? Number(rawParams.fundamental_freq) : defaultFreq;
    const decay_seconds = Number.isFinite(Number(rawParams.decay_seconds)) && Number(rawParams.decay_seconds) > 0 ? Number(rawParams.decay_seconds) : (category.startsWith("impact") ? 0.6 : 0.25);
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

  // Sort events chronologically
  foley_events.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  // If foley_events is empty, fallback to detectedImpacts or synthesize default events
  if (foley_events.length === 0) {
    const fallbackEvents = generateDeterministicFoleyEvents(telemetry, mood);
    foley_events.push(...fallbackEvents);
  }

  // 3. Stem Automations
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
    const defaultAutomations = generateDeterministicAutomations(telemetry);
    if (atmosphere_cutoff.length === 0) atmosphere_cutoff = defaultAutomations.atmosphere_cutoff;
    if (drone_density.length === 0) drone_density = defaultAutomations.drone_density;
  }

  // Ensure automations are chronologically ordered
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
 * Deterministic helper to synthesize foley events directly from optical flow telemetry.
 */
function generateDeterministicFoleyEvents(telemetry = {}, mood = "cinematic_dark") {
  const events = [];
  const durationSec = Number(telemetry.durationSeconds) || 15;
  const impacts = Array.isArray(telemetry.detectedImpacts) ? telemetry.detectedImpacts : [];

  if (impacts.length > 0) {
    impacts.forEach((imp, i) => {
      const ts = Math.round(imp.timeMs != null ? imp.timeMs : (imp.frameIndex ? imp.frameIndex / 30 * 1000 : i * 1500));
      const frame = imp.frameIndex != null ? imp.frameIndex : Math.round(ts * 30 / 1000);
      const energy = Math.max(0.1, Math.min(1.0, Number(imp.energy) || 0.6));
      const pan = Math.max(-1.0, Math.min(1.0, Number(imp.centroidX) || 0.0));

      let category = "impact_heavy";
      let patch_type = "modal_resonator";
      let fundamental_freq = 65;
      let decay_seconds = 0.55 + energy * 0.35;
      let brightness = 0.75;
      let resonance_q = 6.0;

      if (energy > 0.75) {
        if (i % 2 === 1) {
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

      events.push({
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
    // Detect energy peaks from summary samples
    const samples = telemetry.summary;
    for (let i = 1; i < samples.length - 1; i++) {
      const prev = samples[i - 1].kineticEnergy || 0;
      const curr = samples[i].kineticEnergy || 0;
      const next = samples[i + 1].kineticEnergy || 0;

      if (curr > 0.35 && curr >= prev && curr >= next) {
        const ts = samples[i].timeMs || Math.round(i * 100);
        const pan = samples[i].centroidX || 0.0;
        events.push({
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

  // Ensure at least 3 aesthetic cues exist for any clip
  if (events.length === 0) {
    const totalMs = Math.round(durationSec * 1000);
    [0.2, 0.5, 0.85].forEach((ratio, idx) => {
      const ts = Math.round(totalMs * ratio);
      events.push({
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

  return events;
}

/**
 * Deterministic helper to synthesize stem automations from optical flow samples.
 */
function generateDeterministicAutomations(telemetry = {}) {
  const durationSec = Number(telemetry.durationSeconds) || 15;
  const totalMs = Math.round(durationSec * 1000);
  const atmosphere_cutoff = [];
  const drone_density = [];

  const samples = Array.isArray(telemetry.summary) && telemetry.summary.length > 0 ? telemetry.summary : null;

  if (samples) {
    const step = Math.max(1, Math.floor(samples.length / 15));
    for (let i = 0; i < samples.length; i += step) {
      const s = samples[i];
      const ts = Math.round(s.timeMs || (i / samples.length * totalMs));
      const energy = s.kineticEnergy || 0.1;
      const divergence = s.divergence || 0.0;

      // Positive divergence (expansion/zoom-in) sweeps filter upward
      const cutoff = Math.round(Math.max(250, Math.min(7500, 400 + (divergence + 0.5) * 1200 + energy * 2800)));
      const gain = Number(Math.max(0.1, Math.min(0.95, 0.2 + energy * 0.65)).toFixed(3));

      atmosphere_cutoff.push({ timestamp_ms: ts, value_hz: cutoff });
      drone_density.push({ timestamp_ms: ts, gain });
    }
  } else {
    const points = 8;
    for (let i = 0; i <= points; i++) {
      const ts = Math.round((i / points) * totalMs);
      const progress = i / points;
      // Exponential curve buildup
      const cutoff = Math.round(350 + Math.pow(progress, 1.8) * 3200);
      const gain = Number((0.2 + Math.pow(progress, 1.5) * 0.6).toFixed(3));
      atmosphere_cutoff.push({ timestamp_ms: ts, value_hz: cutoff });
      drone_density.push({ timestamp_ms: ts, gain });
    }
  }

  return { atmosphere_cutoff, drone_density };
}

/**
 * Generates a complete, deterministic, schema-compliant cue sheet offline or when no LLM key is set.
 */
export function generateDeterministicCueSheet(telemetry = {}, mood = "cinematic_dark") {
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

  const foley_events = generateDeterministicFoleyEvents(telemetry, normMood);
  const stem_automations = generateDeterministicAutomations(telemetry);

  return {
    composition_profile: {
      key_root,
      scale_mode,
      base_bpm,
      intensity_curve
    },
    foley_events,
    stem_automations
  };
}

/**
 * Netlify Function Handler: POST /.netlify/functions/orchestrate
 */
export default async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  let body = {};
  try {
    body = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  const telemetry = body.telemetry || {};
  const mood = typeof body.mood === "string" ? body.mood : "cinematic_dark";

  // Check API keys
  const nvidiaKey = process.env.NVIDIA_API_KEY || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith("nvapi-") ? process.env.GEMINI_API_KEY : null);
  const geminiKey = process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith("nvapi-") ? process.env.GEMINI_API_KEY : null;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!nvidiaKey && !geminiKey && !openaiKey) {
    // Graceful offline fallback: Generate deterministic cue sheet
    const cueSheet = generateDeterministicCueSheet(telemetry, mood);
    return new Response(
      JSON.stringify({
        success: true,
        source: "algorithmic_fallback",
        message: "Generated cue sheet using local optical-flow heuristic engine (no LLM key configured).",
        cueSheet
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      }
    );
  }

  // Attempt LLM generation
  try {
    let rawCueSheet = null;

    if (nvidiaKey) {
      const model = process.env.NVIDIA_MODEL || "google/diffusiongemma-26b-a4b-it";
      const prompt = `Generate a frame-locked scoring cue sheet for this silent video telemetry. Output strictly valid JSON conforming to the schema.
Desired Mood: ${mood}
Duration: ${telemetry.durationSeconds || 15}s
Total Video Frames: ${telemetry.totalFrames || Math.round((telemetry.durationSeconds || 15) * 30)}
Detected Impact Points:
${JSON.stringify(telemetry.detectedImpacts || [])}
Downsampled 10Hz Optical Flow Telemetry:
${JSON.stringify((telemetry.summary || []).slice(0, 150))}`;

      try {
        const nvRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nvidiaKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 1500
          })
        });

        if (nvRes.ok) {
          const nvData = await nvRes.json();
          const content = nvData.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            rawCueSheet = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (err) {
        console.warn("NVIDIA orchestrate failed, falling back to algorithmic:", err.message);
      }
    }

    if (!rawCueSheet && geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      // Support model selection with fallback
      const modelNames = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];
      let lastErr = null;

      for (const modelName of modelNames) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2
            }
          });

          const prompt = `Generate a frame-locked scoring cue sheet for this silent video telemetry.
Desired Mood: ${mood}
Duration: ${telemetry.durationSeconds || 15}s
Total Video Frames: ${telemetry.totalFrames || Math.round((telemetry.durationSeconds || 15) * 30)}
Detected Impact Points:
${JSON.stringify(telemetry.detectedImpacts || [])}
Downsampled 10Hz Optical Flow Telemetry:
${JSON.stringify((telemetry.summary || []).slice(0, 150))}`;

          const result = await model.generateContent(prompt);
          const responseText = result.response?.text();
          if (responseText) {
            // Strip any accidental markdown formatting
            const cleaned = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
            rawCueSheet = JSON.parse(cleaned);
            if (rawCueSheet) break;
          }
        } catch (err) {
          lastErr = err;
          console.warn(`Gemini model ${modelName} failed, trying next:`, err.message);
        }
      }

      if (!rawCueSheet && lastErr) {
        throw lastErr;
      }
    } else if (openaiKey) {
      // Direct fetch to OpenAI endpoint
      const prompt = `Generate a frame-locked scoring cue sheet for this silent video telemetry.
Desired Mood: ${mood}
Duration: ${telemetry.durationSeconds || 15}s
Total Video Frames: ${telemetry.totalFrames || Math.round((telemetry.durationSeconds || 15) * 30)}
Detected Impact Points:
${JSON.stringify(telemetry.detectedImpacts || [])}
Downsampled 10Hz Optical Flow Telemetry:
${JSON.stringify((telemetry.summary || []).slice(0, 150))}`;

      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt }
          ]
        })
      });

      if (!aiRes.ok) {
        throw new Error(`OpenAI error: HTTP ${aiRes.status}`);
      }
      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content;
      rawCueSheet = JSON.parse(content);
    }

    // Validate and sanitize the LLM-generated cue sheet
    const cueSheet = validateAndSanitizeCueSheet(rawCueSheet, telemetry, mood);

    return new Response(
      JSON.stringify({
        success: true,
        source: "llm_orchestrator",
        cueSheet
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Orchestrator LLM invocation error, falling back to local engine:", error);
    // Graceful fallback on LLM failure so studio ALWAYS functions
    const cueSheet = generateDeterministicCueSheet(telemetry, mood);
    return new Response(
      JSON.stringify({
        success: true,
        source: "algorithmic_fallback",
        warning: `LLM generation issue: ${error.message}. Studio active with local heuristic cue sheet.`,
        cueSheet
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      }
    );
  }
};

export const config = {
  path: "/.netlify/functions/orchestrate"
};

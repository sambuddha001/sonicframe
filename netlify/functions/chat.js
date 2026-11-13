import { GoogleGenerativeAI } from "@google/generative-ai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are SonicFrame AI Co-Pilot, the creative sound designer built into the SonicFrame platform by Tetrabyte.

SonicFrame is an in-browser sound-design and audio post-production studio that lets users:
- Analyze video clips with real-time optical flow (detecting impacts, scene shifts, and movement pulses).
- Auto-generate synchronised Foley cues, ambient textures, and rhythmic pulses from motion telemetry.
- Mix, layer, and fine-tune procedural audio stems inside a built-in mixer and timeline.

Your role:
- Help users plan sound design, understand motion-analysis results, pick Foley strategies, and navigate the SonicFrame studio workflow.
- Give practical, creative suggestions for audio post-production and scoring.
- If asked to alter cue parameters (e.g. footsteps, decay, tension, key), explain the exact parameter adjustments clearly.
- Be concise, friendly, and knowledgeable about film sound, physical modeling, and composition.

Keep replies focused and under 300 words unless the user asks for more detail.`;

export default async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    // Provider-agnostic configuration without key-prefix sniffing
    const rawProvider = process.env.LLM_PROVIDER?.toLowerCase();
    const provider =
      rawProvider ||
      (process.env.NVIDIA_API_KEY ? "nvidia" :
       process.env.OPENAI_API_KEY ? "openai" :
       process.env.GEMINI_API_KEY ? "google" : null);

    const apiKey =
      process.env.LLM_API_KEY ||
      (provider === "nvidia" ? process.env.NVIDIA_API_KEY :
       provider === "openai" ? process.env.OPENAI_API_KEY :
       provider === "google" ? process.env.GEMINI_API_KEY : null);

    if (!apiKey || !provider) {
      throw new Error(
        "No AI API key configured. Set LLM_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or NVIDIA_API_KEY in your environment variables."
      );
    }

    const body = await req.json();
    const message = body.message;

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- Path A: NVIDIA / OpenAI-compatible endpoint ---
    if (provider === "nvidia") {
      // Verified model name on build.nvidia.com
      const model = process.env.LLM_MODEL || process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";
      const nvRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message.trim() },
          ],
          temperature: 0.3,
          max_tokens: 350,
        }),
      });

      if (!nvRes.ok) {
        const errText = await nvRes.text();
        throw new Error(`NVIDIA API HTTP ${nvRes.status}: ${errText}`);
      }

      const nvData = await nvRes.json();
      const reply =
        nvData.choices?.[0]?.message?.content?.trim() ||
        "Sorry, I could not generate a response.";

      return new Response(
        JSON.stringify({ reply, model, provider: "nvidia" }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // --- Path B: OpenAI Endpoint ---
    if (provider === "openai") {
      const model = process.env.LLM_MODEL || "gpt-4o-mini";
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message.trim() },
          ],
          temperature: 0.3,
          max_tokens: 350,
        }),
      });

      if (!openAiRes.ok) {
        const errText = await openAiRes.text();
        throw new Error(`OpenAI API HTTP ${openAiRes.status}: ${errText}`);
      }

      const openAiData = await openAiRes.json();
      const reply =
        openAiData.choices?.[0]?.message?.content?.trim() ||
        "Sorry, I could not generate a response.";

      return new Response(
        JSON.stringify({ reply, model, provider: "openai" }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // --- Path C: Google Gemini API ---
    const modelName = process.env.LLM_MODEL || "gemini-1.5-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(message.trim());
    const reply =
      result.response?.text()?.trim() ||
      "Sorry, I could not generate a response. Please try again.";

    return new Response(
      JSON.stringify({ reply, model: modelName, provider: "google" }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Chat function error:", error);

    const statusCode = error?.status || error?.httpStatusCode || 500;
    let userMessage = error.message || "Internal server error";

    if (statusCode === 400 || error.message?.includes("API_KEY_INVALID")) {
      userMessage = "AI API key is invalid. Please check your environment variables.";
    } else if (statusCode === 429) {
      userMessage = "Rate limit exceeded. Please wait a moment and try again.";
    }

    return new Response(JSON.stringify({ error: userMessage }), {
      status: statusCode,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
};

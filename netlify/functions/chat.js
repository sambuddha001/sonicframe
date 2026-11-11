import { GoogleGenerativeAI } from "@google/generative-ai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are SonicFrame AI Co-Pilot, the creative assistant built into the SonicFrame platform by Tetrabyte.

SonicFrame is a browser-based sound-design and audio post-production studio that lets users:
- Upload video clips and run real-time motion analysis (detecting impacts, scene shifts, and movement pulses).
- Auto-generate synchronised Foley cues, ambient textures, and rhythmic pulses from the motion data.
- Mix, layer, and fine-tune the generated audio stems inside a built-in mixer and timeline.

Your role:
- Help users plan sound design, understand motion-analysis results, pick Foley strategies, and navigate the SonicFrame studio workflow.
- Give practical, creative suggestions for audio post-production.
- Be concise, friendly, and knowledgeable about film sound, Foley art, sound effects, and music production.
- If the user asks something unrelated to audio/sound/video, answer briefly but gently steer back to your domain.

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
    const nvidiaKey =
      process.env.NVIDIA_API_KEY ||
      (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith("nvapi-")
        ? process.env.GEMINI_API_KEY
        : null);
    const geminiKey =
      process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith("nvapi-")
        ? process.env.GEMINI_API_KEY
        : null;

    if (!nvidiaKey && !geminiKey) {
      throw new Error(
        "No AI API key configured. Add NVIDIA_API_KEY or GEMINI_API_KEY to your environment variables."
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

    // --- Path A: NVIDIA API (e.g. nvapi-...) ---
    if (nvidiaKey) {
      const model = process.env.NVIDIA_MODEL || "google/diffusiongemma-26b-a4b-it";
      const nvRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${nvidiaKey}`,
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

    // --- Path B: Google Gemini API ---
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(message.trim());
    const reply =
      result.response?.text()?.trim() ||
      "Sorry, I could not generate a response. Please try again.";

    return new Response(
      JSON.stringify({ reply, model: "gemini-1.5-flash", provider: "google" }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Chat function error:", error);

    const statusCode = error?.status || error?.httpStatusCode || 500;
    let userMessage = error.message || "Internal server error";

    if (error.message?.includes("nvapi") || error.message?.includes("NVIDIA")) {
      userMessage = error.message;
    } else if (statusCode === 400 || error.message?.includes("API_KEY_INVALID")) {
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

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured. Add it in Netlify → Site configuration → Environment variables."
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash-lite",
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(message.trim());
    const reply =
      result.response?.text()?.trim() ||
      "Sorry, I could not generate a response. Please try again.";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat function error:", error);

    const statusCode = error?.status || error?.httpStatusCode || 500;
    let userMessage;

    if (statusCode === 400 || error.message?.includes("API_KEY_INVALID")) {
      userMessage = "Gemini API key is invalid. Please check your Netlify environment variable.";
    } else if (statusCode === 429) {
      userMessage = "Rate limit exceeded. Please wait a moment and try again.";
    } else if (error.message?.includes("SAFETY")) {
      userMessage = "The response was blocked by safety filters. Please rephrase your question.";
    } else {
      userMessage = error.message || "Internal server error";
    }

    return new Response(JSON.stringify({ error: userMessage }), {
      status: statusCode,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
};

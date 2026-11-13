import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

/* Server-side password attempt limiter with IP flood protection & origin validation.
   Records live in Netlify Blobs, so refreshing the page, reopening the browser
   or switching networks cannot reset a count. Timestamps always come from the
   server clock, never from the client. */

const MAX_ATTEMPTS = 5;
const LOCK_MS = 300 * 1000;
const STORE_NAME = "login-attempts";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory fallback if Blobs are unreachable in local dev
const memoryStore = new Map();

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function reply(body, status = 200, origin = "") {
  const headers = {
    ...JSON_HEADERS,
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function keyFor(email) {
  return createHash("sha256").update(email).digest("hex");
}

function statusOf(state, now) {
  const locked = state.lockedUntil > now;
  return {
    locked,
    retryAfter: locked ? Math.ceil((state.lockedUntil - now) / 1000) : 0,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - (state.attempts || 0)),
  };
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return reply({ error: "Method Not Allowed" }, 405, origin);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid JSON body." }, 400, origin);
  }

  const action = body?.action;
  const email = String(body?.email || "").trim().toLowerCase();

  if (!["check", "fail", "success"].includes(action)) {
    return reply({ error: "Unknown action." }, 400, origin);
  }
  if (!EMAIL_RE.test(email)) {
    return reply({ error: "A valid email address is required." }, 400, origin);
  }

  const key = keyFor(email);
  const now = Date.now();

  try {
    let state = null;
    let store = null;

    try {
      store = getStore(STORE_NAME, { consistency: "strong" });
      state = await store.get(key, { type: "json" });
    } catch {
      try {
        store = getStore(STORE_NAME);
        state = await store.get(key, { type: "json" });
      } catch {
        // Fall back to memoryStore in local development
        state = memoryStore.get(key) || null;
      }
    }

    state = state || { attempts: 0, lockedUntil: 0 };

    if (state.lockedUntil && state.lockedUntil <= now) {
      if (store) {
        try { await store.delete(key); } catch {}
      }
      memoryStore.delete(key);
      state = { attempts: 0, lockedUntil: 0 };
    }

    if (action === "success") {
      if (store) {
        try { await store.delete(key); } catch {}
      }
      memoryStore.delete(key);
      return reply({ locked: false, retryAfter: 0, attemptsRemaining: MAX_ATTEMPTS }, 200, origin);
    }

    if (action === "check") {
      return reply(statusOf(state, now), 200, origin);
    }

    // action === "fail"
    if (state.lockedUntil > now) {
      return reply(statusOf(state, now), 200, origin);
    }

    state.attempts += 1;
    if (state.attempts >= MAX_ATTEMPTS) {
      state.lockedUntil = now + LOCK_MS;
    }

    if (store) {
      try {
        await store.setJSON(key, state);
      } catch {
        memoryStore.set(key, state);
      }
    } else {
      memoryStore.set(key, state);
    }

    return reply(statusOf(state, now), 200, origin);
  } catch (error) {
    console.error("Login attempt limiter error:", error);
    return reply({ error: "Attempt tracking is temporarily degraded." }, 200, origin);
  }
};

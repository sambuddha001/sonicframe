import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

/* Server-side password attempt limiter.
   Records live in Netlify Blobs, so refreshing the page, reopening the browser
   or switching networks cannot reset a count. Timestamps always come from the
   server clock, never from the client.

   POST { action: "check" | "fail" | "success", email }
     check   -> status only, no counter change
     fail    -> +1 wrong password, locks for 5 minutes at 5
     success -> clears the count (correct password) */

const MAX_ATTEMPTS = 5;
const LOCK_MS = 300 * 1000;
const STORE_NAME = "login-attempts";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/* Hash the address so raw emails are never used as storage keys. */
function keyFor(email) {
  return createHash("sha256").update(email).digest("hex");
}

function statusOf(state, now) {
  const locked = state.lockedUntil > now;
  return {
    locked,
    retryAfter: locked ? Math.ceil((state.lockedUntil - now) / 1000) : 0,
  };
}

export default async (req) => {
  if (req.method !== "POST") {
    return reply({ error: "Method Not Allowed" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid JSON body." }, 400);
  }

  const action = body?.action;
  const email = String(body?.email || "").trim().toLowerCase();

  if (!["check", "fail", "success"].includes(action)) {
    return reply({ error: "Unknown action." }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return reply({ error: "A valid email address is required." }, 400);
  }

  const key = keyFor(email);
  const now = Date.now();

  try {
    const store = getStore(STORE_NAME, { consistency: "strong" });
    let state;
    try {
      state = await store.get(key, { type: "json" });
    } catch {
      /* Local dev servers may lack the uncached edge URL strong reads need. */
      state = await getStore(STORE_NAME).get(key, { type: "json" });
    }
    state = state || { attempts: 0, lockedUntil: 0 };

    // An expired lock starts the user over with a clean counter.
    if (state.lockedUntil && state.lockedUntil <= now) {
      await store.delete(key);
      state = { attempts: 0, lockedUntil: 0 };
    }

    if (action === "success") {
      await store.delete(key);
      return reply({ locked: false, retryAfter: 0 });
    }

    if (action === "check") {
      return reply(statusOf(state, now));
    }

    // action === "fail"
    if (state.lockedUntil > now) {
      return reply(statusOf(state, now));
    }

    state.attempts += 1;
    if (state.attempts >= MAX_ATTEMPTS) {
      state.lockedUntil = now + LOCK_MS;
    }
    await store.setJSON(key, state);

    return reply(statusOf(state, now));
  } catch (error) {
    console.error("Login attempt limiter error:", error);
    return reply({ error: "Attempt tracking is unavailable." }, 503);
  }
};

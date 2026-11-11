/**
 * SonicFrame Local Development Server
 * Serves static files on port 8000 and handles serverless Netlify function routes
 * with live AI API integration (NVIDIA / Gemini).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Simple .env file loader
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    });
    console.log('✓ Loaded environment variables from .env');
  }
} catch (e) {
  console.warn('Could not read .env:', e.message);
}

// Dynamically import Netlify functions
let chatHandler = null;
let orchestrateHandler = null;

try {
  const chatMod = await import('./netlify/functions/chat.js');
  chatHandler = chatMod.default;
} catch (e) {
  console.warn('Could not load netlify/functions/chat.js:', e.message);
}

try {
  const orchMod = await import('./netlify/functions/orchestrate.js');
  orchestrateHandler = orchMod.default;
} catch (e) {
  console.warn('Could not load netlify/functions/orchestrate.js:', e.message);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

// In-memory login attempt store for local dev
const localAttemptStore = new Map();

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8000'}`);
  const pathname = parsedUrl.pathname;

  // 1. API Route: /.netlify/functions/chat
  if (pathname === '/.netlify/functions/chat') {
    if (chatHandler) {
      try {
        const bodyChunks = [];
        for await (const chunk of req) {
          bodyChunks.push(chunk);
        }
        const bodyBuffer = Buffer.concat(bodyChunks);

        const webReq = new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers: req.headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuffer : undefined
        });

        const webRes = await chatHandler(webReq);
        res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
        const resText = await webRes.text();
        res.end(resText);
        return;
      } catch (err) {
        console.error('Local chat route error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }
  }

  // 2. API Route: /.netlify/functions/orchestrate
  if (pathname === '/.netlify/functions/orchestrate') {
    if (orchestrateHandler) {
      try {
        const bodyChunks = [];
        for await (const chunk of req) {
          bodyChunks.push(chunk);
        }
        const bodyBuffer = Buffer.concat(bodyChunks);

        const webReq = new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers: req.headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuffer : undefined
        });

        const webRes = await orchestrateHandler(webReq);
        res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
        const resText = await webRes.text();
        res.end(resText);
        return;
      } catch (err) {
        console.error('Local orchestrate route error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }
  }

  // 3. API Route: /.netlify/functions/login-attempts
  if (pathname === '/.netlify/functions/login-attempts') {
    if (req.method === 'POST') {
      const bodyChunks = [];
      for await (const chunk of req) bodyChunks.push(chunk);
      try {
        const payload = JSON.parse(Buffer.concat(bodyChunks).toString());
        const action = payload.action;
        const email = (payload.email || '').toLowerCase().trim();
        const now = Date.now();

        let rec = localAttemptStore.get(email) || { count: 0, lockedUntil: 0 };

        if (action === 'status') {
          const locked = rec.lockedUntil > now;
          const retryAfter = locked ? Math.ceil((rec.lockedUntil - now) / 1000) : 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ locked, retryAfter, attempts: rec.count }));
          return;
        }

        if (action === 'record_failure') {
          if (rec.lockedUntil <= now) {
            rec.count += 1;
            if (rec.count >= 5) {
              rec.lockedUntil = now + 5 * 60 * 1000;
            }
          }
          localAttemptStore.set(email, rec);
          const locked = rec.lockedUntil > now;
          const retryAfter = locked ? Math.ceil((rec.lockedUntil - now) / 1000) : 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ locked, retryAfter, count: rec.count, attemptsRemaining: Math.max(0, 5 - rec.count) }));
          return;
        }

        if (action === 'clear' || action === 'record_success') {
          localAttemptStore.delete(email);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, cleared: true }));
          return;
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
    }
  }

  // 4. Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`=======================================================`);
    console.log(`  🎵 SonicFrame Studio & AI Server running at:`);
    console.log(`     http://localhost:${port}`);
    console.log(`  ✦ Active AI Provider: ${process.env.NVIDIA_API_KEY ? 'NVIDIA Cloud API (' + (process.env.NVIDIA_MODEL || 'google/diffusiongemma-26b-a4b-it') + ')' : 'Local Heuristics'}`);
    console.log(`=======================================================`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(PORT) + 1;
    console.warn(`Port ${PORT} is currently in use. Trying port ${nextPort}...`);
    startServer(nextPort);
  } else {
    console.error('Server error:', err);
  }
});

const PORT = process.env.PORT || 8000;
startServer(PORT);

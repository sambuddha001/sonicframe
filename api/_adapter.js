/**
 * Universal Adapter for Vercel Node Serverless Functions & Web API Handlers
 * Allows identical handler logic to run seamlessly on Vercel Node, Vercel Edge,
 * Netlify Functions, and custom Node http servers.
 */
export function createVercelHandler(webHandler) {
  return async function (req, res) {
    // 1. If called in Web standard Request/Response signature (e.g. Edge or modern fetch)
    if (!res || typeof res.status !== 'function') {
      return webHandler(req);
    }

    // 2. If called in Vercel Node.js Serverless (IncomingMessage, ServerResponse)
    try {
      let bodyBuffer = undefined;
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
      
      if (hasBody) {
        if (req.body) {
          bodyBuffer = typeof req.body === 'string'
            ? Buffer.from(req.body)
            : Buffer.from(JSON.stringify(req.body));
        } else if (typeof req[Symbol.asyncIterator] === 'function') {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          if (chunks.length > 0) {
            bodyBuffer = Buffer.concat(chunks);
          }
        }
      }

      const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost';
      const proto = req.headers?.['x-forwarded-proto'] || 'https';
      const url = `${proto}://${host}${req.url || '/'}`;

      const webReq = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: bodyBuffer,
      });

      const webRes = await webHandler(webReq);

      // Write status & headers to Vercel ServerResponse
      res.status(webRes.status);
      webRes.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      const text = await webRes.text();
      if (typeof res.send === 'function') {
        return res.send(text);
      } else {
        return res.end(text);
      }
    } catch (err) {
      console.error('Vercel API Handler Error:', err);
      if (!res.headersSent) {
        const payload = JSON.stringify({ error: err.message || 'Internal Server Error' });
        if (typeof res.json === 'function') {
          return res.status(500).json({ error: err.message || 'Internal Server Error' });
        } else if (typeof res.send === 'function') {
          res.setHeader('Content-Type', 'application/json');
          return res.status(500).send(payload);
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(payload);
        }
      }
    }
  };
}

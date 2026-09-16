import type { RequestHandler } from 'express';

const NO_CONTENT = 204;

/**
 * Minimal allow-list CORS. The app is normally same-origin (Vite proxy in development,
 * static hosting in production), so no origins are allowed unless explicitly configured.
 */
export function corsMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.status(NO_CONTENT).end();
        return;
      }
    }
    next();
  };
}

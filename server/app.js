// Express app for the Let's Ketchup Care Closet survey.
// Exported without listening so both server/index.js (Node) and api/index.js (Vercel)
// can reuse it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { survey } from './survey.js';
import { validateSubmission, Invalid } from './validate.js';
import { initStorage } from './storage.js';
import { responsesToCsv } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '..', 'client', 'dist');
const CLIENT_INDEX = path.join(CLIENT_DIST, 'index.html');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render / Vercel put us behind a proxy; needed for real client IPs
app.use(express.json({ limit: '100kb' }));

// ---------------------------------------------------------------- rate limiting
// In-memory sliding window. This survey sees ~10 responses a year, so a Map is plenty;
// it resets on restart, which is fine.
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SUBMISSIONS = 20;
const hits = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_SUBMISSIONS) {
    res.set('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Too many submissions from this address. Please try again later.' });
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  next();
}

// ---------------------------------------------------------------- admin auth
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    return res.status(401).json({ error: 'Admin access is not configured (ADMIN_KEY is unset).' });
  }
  const provided = typeof req.query.key === 'string' ? req.query.key : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: 'Invalid admin key.' });
  next();
}

// ---------------------------------------------------------------- routes
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

// Convenience: the canonical survey definition, so the client can fetch it if it
// prefers not to bundle shared/survey.json.
app.get('/api/survey', (_req, res) => res.json(survey));

app.post('/api/responses', rateLimit, async (req, res, next) => {
  try {
    const clean = validateSubmission(req.body);
    if (!clean.meta.userAgent && req.get('user-agent')) clean.meta.userAgent = req.get('user-agent');
    const store = await initStorage();
    const { id } = await store.insertResponse(clean);
    res.status(201).json({ id });
  } catch (err) {
    if (err instanceof Invalid) return res.status(400).json({ error: err.message });
    next(err);
  }
});

app.get('/api/admin/responses', requireAdmin, async (_req, res, next) => {
  try {
    const store = await initStorage();
    const responses = await store.listResponses();
    res.json({ count: responses.length, responses });
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/responses.csv', requireAdmin, async (_req, res, next) => {
  try {
    const store = await initStorage();
    const csv = responsesToCsv(await store.listResponses());
    const stamp = new Date().toISOString().slice(0, 10);
    res.type('text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="care-closet-responses-${stamp}.csv"`);
    res.send('﻿' + csv); // BOM so Excel reads UTF-8 correctly
  } catch (err) {
    next(err);
  }
});

// Anything else under /api is a genuine 404 (never fall through to the SPA).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------------------------------------------------------------- static client
// In development the Vite dev server serves the client and proxies /api here, so
// client/dist may not exist yet. Both paths below no-op gracefully when it is missing.
app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));

// (written as `app.use` rather than `app.get('*')` so it works on Express 4 and 5)
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!fs.existsSync(CLIENT_INDEX)) {
    return res.status(404).type('text/plain').send(
      'The survey client has not been built yet. Run `npm run build`, or use the Vite dev server (`npm run dev --prefix client`).'
    );
  }
  res.sendFile(CLIENT_INDEX);
});

// ---------------------------------------------------------------- errors
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body was not valid JSON.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

export default app;

// Local / Render entrypoint: load .env (if present), initialise storage, then listen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { getStorage, initStorage } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Minimal .env support so the README's `cp .env.example .env` actually works.
 * No dependency, no magic: KEY=value lines, `#` comments, optional quotes.
 * Real environment variables always win, so Render/Vercel are unaffected
 * (they have no .env file anyway).
 */
function loadDotEnv() {
  const file = path.resolve(__dirname, '..', '.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return; // no .env — perfectly normal
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

const port = Number(process.env.PORT) || 3001;

initStorage()
  .then(() => {
    app.listen(port, () => {
      console.log(`Care Closet survey server listening on http://localhost:${port}`);
      console.log(`Storage: ${getStorage().describe()}`);
      if (!process.env.ADMIN_KEY) {
        console.warn('ADMIN_KEY is not set — the admin endpoints will refuse every request.');
      }
    });
  })
  .catch((err) => {
    console.error('Failed to start: could not initialise storage.');
    console.error(err);
    process.exit(1);
  });

// Vercel serverless entrypoint. Reuses the same Express app as server/index.js,
// but never calls listen() — Vercel invokes the exported handler directly.
//
// Note: Vercel has no persistent disk, so set DATABASE_URL (e.g. a free Neon
// Postgres database) in the project's environment variables. See README.
import app from '../server/app.js';

export default app;

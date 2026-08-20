// Storage adapters: { init, insertResponse, listResponses }
//
//   default            -> SQLite file at $DATA_DIR/responses.db (better-sqlite3)
//   $DATABASE_URL set  -> Postgres (pg), for hosts without a persistent disk (Vercel)
//
// Both adapters store the same table:
//   responses(id TEXT primary key, survey_id TEXT, submitted_at TEXT,
//             answers_json TEXT, meta_json TEXT)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rowToResponse = (row) => ({
  id: row.id,
  surveyId: row.survey_id,
  submittedAt: row.submitted_at,
  answers: JSON.parse(row.answers_json ?? '{}'),
  meta: JSON.parse(row.meta_json ?? '{}'),
});

function createSqliteAdapter({ dataDir }) {
  let db;
  return {
    kind: 'sqlite',
    describe: () => `SQLite at ${path.join(dataDir, 'responses.db')}`,
    async init() {
      const { default: Database } = await import('better-sqlite3');
      fs.mkdirSync(dataDir, { recursive: true });
      db = new Database(path.join(dataDir, 'responses.db'));
      db.pragma('journal_mode = WAL');
      db.exec(`CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        survey_id TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        answers_json TEXT NOT NULL,
        meta_json TEXT NOT NULL
      )`);
    },
    async insertResponse({ surveyId, answers, meta }) {
      const id = crypto.randomUUID();
      const submittedAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO responses (id, survey_id, submitted_at, answers_json, meta_json)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, surveyId, submittedAt, JSON.stringify(answers), JSON.stringify(meta ?? {}));
      return { id, submittedAt };
    },
    async listResponses() {
      const rows = db
        .prepare('SELECT * FROM responses ORDER BY submitted_at ASC, id ASC')
        .all();
      return rows.map(rowToResponse);
    },
  };
}

function createPostgresAdapter({ databaseUrl }) {
  let pool;
  return {
    kind: 'postgres',
    describe: () => 'Postgres (DATABASE_URL)',
    async init() {
      const { default: pg } = await import('pg');
      pool = new pg.Pool({
        connectionString: databaseUrl,
        // Hosted Postgres (Neon, Render, Supabase…) requires TLS; local usually does not.
        ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: false },
        max: 3,
      });
      await pool.query(`CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        survey_id TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        answers_json TEXT NOT NULL,
        meta_json TEXT NOT NULL
      )`);
    },
    async insertResponse({ surveyId, answers, meta }) {
      const id = crypto.randomUUID();
      const submittedAt = new Date().toISOString();
      await pool.query(
        `INSERT INTO responses (id, survey_id, submitted_at, answers_json, meta_json)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, surveyId, submittedAt, JSON.stringify(answers), JSON.stringify(meta ?? {})]
      );
      return { id, submittedAt };
    },
    async listResponses() {
      const { rows } = await pool.query(
        'SELECT * FROM responses ORDER BY submitted_at ASC, id ASC'
      );
      return rows.map(rowToResponse);
    },
  };
}

export function createStorage(env = process.env) {
  return env.DATABASE_URL
    ? createPostgresAdapter({ databaseUrl: env.DATABASE_URL })
    : createSqliteAdapter({ dataDir: path.resolve(env.DATA_DIR || './data') });
}

// Single shared instance, initialised at most once (works for both a long-running
// server and a serverless function that may be re-used between invocations).
let instance;
let ready;

export function getStorage() {
  if (!instance) instance = createStorage();
  return instance;
}

export function initStorage() {
  const store = getStorage();
  if (!ready) ready = store.init().then(() => store);
  return ready;
}

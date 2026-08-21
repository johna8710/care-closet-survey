# Care Closet Survey — Let's Ketchup

A small web app that replaces the Google Forms end-of-year Care Closet survey. Partner
districts get a clean, one-question-at-a-time survey (including a "split your budget
across three categories so it totals 100%" question and "pick your top 3, then drag them
into order" questions that Google Forms can't do), and you get the results as JSON or a
spreadsheet-ready CSV.

- **Survey wording and questions** live in one file: `shared/survey.json`.
- **Responses** are stored in a small database file (SQLite) on the server, or in Postgres
  if you'd rather use a hosted database.
- **Results** are downloadable at any time with a secret key you choose.

---

## Project structure

```
care-closet-survey/
├── shared/survey.json     ← the survey itself (edit this to change questions)
├── client/                ← the survey people see (Vite + React)
├── server/
│   ├── index.js           ← starts the server
│   ├── app.js             ← the Express app (routes, static files, hardening)
│   ├── validate.js        ← checks every submission against shared/survey.json
│   ├── storage.js         ← SQLite by default, Postgres if DATABASE_URL is set
│   ├── csv.js             ← flattens responses into a spreadsheet
│   └── survey.js          ← loads shared/survey.json
├── api/index.js           ← Vercel entrypoint (reuses server/app.js)
├── render.yaml            ← Render deployment config
├── vercel.json            ← Vercel deployment config
└── package.json           ← server dependencies + scripts
```

---

## Running it on your own computer

You need **Node 20** (check with `node -v`). Node 18 is the oldest version the build
tools accept, but everything here — `package.json`'s `engines`, `render.yaml`, and the
tested setup — targets Node 20, so install Node 20 if you have a choice. Node 12/14/16
will fail at `npm install` on `better-sqlite3`.

```bash
npm install                 # installs the server's dependencies
cp .env.example .env        # then open .env and set ADMIN_KEY
```

`npm run dev` and `npm start` read that `.env` file automatically (real environment
variables win over it, which is why Render and Vercel are unaffected — they have no
`.env` file and you set the values in their dashboards instead).

The survey app has two halves that run separately in development: the API server and the
Vite dev server for the survey pages. Use **two terminal windows**:

```bash
# terminal 1 — API on http://localhost:3001
npm run dev

# terminal 2 — survey pages on http://localhost:5173
npm run dev --prefix client
```

Then open <http://localhost:5173>. The client automatically forwards anything starting
with `/api` to the server on port 3001.

Prefer one window? `npm run dev:all` runs both at once (it uses `concurrently`, already in
the dev dependencies).

To try the real production setup locally:

```bash
npm run build     # builds the client into client/dist
npm start         # serves the survey AND the API from http://localhost:3001
```

---

## Environment variables

| Variable | Needed? | What it does |
| --- | --- | --- |
| `PORT` | no | Port the server listens on. Default `3001`. Render and Vercel set this for you. |
| `ADMIN_KEY` | **yes** | Your password for the results endpoints. Anyone with this string can read every response, so make it long and random. If it isn't set, the results endpoints refuse everything. |
| `DATA_DIR` | no | Folder for the SQLite file `responses.db`. Default `./data`. On Render, `/var/data` (the persistent disk). |
| `DATABASE_URL` | no | If set, responses go to Postgres instead of SQLite. Required on Vercel. |

A good `ADMIN_KEY`: run `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
and paste the result.

`.env.example` lists all four with comments. Locally, copy it to `.env` and the server
picks the values up on start; `.env` is git-ignored, so your key never leaves your
machine.

---

## Deploying to Render (recommended)

Render can run the server *and* keep a real database file on a persistent disk, which
makes it the simplest option.

1. Push this project to a GitHub repository.
2. Go to <https://dashboard.render.com> → **New** → **Blueprint**, and pick the repo.
   Render reads `render.yaml` and proposes one web service called `care-closet-survey`.
3. When it asks for the value of `ADMIN_KEY`, paste your long random string. (You can
   change it later under the service's **Environment** tab.)
4. Click **Apply**. The first deploy takes a few minutes — it installs dependencies,
   builds the survey pages, and starts the server.
5. When it's live, Render gives you a URL like `https://care-closet-survey.onrender.com`.
   Visit it: you should see the survey. Share that link with your district contacts.

What `render.yaml` sets up for you:

- Build: `npm install && npm run build` · Start: `npm start`
- Health check at `/healthz` so Render knows the app is up
- A **1 GB persistent disk mounted at `/var/data`**, with `DATA_DIR=/var/data`, so the
  responses database survives restarts and redeploys
- Node 20

**A note on plans.** Persistent disks require a paid instance type, so `render.yaml` asks
for the inexpensive `starter` plan. If you'd rather stay on Render's free tier, either
remove the `disk:` block and set `plan: free` (responses would then be lost on every
restart — not recommended), or use the Vercel + Neon route below, which is free and
durable.

**Backups.** Every so often, download the CSV (below) and keep a copy in Drive. That is
your backup.

---

## Deploying to Vercel (free, needs a hosted database)

Vercel has no persistent disk, so the SQLite file would vanish between requests. Use a
free Postgres database instead — [Neon](https://neon.tech) works well.

1. Create a free Neon project. Copy its connection string; it looks like
   `postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
2. Push this project to GitHub, then at <https://vercel.com/new> import the repo.
   Leave the build settings alone — `vercel.json` already configures them.
3. Under **Environment Variables**, add:
   - `DATABASE_URL` = the Neon connection string
   - `ADMIN_KEY` = your long random string
4. Deploy. Vercel builds the survey pages into `client/dist` and runs the API from
   `api/index.js`. The table is created automatically the first time a response arrives.

If you ever see responses "disappear" on Vercel, it almost always means `DATABASE_URL`
wasn't set — the app quietly fell back to a temporary SQLite file.

---

## Viewing and exporting results

Two endpoints, both requiring your `ADMIN_KEY`. Replace `YOUR_KEY` and the domain:

**Spreadsheet (this is the one you want):**

```
https://your-app.onrender.com/api/admin/responses.csv?key=YOUR_KEY
```

Paste that in a browser and the CSV downloads; open it in Excel, Numbers, or Google
Sheets.

**Raw data (for developers):**

```
https://your-app.onrender.com/api/admin/responses?key=YOUR_KEY
```

Keep these links private — the key *is* the password. To rotate it, change `ADMIN_KEY` in
your host's dashboard and redeploy.

### CSV column layout

Columns follow the order of questions in `shared/survey.json`.

| Question type | Columns produced |
| --- | --- |
| Text / long text | one column named after the question id (e.g. `students_impacted`) |
| Radio / dropdown | one column with the chosen answer's **label** (e.g. `district` → `Herscher`); plus `district__other_text` when the question allows "Other" |
| Radio with a follow-up | the follow-up gets its own column (`next_contact_info`) |
| Budget split (`allocate`) | one column **per category** holding its percentage (`budget_allocation__food (%)`, `budget_allocation__hygiene (%)`, `budget_allocation__clothing (%)`). Always filled in for a completed response — a category that got nothing shows `0`, not a blank |
| Select-3 + ranking (`select-rank`) | one column **per option** holding that option's rank — `1` is the top pick — blank if it wasn't picked (`nonperishables__ramen (rank)`, `hygiene__soap (rank)`, `clothing__socks (rank)`), plus `…__other (rank)`, `…__other_text`, and `…__none` (`Yes` when the "none" choice was used) |
| Tick all that apply (`multi-select`) | one column **per option**, `Yes` when ticked and blank when not (`sizes__adult_m`), plus `sizes__other` and `sizes__other_text` |
| Select-3 + weights (`select-weight`) | one column **per option** holding that option's percentage, blank if it wasn't picked (`… (%)`), plus `…__other (%)`, `…__other_text`, and `…__none`. *(Still supported; no question in the current survey uses it.)* |

**Skipped questions are blank.** A question that was hidden by a `showIf` rule (see below)
has no answer at all, so every one of its columns is empty — e.g. a district that gave
Clothing 0% has blanks across all the `clothing__…` and `sizes__…` columns, and one that
gave Food 0% has blanks across `nonperishables__…` and `popchips`.

Every row also carries `response_id`, `submitted_at`, and at the end `started_at`,
`completed_at`, `user_agent`. Commas, quotes, and line breaks inside answers are escaped
properly, and the file starts with a byte-order mark so Excel reads accents correctly.

The current survey produces 58 columns, in this order:

```
response_id, submitted_at,
district, district__other_text,
contact_continuation, next_contact_info,
students_impacted,
budget_allocation__food (%), budget_allocation__hygiene (%), budget_allocation__clothing (%),
nonperishables__… (rank) ×5, nonperishables__other (rank), nonperishables__other_text, nonperishables__none,
popchips,
hygiene__… (rank) ×7, hygiene__other (rank), hygiene__other_text, hygiene__none,
clothing__… (rank) ×9, clothing__other (rank), clothing__other_text, clothing__none,
sizes__… ×8, sizes__other, sizes__other_text,
missing_items, testimonial_permission, delivery_feedback, comments,
started_at, completed_at, user_agent
```

---

## The questions

All 13 live in `shared/survey.json`, in this order. "Shown when" marks the questions that
appear only if the respondent put money into that budget category.

| # | Question id | Type | Required | Shown when |
| --- | --- | --- | --- | --- |
| 1 | `district` | select (+ Other) | yes | always |
| 2 | `contact_continuation` | radio (+ follow-up `next_contact_info`) | yes | always |
| 3 | `students_impacted` | text | yes | always |
| 4 | `budget_allocation` | **allocate** — Food / Hygiene / Clothing, must total 100% | yes | always |
| 5 | `nonperishables` | select-rank (top 3) | yes | Food > 0% |
| 6 | `popchips` | radio (Yes / No) | yes | Food > 0% |
| 7 | `hygiene` | select-rank (top 3) | yes | Hygiene > 0% |
| 8 | `clothing` | select-rank (top 3) | yes | Clothing > 0% |
| 9 | `sizes` | multi-select | no | Clothing > 0% |
| 10 | `missing_items` | textarea | no | always |
| 11 | `testimonial_permission` | radio | yes | always |
| 12 | `delivery_feedback` | textarea | no | always |
| 13 | `comments` | textarea | no | always |

`district` now includes **YMCA** alongside the nine school districts. Popchips is no
longer one of the `nonperishables` options — it has its own yes/no question (6) so it can
be tracked separately from the top-3 picks.

---

## Editing the survey

Open `shared/survey.json`. Both the survey pages and the server's validation read from
this one file, so a change here updates both. After editing, redeploy (on Render: push to
GitHub, or hit **Manual Deploy**).

- **Change wording** — edit `title`, `helper`, `selectPrompt`, `rankPrompt`,
  `weightPrompt`, or the `label` of an option or category.
- **Add or remove an option** — add/remove an entry in that question's `options` array.
  Each needs a unique `id` (lowercase, underscores) and a `label`.
- **Make something optional/required** — flip `"required": true` / `false`.
- **Change how many items can be picked** — `maxSelect` on a `select-weight` or
  `select-rank` question (leave it off for `multi-select`: no cap).

Keep `id` values stable if you can: they become the CSV column names, so renaming one
makes this year's export not line up with last year's.

Question types available: `text`, `textarea`, `radio`, `select`, `multi-select`,
`allocate`, `select-rank`, `select-weight`.

`select-rank` and `select-weight` are **two-screen** questions: the respondent picks their
items on one screen, then drags them into order (or weights them to 100%) on the next.
Picking the exclusive "none" option skips the second screen. Their prompts are
`selectPrompt` plus `rankPrompt` / `weightPrompt`.

`allocate` is the budget-split question. Unlike the others it has **no `options` and no
selecting** — it has a fixed `categories` array, and the respondent moves percentages
between all of them until they total exactly 100:

```json
{
  "id": "budget_allocation",
  "type": "allocate",
  "required": true,
  "title": "How would you like your funds allocated?",
  "categories": [
    { "id": "food", "label": "Food", "sublabel": "non-perishables and snacks" },
    { "id": "hygiene", "label": "Hygiene", "sublabel": "personal care items" },
    { "id": "clothing", "label": "Clothing", "sublabel": "clothes, sizes youth to adult" }
  ]
}
```

Adding or renaming a category automatically adds/renames its CSV column, and any question
whose `showIf` names the old id would stop appearing — so change both together.

### Conditional questions (`showIf`)

Any question can carry a `showIf` block. It is respected in both places: the survey pages
skip the question, and the server neither requires it nor stores an answer for it.

```json
"showIf": { "questionId": "budget_allocation", "categoryAboveZero": "food" }
```

Read: *show this question only when `budget_allocation` gave the `food` category more than
0%.* That is how the survey stops asking a district about clothing when none of its budget
is going to clothing.

The server decides visibility from **the answers in the submission itself**, not from
anything the client claims. So:

- a hidden question is never "required" — leaving it out is fine;
- an answer sent for a hidden question anyway (a stale value from the browser's autosave,
  say) is **silently dropped** — the submission still succeeds, and the stored response
  and CSV row simply have nothing for that question;
- a *visible* required question that is missing is still a `400`, as always.

---

## API reference

### `GET /healthz`
`200 {"ok": true}` — used by the host's health check.

### `GET /api/survey`
Returns `shared/survey.json`.

### `POST /api/responses`

```json
{
  "surveyId": "care-closet-eoy-2026",
  "answers": { "…question id…": "…answer…" },
  "meta": { "startedAt": "ISO date", "completedAt": "ISO date", "userAgent": "…" }
}
```

Answer shapes (the server is lenient about shape, strict about the rules):

| Type | Accepted | Stored as |
| --- | --- | --- |
| `text`, `textarea` | `"some text"` | trimmed string |
| `radio`, `select` | `"herscher"` or `{ "value": "other", "other": "Kankakee Valley" }` | `{ "value": "…", "other"?: "…" }` |
| radio follow-up | top-level `{ "next_contact_info": "…" }`, or nested on the parent as `{ "value": "no", "followUp": "…" }` | top-level string under the follow-up's id |
| `multi-select` | `{ "selected": ["adult_m","other"], "other": "Adult 3XL" }` | same, normalised |
| `allocate` | `{ "weights": { "food": 40, "hygiene": 40, "clothing": 20 } }` (a bare `{ "food": 40, … }` map and numeric strings are also accepted) | `{ "weights": { "food": 40, "hygiene": 40, "clothing": 20 } }` |
| `select-rank` | `{ "selected": ["granola_bars","ramen"], "ranking": ["ramen","granola_bars"] }` | same, normalised (`ranking[0]` is the top pick) |
| `select-weight` | `{ "selected": ["granola_bars","ramen","other"], "other": "Pop-Tarts", "weights": { "granola_bars": 50, "ramen": 30, "other": 20 } }` | same, normalised |
| `select-rank` / `select-weight`, "none" | `{ "selected": ["none"] }` or `{ "none": true }` | `{ "selected": ["none"], "none": true }` |

Rules enforced (a failure returns `400` with a plain-English `error` message):

- `surveyId` must match `shared/survey.json`
- every `required` **and visible** question must have an answer (see `showIf` below)
- choice answers must use a known option `id` (or `"other"` when the question allows it,
  in which case the `other` text must be non-empty)
- `allocate`: `weights` must have a key for **every** category and no others — an unknown
  key or a missing one is rejected — each value a whole number from 0 to 100, and the
  values must total **exactly 100** (so 33/33/33 fails: it totals 99)
- `select-rank`: 1…`maxSelect` selections, all known ids; the "none" choice must be on its
  own and needs no ranking; otherwise `ranking` must be an exact permutation of `selected`
  (every pick ordered exactly once)
- `select-weight`: same selection rules; `weights` must cover exactly the selected items
  with whole numbers ≥ 0 that total **exactly 100**
- `multi-select`: any number of known ids (no cap unless `maxSelect` is set)

**Conditional questions.** A question with a `showIf` block is only asked when the
condition holds — currently `{ "questionId": "budget_allocation", "categoryAboveZero":
"food" }`, meaning "that category got more than 0%". The server evaluates this from the
submitted `budget_allocation` answer, so the client cannot talk it out of a required
question. A hidden question is not required, and an answer supplied for one anyway is
**dropped** rather than rejected: the submission still returns `201` and the stored
response has no value for it. Since `budget_allocation` is itself required, an invalid or
missing allocation is a `400` before any of this is considered.

Unknown extra fields are ignored. Success: `201 {"id": "…uuid…"}`.
Submissions are rate-limited to 20 per hour per IP address.

### `GET /api/admin/responses?key=…` and `GET /api/admin/responses.csv?key=…`
`401` unless `key` matches `ADMIN_KEY` (and `ADMIN_KEY` is set). JSON returns
`{ "count": n, "responses": [...] }`.

---

## How responses are stored

One table, either engine:

```sql
responses(
  id           TEXT PRIMARY KEY,   -- crypto.randomUUID()
  survey_id    TEXT,
  submitted_at TEXT,               -- ISO timestamp
  answers_json TEXT,               -- the validated answers object
  meta_json    TEXT                -- startedAt / completedAt / userAgent
)
```

SQLite lives at `$DATA_DIR/responses.db` (default `./data/responses.db`, git-ignored). If
`DATABASE_URL` is present the app uses Postgres instead and creates the table on startup.
Nothing else about the app changes.

---

## Troubleshooting

- **"The survey client has not been built yet."** — you're hitting the API server without a
  built client. Either run `npm run build`, or use the Vite dev server on port 5173.
- **`401 Invalid admin key`** — `ADMIN_KEY` isn't set on the server, or the `key=` in your
  URL doesn't match it exactly.
- **`better-sqlite3` fails to install** — you're probably on an older Node. This project
  needs Node 20+.
- **Responses vanished after a deploy** — on Render, confirm the disk is mounted at
  `/var/data` and `DATA_DIR=/var/data`; on Vercel, confirm `DATABASE_URL` is set.

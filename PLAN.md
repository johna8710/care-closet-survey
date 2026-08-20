# Let's Ketchup — Care Closet End-of-Year Survey App

## Goal
Replace the Google Forms end-of-year Care Closet survey with a polished, professional
survey web app (Qualtrics / Decipher feel), hosted on Render or Vercel, with a custom
**select-3 + constant-sum weighting** question type not available in Google Forms.

## Source material
- `Let's Ketchup Care Closet Survey_ End of Year Review Individual Responses.pdf` — the
  previous survey instrument (11 questions, structure captured in `shared/survey.json`).
- `survey-materials/LK Survey Results/` — per-district results from last year (9 districts:
  BBCHS, Bradley, Grant Park, Herscher, Kankakee, Manteno, Momence, Pembroke, St. Anne).

## Brand (from letsketchup.org — Wix site, logo in `assets/lklogo.jpg`)
- **Mark**: hand-drawn tomato — red-orange body, deep green stem, cream hand-lettered
  wordmark, "Est. 2022" cream badge. Tagline: "Lunch is on us!"
- **Palette**:
  - Cream backgrounds: `#FEF6ED`, `#FAECE1`
  - Ink (near-black brown): `#1D0E03`
  - Tomato red (primary/CTA): `#E03939` (logo body is closer to `#DE5A38`)
  - Deep green (stem; use for progress/success): `#2F6B4F`
  - Orange accents: `#FF8044`, `#FE9361`
  - Taupe (borders/muted): `#C8BDB4`
- **Type** (site uses DIN Next + Avenir; substitute Google Fonts):
  headings **Archivo** (600/700), body **Nunito Sans**. Generous letter-spacing on
  small caps labels.
- Tone: warm, community, grateful — not corporate.

## Survey content (upgraded from Google Forms)
Defined canonically in `shared/survey.json`. One question per screen:

1. **Welcome** — logo, title "Care Closet Survey: End of Year Review", intro copy,
   "~5 minutes" note, Begin button.
2. **District** — select from the 9 districts + Other (specify). *Required.*
3. **Contact continuation** — radio Yes / No / Unsure; if No/Unsure, follow-up text
   field for the next contact's info. *Required.*
4. **Students impacted** — short text (estimate). *Required.*
5. **Non-perishables** ⭐ — select up to 3 (Granola Bars, Microwaveable Items, Canned
   Goods, Ramen, Fruit Snacks, Popchips, Other w/ text, None exclusive) → then weight
   selections to sum to 100%. *Required.*
6. **Hygiene items** ⭐ — same mechanic (Deodorant, Soap, Shampoo, Brushes/Combs/Hair
   Care, Toothpaste, Pads/Tampons, Chapstick, Other, None). *Required.*
7. **Clothing items** ⭐ — same mechanic (Underwear, Socks, T-Shirts, Long-sleeved
   Shirts, Hoodies, Sweatshirts, Sweatpants, Leggings, Hats and Gloves, Other, None).
   *Required.*
8. **Sizes** — short text. Optional.
9. **Items not on the list** — textarea. Optional.
10. **Testimonial permission** — radio: "Yes for both!" / "School district without
    name" / "Not at this time". *Required.*
11. **Delivery process feedback** — textarea. Optional.
12. **Other comments** — textarea. Optional.
13. **Thank-you screen** — tomato mark, warm confirmation.

### ⭐ Select-3 + constant-sum weighting (the custom item type)
- Phase 1 (select): card-style checkboxes; selecting a 4th is blocked with a gentle
  notice; "None" is exclusive (clears/locks others). "Other" reveals inline text input.
- Phase 2 (weight): appears once ≥1 non-exclusive selection exists. Each selected item
  gets a slider + numeric stepper (0–100, step 5 on slider, free typing allowed).
  Live total indicator (fills green at exactly 100), "Split evenly" button, remaining
  counter. Continue disabled until total = 100. If only "None" selected, phase 2 is
  skipped. If 1 item selected it must be 100; 2 or 3 items must sum to 100.
- Answer shape: `{ selected: [ids], other?: "text", none?: true, weights: {id: pct} }`.

## Architecture
```
care-closet-survey/
├── package.json           # root: workspaces or npm scripts (dev/build/start)
├── shared/survey.json     # canonical survey definition (client renders, server validates)
├── client/                # Vite + React 18, custom CSS (design tokens), no UI framework
│   └── src/ (engine: screens, progress, transitions, validation, localStorage autosave)
├── server/                # Express: serves client/dist + API
│   ├── index.js           # app + static + healthz
│   ├── storage.js         # better-sqlite3 default; DATABASE_URL → Postgres (pg)
│   └── routes: POST /api/responses, GET /api/admin/responses(.csv)?key=ADMIN_KEY
├── api/index.js           # Vercel serverless wrapper around the Express app
├── render.yaml            # Render web service + persistent disk for SQLite
├── vercel.json            # Vercel config (static client + /api function)
└── README.md              # local dev + deploy (Render primary, Vercel w/ Neon Postgres)
```

### API contract
- `POST /api/responses` body: `{ surveyId: "care-closet-eoy-2026", answers: {qid: value},
  meta: {startedAt, completedAt, userAgent} }` → `201 {id}`. Server validates against
  shared/survey.json (required questions present, weights sum to 100, maxSelect ≤ 3).
- `GET /api/admin/responses?key=…` → JSON array; `.csv` variant flattens answers
  (allocation questions become one column per option with pct).
- `GET /healthz` → 200.
- Env: `PORT`, `ADMIN_KEY`, `DATA_DIR` (SQLite path), optional `DATABASE_URL`.

## UX bar (Qualtrics/Decipher quality)
Centered card ~720px, top slim progress bar + "Question N of 12", Back/Next, Enter to
advance, auto-advance on radio (300ms delay), slide/fade transitions, inline validation,
autosave to localStorage with resume, fully responsive, accessible (labels, focus rings,
aria-live for the weighting total), reduced-motion respected.

## Execution
1. **Spec files** (done by orchestrator): PLAN.md, shared/survey.json, assets/lklogo.jpg.
2. **Opus agent A — Frontend**: client/ per spec, invoking the frontend-design skill.
3. **Opus agent B — Backend + deploy**: server/, storage, deploy configs, README.
4. **Opus agent C — Integration & QA**: install, build, run, Playwright end-to-end
   (webapp-testing skill), fix bugs, screenshot review, final polish.

// Turns stored responses into the "Partner Check-In Results" page: one self-contained
// HTML document in Let's Ketchup brand styling. Served by GET /api/admin/report.html
// and attached to the new-response notification email (see notify.js).
//
// Rows submitted before `since` (the day the survey was sent) are build/test
// submissions and are left out of every count. The prose is computed from the
// numbers, so the page stays truthful as responses arrive.
import { questionsById, optionLabel, detailScale, detailLabel, OTHER_ID } from './survey.js';

export const DEFAULT_SINCE = '2026-09-23';
const TZ = 'America/Chicago';
// Last year's respondents, so the page can point out first-time partners.
const LAST_YEAR = new Set(['bbchs', 'bradley', 'grant_park', 'herscher', 'kankakee', 'manteno', 'momence', 'pembroke', 'st_anne']);
const CATS = ['food', 'hygiene', 'clothing'];
// Stack order keeps tomato and green apart; #d02b2b / #e8a33d / #237a52 were checked for
// red-green colour-blind separation. Amber sits below 3:1 on cream, so every amber mark
// carries a visible label or a table twin.
const CAT_ORDER = ['food', 'clothing', 'hygiene'];
const SERIES = {
  food: { color: 'var(--s-food)', label: 'Food' },
  hygiene: { color: 'var(--s-hyg)', label: 'Hygiene' },
  clothing: { color: 'var(--s-cloth)', label: 'Clothing' },
};
const PERM_LABEL = { yes_both: 'name and district', district_only: 'district only', not_now: 'not at this time' };

const Q = (id) => questionsById.get(id);

// ------------------------------------------------------------------ small helpers
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Escape text and turn line breaks into <br>. */
export const para = (s) =>
  String(s ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(esc)
    .join('<br>');

const fmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts });
export const fmtWhen = (iso) => fmt({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const fmtLongDate = (d = new Date()) => fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
export const fmtDay = (iso) => fmt({ month: 'short', day: 'numeric' }).format(new Date(iso));
/** YYYY-MM-DD in Central time, for file names. */
export const stampDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** "A", "A and B", "A, B and C". */
export function joinNames(names, conj = 'and') {
  const a = names.filter(Boolean);
  if (a.length <= 1) return a.join('');
  return `${a.slice(0, -1).join(', ')} ${conj} ${a[a.length - 1]}`;
}

export function districtOf(r) {
  const d = r.answers?.district ?? {};
  if (d.value === OTHER_ID) return { id: `other:${d.other ?? ''}`, name: d.other || 'Other', writeIn: true };
  return { id: d.value, name: optionLabel(Q('district'), d.value), writeIn: false };
}

export function budgetOf(r) {
  const w = r.answers?.budget_allocation?.weights ?? {};
  return Object.fromEntries(CATS.map((k) => [k, Number(w[k] ?? 0) || 0]));
}

function minutes(meta) {
  const a = Date.parse(meta?.startedAt), b = Date.parse(meta?.completedAt);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 60000 : null;
}

const isPhone = (meta) => /iPhone|Android|Mobile/i.test(meta?.userAgent ?? '');

/** Compress a list of size ids into a short phrase, in scale order. */
export function sizeText(qid, oid, picked) {
  const scale = detailScale(Q(qid), oid);
  if (!scale || !Array.isArray(picked) || !picked.length) return '';
  const order = scale.options.map((o) => o.id);
  const label = (id) => detailLabel(Q(qid), oid, id);
  const chosen = [...new Set(picked)].filter((p) => order.includes(p)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const run = chosen.filter((p) => p !== 'not_sure');
  const parts = [];
  for (let i = 0; i < run.length; ) {
    let j = i;
    while (j + 1 < run.length && order.indexOf(run[j + 1]) === order.indexOf(run[j]) + 1) j++;
    if (j - i >= 2) parts.push(`${label(run[i])} through ${label(run[j])}`);
    else parts.push(...run.slice(i, j + 1).map(label));
    i = j + 1;
  }
  if (chosen.includes('not_sure')) parts.push(label('not_sure'));
  return parts.join(', ');
}

function tally(rows, qid) {
  const q = Q(qid);
  const eligible = rows.filter((r) => r.answers?.[qid]);
  const counts = new Map([...q.options.map((o) => [o.id, 0]), ...(q.allowOther ? [[OTHER_ID, 0]] : [])]);
  const others = [];
  for (const r of eligible) {
    const a = r.answers[qid];
    for (const oid of a.selected ?? []) counts.set(oid, (counts.get(oid) ?? 0) + 1);
    if ((a.selected ?? []).includes(OTHER_ID) && a.other) others.push({ name: districtOf(r).name, text: a.other });
  }
  const ids = [...counts.keys()];
  const order = ids.slice().sort((x, y) => counts.get(y) - counts.get(x) || ids.indexOf(x) - ids.indexOf(y));
  const labelOf = (oid) => (oid === OTHER_ID ? 'Other (write-in)' : optionLabel(q, oid));
  return { q, eligible, counts, order, others, labelOf };
}

// ------------------------------------------------------------------ analysis
export function analyze(allRows, { since = DEFAULT_SINCE } = {}) {
  const rows = allRows.filter((r) => r.submittedAt >= since).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const excluded = allRows.filter((r) => r.submittedAt < since);
  const n = rows.length;
  const districts = Q('district').options;
  const districtName = (id) => districts.find((o) => o.id === id)?.label ?? id;

  const byDistrict = new Map();
  for (const r of rows) {
    const { id } = districtOf(r);
    if (!byDistrict.has(id)) byDistrict.set(id, []);
    byDistrict.get(id).push(r);
  }
  const respondedIds = districts.map((o) => o.id).filter((id) => byDistrict.has(id));
  const pendingIds = districts.map((o) => o.id).filter((id) => !byDistrict.has(id));
  const writeIns = [...byDistrict.entries()].filter(([id]) => id.startsWith('other:')).map(([, list]) => list[0]);
  const firstTimers = respondedIds.filter((id) => !LAST_YEAR.has(id));

  const budgets = rows.map((r) => ({ name: districtOf(r).name, b: budgetOf(r) }));
  const avg = Object.fromEntries(CATS.map((k) => [k, n ? budgets.reduce((s, x) => s + x.b[k], 0) / n : 0]));

  const food = tally(rows, 'nonperishables');
  const hyg = tally(rows, 'hygiene');
  const clo = tally(rows, 'clothing');

  const popchipsYes = rows.filter((r) => r.answers?.popchips?.value === 'yes').length;
  const contactYes = rows.filter((r) => r.answers?.contact_continuation?.value === 'yes').length;
  const contactChange = rows.filter((r) => ['no', 'unsure'].includes(r.answers?.contact_continuation?.value)).map((r) => districtOf(r).name);

  const studentNumbers = [], studentText = [];
  for (const r of rows) {
    const raw = String(r.answers?.students_impacted ?? '').trim();
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits && raw.length < 20) studentNumbers.push({ name: districtOf(r).name, value: Number(digits), raw });
    else studentText.push({ name: districtOf(r).name, raw });
  }
  const studentsTotal = studentNumbers.reduce((s, x) => s + x.value, 0);

  const perm = { yes_both: 0, district_only: 0, not_now: 0 };
  for (const r of rows) {
    const v = r.answers?.testimonial_permission?.value;
    if (v in perm) perm[v]++;
  }
  const text = (r, k) => String(r.answers?.[k] ?? '').trim();
  const testimonials = rows.filter((r) => text(r, 'testimonial')).map((r) => ({ name: districtOf(r).name, text: text(r, 'testimonial'), perm: r.answers.testimonial_permission?.value }));
  const delivery = rows.filter((r) => text(r, 'delivery_feedback')).map((r) => ({ name: districtOf(r).name, text: text(r, 'delivery_feedback') }));
  const comments = rows.filter((r) => text(r, 'comments')).map((r) => ({ name: districtOf(r).name, text: text(r, 'comments') }));
  const missing = rows.filter((r) => text(r, 'missing_items')).map((r) => ({ name: districtOf(r).name, text: text(r, 'missing_items') }));
  const permNoText = rows
    .filter((r) => ['yes_both', 'district_only'].includes(r.answers?.testimonial_permission?.value) && !text(r, 'testimonial'))
    .map((r) => districtOf(r).name);

  const sizesByItem = new Map();
  for (const r of rows) {
    const a = r.answers?.clothing;
    if (!a) continue;
    for (const oid of a.selected ?? []) {
      if (oid === OTHER_ID) continue;
      const t = sizeText('clothing', oid, a.details?.[oid]);
      if (!sizesByItem.has(oid)) sizesByItem.set(oid, []);
      sizesByItem.get(oid).push({ name: districtOf(r).name, text: t || 'no sizes given' });
    }
  }
  const sizes = [...sizesByItem.entries()]
    .sort(([a, la], [b, lb]) => lb.length - la.length || clo.order.indexOf(a) - clo.order.indexOf(b))
    .map(([oid, list]) => ({ oid, label: optionLabel(Q('clothing'), oid), list }));

  const durations = rows.map((r) => minutes(r.meta)).filter((m) => m !== null);
  const phones = rows.filter((r) => isPhone(r.meta)).length;
  const lastIn = n ? fmtWhen(rows[n - 1].submittedAt) : null;

  return {
    since, rows, excluded, n, districts, districtName, byDistrict, respondedIds, pendingIds, writeIns, firstTimers,
    budgets, avg, food, hyg, clo, popchipsYes, contactYes, contactChange, studentNumbers, studentText, studentsTotal,
    perm, permYes: perm.yes_both + perm.district_only, testimonials, delivery, comments, missing, permNoText,
    sizes, durations, phones, lastIn,
  };
}

// ------------------------------------------------------------------ computed prose
function pickSentences(t, noun = 'district') {
  const total = t.eligible.length;
  if (!total) return 'No district has answered this question yet.';
  const real = t.order.filter((o) => o !== OTHER_ID);
  const all = real.filter((o) => t.counts.get(o) === total);
  const zero = real.filter((o) => t.counts.get(o) === 0);
  const out = [];
  if (all.length) out.push(`Every ${noun} picked ${joinNames(all.map(t.labelOf))}.`);
  const next = real.filter((o) => !all.includes(o) && t.counts.get(o) > 0).slice(0, 3);
  if (next.length) out.push(`${all.length ? 'Next came' : 'Most picked:'} ${joinNames(next.map((o) => `${t.labelOf(o)} (${t.counts.get(o)} of ${total})`))}.`);
  if (zero.length) out.push(`No ${noun} chose ${joinNames(zero.map(t.labelOf), 'or')}.`);
  return out.join(' ');
}

export function narrative(a) {
  const total = a.districts.length;
  const roster = [];
  roster.push(`${a.n ? a.respondedIds.length : 'None'} of the ${total} partners ${a.respondedIds.length === 1 ? 'has' : 'have'} answered${a.writeIns.length ? `, plus ${a.writeIns.length} write-in` : ''}.`);
  if (a.lastIn) roster.push(`The most recent came in ${a.lastIn}.`);
  if (a.firstTimers.length) roster.push(`${joinNames(a.firstTimers.map(a.districtName))} ${a.firstTimers.length > 1 ? 'are' : 'is'} answering for the first time.`);
  roster.push(a.pendingIds.length ? `Still to hear from: ${joinNames(a.pendingIds.map(a.districtName))}.` : 'Every partner has responded.');

  const budget = [];
  if (a.n) {
    budget.push(`Averaged across the ${a.n}, the split is ${a.avg.food.toFixed(0)}% food, ${a.avg.clothing.toFixed(0)}% clothing and ${a.avg.hygiene.toFixed(0)}% hygiene, against the even 34 / 33 / 33 split a district gets if it leaves the sliders alone.`);
    const foodHeavy = a.budgets.filter((x) => x.b.food > 34).length;
    budget.push(`${foodHeavy} of ${a.n} put more than a third of the budget on food.`);
    const spread = (k) => {
      const v = a.budgets.map((x) => x.b[k]);
      return [Math.min(...v), Math.max(...v)];
    };
    const widest = CATS.map((k) => [k, spread(k)]).sort((x, y) => y[1][1] - y[1][0] - (x[1][1] - x[1][0]))[0];
    budget.push(`${SERIES[widest[0]].label} is where districts differ most, from ${widest[1][0]}% to ${widest[1][1]}%.`);
  }

  const skippedHyg = a.rows.filter((r) => !r.answers?.hygiene).map((r) => districtOf(r).name);
  const skippedFood = a.rows.filter((r) => !r.answers?.nonperishables).map((r) => districtOf(r).name);
  const skippedClo = a.rows.filter((r) => !r.answers?.clothing).map((r) => districtOf(r).name);
  const skipNote = (names, cat) => (names.length ? ` ${joinNames(names)} set ${cat} to 0% and never saw the question.` : '');

  const deod = a.hyg.eligible
    .filter((r) => (r.answers.hygiene.selected ?? []).includes('deodorant'))
    .map((r) => {
      const d = r.answers.hygiene.details?.deodorant ?? [];
      const which = ['male', 'female'].filter((x) => d.includes(x));
      return `${districtOf(r).name} wants ${which.length ? which.join(' and ') : 'either'}`;
    });

  return {
    roster: roster.join(' '),
    budget: budget.join(' '),
    food: pickSentences(a.food) + skipNote(skippedFood, 'food'),
    hygiene: pickSentences(a.hyg) + skipNote(skippedHyg, 'hygiene'),
    clothing: pickSentences(a.clo) + skipNote(skippedClo, 'clothing'),
    popchips: a.n ? `Popchips: ${a.popchipsYes} of ${a.n} want to keep receiving them.` : '',
    deodorant: deod.length ? `Deodorant: ${deod.join('; ')}.` : '',
    voices: a.n
      ? `${a.permYes} of ${a.n} said Let's Ketchup may publish a testimonial, and ${a.testimonials.length} wrote one.` +
        (a.permNoText.length ? ` ${joinNames(a.permNoText)} gave permission but left the box blank.` : '')
      : '',
    followUps: [
      a.pendingIds.length ? `Send a reminder to the ${a.pendingIds.length} partner${a.pendingIds.length > 1 ? 's' : ''} who ${a.pendingIds.length > 1 ? 'have' : 'has'} not answered: ${a.pendingIds.map(a.districtName).join(', ')}.` : null,
      a.contactChange.length ? `Line up a new contact for ${joinNames(a.contactChange)}; they said they may not continue next year.` : null,
      a.clo.eligible.length && a.clo.counts.get(a.clo.order[0]) > 0
        ? `Plan ${a.clo.labelOf(a.clo.order[0]).toLowerCase()} for ${a.clo.counts.get(a.clo.order[0])} of ${a.clo.eligible.length} districts; sizes are in the clothing table.`
        : null,
      a.permNoText.length ? `Ask ${joinNames(a.permNoText)} for the testimonial they agreed to share.` : null,
      a.missing.length ? `Read the additional requests from ${joinNames(a.missing.map((m) => m.name))} before ordering.` : null,
    ].filter(Boolean),
  };
}

// ------------------------------------------------------------------ one response, as facts
/**
 * Everything one district submitted, as [{ label, text }] with plain text (newlines
 * separate list items). Used for the order sheets and the notification email.
 */
export function responseFacts(r) {
  const a = r.answers ?? {};
  const b = budgetOf(r);
  const items = (qid) => {
    const sel = a[qid];
    if (!sel) {
      const cat = { nonperishables: 'food', hygiene: 'hygiene', clothing: 'clothing' }[qid];
      return `Not asked (0% of budget to ${cat})`;
    }
    const q = Q(qid);
    const lines = (sel.selected ?? []).map((oid) => {
      if (oid === OTHER_ID) return `• Other: ${sel.other ?? ''}`;
      const det = sizeText(qid, oid, sel.details?.[oid]);
      return `• ${optionLabel(q, oid)}${det ? ` (${det})` : ''}`;
    });
    return lines.length ? lines.join('\n') : 'Nothing selected';
  };
  const dur = minutes(r.meta);
  const perm = a.testimonial_permission?.value;
  const contact = optionLabel(Q('contact_continuation'), a.contact_continuation?.value ?? '');
  return [
    { label: 'Submitted', text: `${fmtWhen(r.submittedAt)}${dur !== null ? ` (${isPhone(r.meta) ? 'phone' : 'desktop'}, ${Math.round(dur)} min)` : ''}` },
    { label: 'Contact next year', text: contact + (a.next_contact_info ? `\nNext contact: ${a.next_contact_info}` : '') },
    { label: 'Students', text: String(a.students_impacted ?? '—') },
    { label: 'Budget', text: `Food ${b.food}% · Clothing ${b.clothing}% · Hygiene ${b.hygiene}%` },
    { label: 'Food', text: items('nonperishables') },
    { label: 'Popchips', text: a.popchips?.value === 'yes' ? 'Keep them coming' : a.popchips?.value === 'no' ? 'Leave us out' : '—' },
    { label: 'Hygiene', text: items('hygiene') },
    { label: 'Clothing', text: items('clothing') },
    { label: 'Other requests', text: String(a.missing_items ?? '').trim() || 'None given' },
    { label: 'Testimonial', text: `May publish: ${PERM_LABEL[perm] ?? perm ?? '—'}${String(a.testimonial ?? '').trim() ? `\n“${String(a.testimonial).trim()}”` : ''}` },
    { label: 'Delivery', text: String(a.delivery_feedback ?? '').trim() || 'No comment' },
    { label: 'Comments', text: String(a.comments ?? '').trim() || 'No comment' },
  ];
}

// ------------------------------------------------------------------ HTML pieces
const TOMATO_SVG = `<svg class="mark" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Let's Ketchup tomato" focusable="false">
<path d="M31 19.5C24 19.5 17 16.5 13 11.5c7-1.6 14 1.4 18.5 6.4Z" fill="#2F6B4F"/>
<path d="M33 19.5c7 0 14-3 18-8-7-1.6-14 1.4-18.5 6.4Z" fill="#2F6B4F"/>
<path d="M31.6 18.8C27 15.3 24 10 23.5 4.4c4.5 3 7.6 8 8.6 13Z" fill="#3A7D5D"/>
<path d="M32.4 18.8C37 15.3 40 10 40.5 4.4c-4.5 3-7.6 8-8.6 13Z" fill="#3A7D5D"/>
<path d="M32 18.5C31.6 13 32.2 8.4 34.4 4.2" stroke="#2F6B4F" stroke-width="3.4" stroke-linecap="round" fill="none"/>
<path d="M32 15.5c15-.5 24.5 10 24 23-.5 13-11 22-24.5 21.5C18.5 59.5 8 51 8.2 38 8.4 25.5 18 16 32 15.5Z" fill="#DE5A38"/>
<ellipse cx="21.5" cy="30" rx="6.4" ry="4.2" transform="rotate(-38 21.5 30)" fill="#ffffff" opacity="0.22"/>
</svg>`;

const CSS = `
:root{color-scheme:light;
--cream:#fef6ed;--cream-alt:#faece1;--cream-deep:#f5e2d2;--surface:#fffdf9;--surface-raised:#ffffff;
--ink:#1d0e03;--ink-soft:#4a3a2e;--ink-mute:#6f5f52;
--tomato:#e03939;--tomato-ink:#b62a2a;--tomato-body:#de5a38;--tomato-wash:#fdeee9;
--green:#2f6b4f;--green-mid:#4e8f6c;--green-wash:#ecf4ef;
--amber:#e8a33d;--orange:#ff8044;--taupe:#c8bdb4;--line:#e4d7cb;--line-strong:#cfbdad;
--s-food:#d02b2b;--s-hyg:#237a52;--s-cloth:#e8a33d;
--font-display:'Archivo','Helvetica Neue',Helvetica,Arial,sans-serif;
--font-body:'Nunito Sans','Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;
--r-sm:10px;--r-md:14px;--r-lg:20px;--r-pill:999px;
--shadow-md:0 2px 4px rgba(93,58,27,.06),0 10px 24px -14px rgba(93,58,27,.28);}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;padding:0 16px;overflow-x:hidden;background-color:var(--cream);
background-image:radial-gradient(60rem 40rem at 8% -8%,rgba(224,57,57,.07),transparent 62%),radial-gradient(48rem 36rem at 105% 8%,rgba(47,107,79,.07),transparent 60%),radial-gradient(52rem 40rem at 50% 118%,rgba(255,128,68,.08),transparent 62%);
background-attachment:fixed;color:var(--ink);font-family:var(--font-body);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
.page{max-width:940px;margin:0 auto;padding-block:30px 40px}
h1,h2,h3{font-family:var(--font-display);font-weight:700;letter-spacing:-.02em;line-height:1.15;margin:0;text-wrap:balance}
h1{font-size:clamp(1.9rem,4.6vw,2.7rem)}h2{font-size:clamp(1.3rem,2.6vw,1.6rem)}h3{font-size:1.05rem}
p{margin:0}ul,ol{margin:0;padding-left:1.2em}
a{color:var(--tomato-ink)}
.eyebrow{font-weight:700;font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-mute)}
.mute{color:var(--ink-mute)}
.masthead{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding-bottom:22px;border-bottom:1px solid var(--line-strong)}
.masthead .mark{flex:0 0 auto}
.masthead .title{flex:1 1 300px;min-width:0}
.masthead .title h1{margin-top:4px}
.masthead .sub{font-family:var(--font-display);font-weight:600;color:var(--tomato-ink);font-size:1.1rem;margin-top:4px}
.masthead .lede{flex:1 1 100%;color:var(--ink-soft);max-width:64ch;margin-top:4px}
section{margin-top:46px}
.sec-head{display:flex;flex-direction:column;gap:6px;margin-bottom:18px;max-width:68ch}
.sec-head p{color:var(--ink-soft)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:24px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:14px 16px 12px;box-shadow:var(--shadow-md)}
.kpi .lbl{font-size:.78rem;font-weight:700;color:var(--ink-mute)}
.kpi .val{font-weight:700;font-size:2.3rem;line-height:1.1;margin-top:2px}
.kpi .val small{font-size:1rem;font-weight:700;color:var(--ink-mute);margin-left:4px}
.kpi .note{font-size:.78rem;color:var(--ink-mute);margin-top:4px;line-height:1.35}
.roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:10px}
.chip{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--cream-alt);min-height:54px}
.chip.in{background:var(--green-wash);border-color:var(--green-mid)}
.chip .dot{width:22px;height:22px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;background:var(--cream-deep);color:var(--ink-mute);font-size:.8rem;font-weight:700}
.chip.in .dot{background:var(--green);color:#fff}
.chip .nm{font-weight:700;font-size:.93rem;line-height:1.2}
.chip .when{font-size:.75rem;color:var(--ink-mute);margin-top:1px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:20px;box-shadow:var(--shadow-md)}
.card.chart h3{margin-bottom:2px}
.card.chart .sub{font-size:.8rem;color:var(--ink-mute);margin-bottom:14px}
.card.chart .note{font-size:.84rem;color:var(--ink-soft);margin-top:14px}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:.82rem;color:var(--ink-soft);margin-bottom:16px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.sw{width:12px;height:12px;border-radius:3px;display:inline-block}
.stack-rows{display:grid;gap:10px}
.srow{display:grid;grid-template-columns:110px 1fr;gap:12px;align-items:center}
.srow .nm{font-size:.9rem;font-weight:700;line-height:1.2}
.srow.avg{margin-top:6px;padding-top:12px;border-top:1px solid var(--line)}
.srow.avg .nm{color:var(--tomato-ink)}
.stack{display:flex;gap:2px;height:22px}
.seg{height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.74rem;font-weight:700;font-variant-numeric:tabular-nums}
.seg.clothing{color:var(--ink)}
.seg:first-child{border-radius:4px 0 0 4px}.seg:last-child{border-radius:0 4px 4px 0}
.charts3{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.bars{display:grid;gap:8px}
.brow{display:grid;grid-template-columns:minmax(120px,40%) 1fr;gap:10px;align-items:center}
.brow .nm{font-size:.88rem;line-height:1.2}
.brow .nm small{display:block;color:var(--ink-mute);font-size:.72rem}
.track{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;min-width:0}
.bar{height:18px;border-radius:0 4px 4px 0;min-width:4px}
.bar.zero{width:2px;min-width:2px;background:var(--line-strong);border-radius:0;height:18px}
.cnt{font-size:.8rem;font-weight:700;color:var(--ink-soft);font-variant-numeric:tabular-nums;white-space:nowrap}
.writeins{margin-top:12px;font-size:.86rem;color:var(--ink-soft)}
[data-tip]{position:relative;cursor:default;outline-offset:2px}
[data-tip]:hover::after,[data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);background:var(--ink);color:var(--cream);font-family:var(--font-body);font-size:.76rem;font-weight:600;padding:6px 9px;border-radius:8px;white-space:nowrap;z-index:5;pointer-events:none;box-shadow:var(--shadow-md)}
.stack .seg:first-child[data-tip]:hover::after,.stack .seg:first-child[data-tip]:focus-visible::after{left:0;transform:none}
.stack .seg:last-child[data-tip]:hover::after,.stack .seg:last-child[data-tip]:focus-visible::after{left:auto;right:0;transform:none}
.bar[data-tip]:hover::after,.bar[data-tip]:focus-visible::after{left:0;transform:none}
:focus-visible{outline:3px solid rgba(224,57,57,.55)}
details.tbl{margin-top:14px;font-size:.85rem}
details.tbl summary{cursor:pointer;color:var(--ink-mute);font-weight:700;list-style:none}
details.tbl summary::before{content:'▸ ';}details.tbl[open] summary::before{content:'▾ ';}
details.tbl summary::-webkit-details-marker{display:none}
.tbl-wrap{overflow-x:auto;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute);font-weight:700}
td{font-variant-numeric:tabular-nums}
.quotes{display:grid;gap:14px}
.quote{margin:0;background:var(--surface);border-left:4px solid var(--tomato);border-radius:0 var(--r-md) var(--r-md) 0;padding:16px 18px;box-shadow:var(--shadow-md)}
.quote p{font-size:1.02rem;line-height:1.6}
.quote .who{margin-top:10px;font-size:.78rem;font-weight:700;color:var(--ink-mute);letter-spacing:.04em}
.sheets{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(400px,100%),1fr));gap:16px}
.sheet dl{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;margin:14px 0 0;font-size:.9rem}
.sheet dt{color:var(--ink-mute);font-weight:700;font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;padding-top:3px;white-space:nowrap}
.sheet dd{margin:0;min-width:0}
.mini{display:flex;gap:2px;height:10px;margin:2px 0 4px;max-width:220px}
.mini span{display:block;height:100%}
.mini span:first-child{border-radius:3px 0 0 3px}.mini span:last-child{border-radius:0 3px 3px 0}
.next{background:var(--tomato-wash);border:1px solid #f3cfc4;border-radius:var(--r-lg);padding:20px 22px}
.next h2{font-size:1.15rem;margin-bottom:8px}
.next li{margin:6px 0}
.notes{font-size:.9rem;color:var(--ink-soft)}
.notes li{margin:6px 0}
.notes code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82em;background:var(--cream-alt);padding:1px 5px;border-radius:5px}
.empty{color:var(--ink-mute);font-style:italic}
footer{margin-top:52px;text-align:center;color:var(--ink-mute);font-size:.8rem}
footer .tagline{font-family:var(--font-display);font-weight:600;color:var(--tomato-ink);font-size:.95rem}
@media (max-width:520px){.srow{grid-template-columns:1fr;gap:4px}.brow{grid-template-columns:1fr;gap:4px}.sheet dl{grid-template-columns:1fr;gap:2px 0}.sheet dd{margin-bottom:8px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media print{body{background:#fff;padding:0}.card,.kpi,.quote,.chip{box-shadow:none}section{break-inside:avoid}}
`;

const table = (headers, rows) =>
  `<div class="tbl-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
const detailsTable = (summary, headers, rows) => `<details class="tbl"><summary>${summary}</summary>${table(headers, rows)}</details>`;

function stackedRow(name, b, cls = '') {
  const segs = CAT_ORDER.filter((k) => b[k] > 0)
    .map((k) => {
      const pct = b[k];
      return `<div class="seg ${k}" style="width:${pct}%;background:${SERIES[k].color}" tabindex="0" data-tip="${esc(name)}: ${SERIES[k].label} ${pct.toFixed(0)}%">${pct >= 18 ? `${pct.toFixed(0)}%` : ''}</div>`;
    })
    .join('');
  return `<div class="srow ${cls}"><div class="nm">${esc(name)}</div><div class="stack">${segs}</div></div>`;
}

function barChart(t, color) {
  const total = t.eligible.length;
  return `<div class="bars">${t.order
    .map((oid) => {
      const c = t.counts.get(oid);
      const opt = t.q.options.find((o) => o.id === oid);
      const sub = opt?.sublabel ? `<small>${esc(opt.sublabel)}</small>` : '';
      const pct = total ? (c / total) * 100 : 0;
      const bar = c
        ? `<div class="bar" style="width:${pct.toFixed(1)}%;background:${color}" tabindex="0" data-tip="${esc(t.labelOf(oid))}: ${c} of ${total}"></div>`
        : '<div class="bar zero" aria-hidden="true"></div>';
      return `<div class="brow"><div class="nm">${esc(t.labelOf(oid))}${sub}</div><div class="track">${bar}<span class="cnt">${c} of ${total}</span></div></div>`;
    })
    .join('')}</div>`;
}

function demandCard(title, t, color, notes, n) {
  const max = t.q.maxSelect ?? 1;
  const others = t.others.length ? `<ul class="writeins">${t.others.map((o) => `<li><strong>${esc(o.name)}</strong> wrote in “${esc(o.text)}”</li>`).join('')}</ul>` : '';
  const tbl = detailsTable('View as table', ['Item', 'Districts'], t.order.map((o) => [esc(t.labelOf(o)), `${t.counts.get(o)} of ${t.eligible.length}`]));
  const noteHtml = notes.filter(Boolean).map((s) => `<p class="note">${esc(s)}</p>`).join('');
  return `<div class="card chart"><h3>${title}</h3><p class="sub">${t.eligible.length} of ${n} districts answered · up to ${max} picks each</p>${barChart(t, color)}${others}${noteHtml}${tbl}</div>`;
}

function sheet(r) {
  const { name } = districtOf(r);
  const b = budgetOf(r);
  const mini = CAT_ORDER.filter((k) => b[k] > 0).map((k) => `<span style="width:${b[k]}%;background:${SERIES[k].color}"></span>`).join('');
  const rows = responseFacts(r)
    .map(({ label, text }) => {
      let body = para(text);
      if (label === 'Budget') body = `<div class="mini">${mini}</div><span class="mute">${esc(text)}</span>`;
      if (/^(Not asked|None given|No comment|Nothing selected)/.test(text)) body = `<span class="mute">${esc(text)}</span>`;
      return `<dt>${esc(label)}</dt><dd>${body}</dd>`;
    })
    .join('');
  return `<article class="sheet card"><h3>${esc(name)}</h3><dl>${rows}</dl></article>`;
}

// ------------------------------------------------------------------ the page
/**
 * Render the full report. `fragment: true` omits the document wrapper (for hosts
 * that supply their own <html>/<head>/<body>).
 */
export function renderReport(allRows, { since = DEFAULT_SINCE, generatedAt = new Date(), fragment = false } = {}) {
  const a = analyze(allRows, { since });
  const t = narrative(a);
  const n = a.n;
  const total = a.districts.length;
  const sentLabel = fmtLongDate(new Date(`${since}T12:00:00-05:00`));
  const reportDate = fmtLongDate(generatedAt);

  const kpis = `<div class="kpis">
  <div class="kpi"><div class="lbl">Responses so far</div><div class="val">${n}</div><div class="note">since ${esc(sentLabel.replace(/, \d{4}$/, ''))}</div></div>
  <div class="kpi"><div class="lbl">Partners responding</div><div class="val">${a.respondedIds.length}<small>of ${total}</small></div><div class="note">${a.pendingIds.length} still to hear from</div></div>
  <div class="kpi"><div class="lbl">Students reached</div><div class="val">${a.studentsTotal.toLocaleString('en-US')}${a.studentText.length ? '<small>+</small>' : ''}</div><div class="note">${a.studentNumbers.length} district${a.studentNumbers.length === 1 ? '' : 's'} gave a number${a.studentText.length ? `; ${esc(joinNames(a.studentText.map((s) => s.name)))} described the program instead` : ''}</div></div>
  <div class="kpi"><div class="lbl">OK to publish a testimonial</div><div class="val">${a.permYes}<small>of ${n}</small></div><div class="note">${a.testimonials.length} written so far</div></div>
</div>`;

  const chips = a.districts
    .map((o) => {
      const list = a.byDistrict.get(o.id);
      return list
        ? `<div class="chip in"><span class="dot" aria-hidden="true">✓</span><div><div class="nm">${esc(o.label)}</div><div class="when">${esc(fmtWhen(list[0].submittedAt))}${list.length > 1 ? ` · ${list.length} responses` : ''}</div></div></div>`
        : `<div class="chip"><span class="dot" aria-hidden="true">·</span><div><div class="nm">${esc(o.label)}</div><div class="when">No response yet</div></div></div>`;
    })
    .concat(
      a.writeIns.map((r) => `<div class="chip in"><span class="dot" aria-hidden="true">✓</span><div><div class="nm">${esc(districtOf(r).name)}</div><div class="when">Write-in · ${esc(fmtWhen(r.submittedAt))}</div></div></div>`)
    )
    .join('');

  const legend = CAT_ORDER.map((k) => `<span><i class="sw" style="background:${SERIES[k].color}"></i>${SERIES[k].label}</span>`).join('');
  const avgRounded = Object.fromEntries(CATS.map((k) => [k, Math.round(a.avg[k])]));
  const budgetRows = a.budgets.map((x) => stackedRow(x.name, x.b)).join('') + (n ? stackedRow('Average', avgRounded, 'avg') : '');
  const budgetTable = detailsTable(
    'View as table',
    ['District', 'Food', 'Clothing', 'Hygiene'],
    a.budgets.map((x) => [esc(x.name), `${x.b.food}%`, `${x.b.clothing}%`, `${x.b.hygiene}%`]).concat(n ? [['<strong>Average</strong>', `<strong>${a.avg.food.toFixed(0)}%</strong>`, `<strong>${a.avg.clothing.toFixed(0)}%</strong>`, `<strong>${a.avg.hygiene.toFixed(0)}%</strong>`]] : [])
  );
  const budgetHtml = n
    ? `<div class="card"><div class="legend">${legend}</div><div class="stack-rows">${budgetRows}</div>${budgetTable}</div>`
    : '<div class="card"><p class="empty">No responses yet.</p></div>';

  const charts = `<div class="charts3">${demandCard('Non-perishable food', a.food, SERIES.food.color, [t.popchips], n)}${demandCard('Hygiene', a.hyg, SERIES.hygiene.color, [t.deodorant], n)}${demandCard('Clothing', a.clo, SERIES.clothing.color, ['Sizes for each item are in the table below.'], n)}</div>`;

  const sizesHtml = a.sizes.length
    ? table(['Item', 'Asked by', 'Sizes requested, by district'], a.sizes.map((s) => [`<strong>${esc(s.label)}</strong>`, `${s.list.length} of ${a.clo.eligible.length}`, s.list.map((x) => `<strong>${esc(x.name)}</strong>: ${esc(x.text)}`).join('<br>')]))
    : '<p class="empty">No clothing picks yet.</p>';
  const prefs = a.missing.length ? `<p class="note" style="margin-top:14px">Additional requests and preferences:</p><ul class="writeins">${a.missing.map((m) => `<li><strong>${esc(m.name)}</strong>: ${para(m.text)}</li>`).join('')}</ul>` : '';

  const quotes = a.testimonials.map((q) => `<blockquote class="quote"><p>${para(q.text)}</p><div class="who">${esc(q.name)} · may publish ${PERM_LABEL[q.perm] ?? ''}</div></blockquote>`).join('');
  const fbRows = a.delivery.map((d) => [esc(d.name), 'Delivery process', `“${para(d.text)}”`]).concat(a.comments.map((c) => [esc(c.name), 'Other comments', `“${para(c.text)}”`]));
  const feedback = fbRows.length ? `<div class="card" style="margin-top:16px">${table(['District', 'Question', 'What they wrote'], fbRows)}</div>` : '';
  const voices = quotes || feedback ? `<div class="quotes">${quotes}</div>${feedback}` : '<div class="card"><p class="empty">No testimonials or comments yet.</p></div>';

  const followUps = t.followUps.length ? `<section id="next"><div class="next"><h2>Suggested follow-ups</h2><ol>${t.followUps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div></section>` : '';
  const sheets = a.rows.map(sheet).join('') || '<div class="card"><p class="empty">Nothing to show yet.</p></div>';

  const exclSpan = a.excluded.length ? `${fmtDay(a.excluded[0].submittedAt)} to ${fmtDay(a.excluded[a.excluded.length - 1].submittedAt)}` : '';
  const sorted = a.durations.slice().sort((x, y) => x - y);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;

  const body = `<div class="page">
<header class="masthead">
  ${TOMATO_SVG}
  <div class="title">
    <div class="eyebrow">Let's Ketchup · Care Closet program</div>
    <h1>Partner Check-In Results</h1>
    <div class="sub">Care Closet Survey · responses so far</div>
  </div>
  <p class="lede">Responses received through ${esc(reportDate)}. The survey went to the ${total} Care Closet partners on ${esc(sentLabel)}.</p>
</header>
${kpis}
<section id="who">
  <div class="sec-head"><div class="eyebrow">Response status</div><h2>Who has responded</h2><p>${esc(t.roster)}</p></div>
  <div class="roster">${chips}</div>
</section>
<section id="budget">
  <div class="sec-head"><div class="eyebrow">Budget allocation</div><h2>Where each district wants its funds to go</h2><p>${esc(t.budget)}</p></div>
  ${budgetHtml}
</section>
<section id="items">
  <div class="sec-head"><div class="eyebrow">Most-needed items</div><h2>What districts are asking for</h2>
  <p>${esc(t.food)} ${esc(t.hygiene)}</p><p>${esc(t.clothing)}</p></div>
  ${charts}
</section>
<section id="sizes">
  <div class="sec-head"><div class="eyebrow">Clothing detail</div><h2>Sizes requested</h2><p>Each clothing pick asked which sizes are needed. Listed in size order; "through" marks a continuous run.</p></div>
  <div class="card">${sizesHtml}${prefs}</div>
</section>
<section id="voices">
  <div class="sec-head"><div class="eyebrow">Testimonials and feedback</div><h2>In their words</h2><p>${esc(t.voices)}</p></div>
  ${voices}
</section>
${followUps}
<section id="sheets">
  <div class="sec-head"><div class="eyebrow">By district</div><h2>Order sheets</h2><p>Everything each district submitted, in one place, for purchasing and delivery planning.</p></div>
  <div class="sheets">${sheets}</div>
</section>
<section id="about">
  <div class="sec-head"><div class="eyebrow">About this data</div><h2>How this report was built</h2></div>
  <ul class="notes">
    <li>Generated automatically from the survey app's response table on ${esc(reportDate)}. A fresh copy is attached to every new-response email, and the current version is always at the admin report link.</li>
    <li>The database holds ${allRows.length} row${allRows.length === 1 ? '' : 's'}.${a.excluded.length ? ` ${a.excluded.length} submitted ${esc(exclSpan)}, before the survey was sent, came from building and testing it and are excluded.` : ''}</li>
    <li>Item counts are out of the districts that saw the question. Food, hygiene and clothing questions are hidden when a district sets that category to 0% of its budget.</li>
    <li>Times are Central.${sorted.length ? ` Completion time ran from ${Math.round(sorted[0])} to ${Math.round(sorted[sorted.length - 1])} minutes, with a median of ${Math.round(median)}. ${a.phones} of ${n} responses came from a phone.` : ''}</li>
  </ul>
</section>
<footer><div class="tagline">Lunch is on us!</div><div>Let's Ketchup · Kankakee County · Prepared by Criterion Insights</div></footer>
</div>`;

  const head = `<title>Care Closet Check-In Results</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&display=swap">
<style>${CSS}</style>`;

  if (fragment) return `${head}\n${body}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

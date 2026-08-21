// Server-side validation of a submitted survey response against shared/survey.json.
//
// Philosophy: lenient about *shape* (extra keys are ignored, a couple of equivalent
// encodings are accepted), strict about *constraints* (required questions, known option
// ids, max selections, weights summing to exactly 100).
import {
  survey,
  questions,
  questionsById,
  followUps,
  OTHER_ID,
  optionIds,
  categoryIds,
  categoryLabel,
} from './survey.js';

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

class Invalid extends Error {}
const fail = (msg) => {
  throw new Invalid(msg);
};

/**
 * Normalise a radio / select answer into { value, other? }.
 * Accepts: "bradley" | { value: "other", other: "Text" } | { id: "..." } | { selected: "..." }
 */
function normaliseChoice(q, raw) {
  let value;
  let other;
  if (typeof raw === 'string') {
    value = raw;
  } else if (isPlainObject(raw)) {
    value = raw.value ?? raw.id ?? raw.selected;
    other = raw.other ?? raw.otherText;
    if (value === undefined && isNonEmptyString(other)) value = OTHER_ID;
  } else {
    fail(`"${q.title}": answer must be a choice id or { value, other }.`);
  }
  if (typeof value !== 'string') fail(`"${q.title}": answer must be a choice id.`);
  return { value: value.trim(), other: typeof other === 'string' ? other.trim() : undefined };
}

function validateChoice(q, raw) {
  if (raw === undefined || raw === null || raw === '') {
    if (q.required) fail(`"${q.title}" is required.`);
    return undefined;
  }
  const { value, other } = normaliseChoice(q, raw);
  if (value === '') {
    if (q.required) fail(`"${q.title}" is required.`);
    return undefined;
  }
  const known = optionIds(q);
  if (value === OTHER_ID) {
    if (!q.allowOther) fail(`"${q.title}" does not accept an "other" answer.`);
    if (!isNonEmptyString(other)) fail(`"${q.title}": please fill in the "Other" box.`);
    return { value: OTHER_ID, other };
  }
  if (!known.has(value)) fail(`"${q.title}": "${value}" is not one of the available choices.`);
  return { value };
}

function validateText(q, raw) {
  if (raw === undefined || raw === null) {
    if (q.required) fail(`"${q.title}" is required.`);
    return undefined;
  }
  const value = typeof raw === 'string' ? raw : String(raw);
  if (!isNonEmptyString(value)) {
    if (q.required) fail(`"${q.title}" is required.`);
    return undefined;
  }
  if (value.length > 5000) fail(`"${q.title}": answer is too long (5000 characters max).`);
  return value.trim();
}

/**
 * Shared front half of every multi-choice question (select-weight, select-rank,
 * multi-select): normalise `selected`, enforce known ids / "none" exclusivity /
 * maxSelect, and validate the "Other" text.
 *
 * @returns {{ selected: string[], other?: string, none?: true }}
 */
function validateSelection(q, raw, { shapeHint }) {
  if (!isPlainObject(raw)) {
    fail(`"${q.title}": answer must be an object like ${shapeHint}.`);
  }

  const noneId = q.noneOption?.id;
  let selected = Array.isArray(raw.selected) ? raw.selected.slice() : [];
  if (selected.some((s) => typeof s !== 'string')) {
    fail(`"${q.title}": "selected" must be a list of choice ids.`);
  }
  selected = selected.map((s) => s.trim()).filter((s) => s !== '');

  // Tolerate { none: true } with an empty selection list.
  if (raw.none === true && noneId && !selected.includes(noneId)) selected = [noneId];

  if (selected.length === 0) {
    if (q.required) fail(`"${q.title}" is required — please make a selection.`);
    return undefined;
  }
  if (new Set(selected).size !== selected.length) {
    fail(`"${q.title}": the same option was selected twice.`);
  }

  const known = optionIds(q);
  for (const id of selected) {
    const ok = known.has(id) || (q.allowOther && id === OTHER_ID) || (noneId && id === noneId);
    if (!ok) fail(`"${q.title}": "${id}" is not one of the available choices.`);
  }

  // "None" is exclusive.
  if (noneId && selected.includes(noneId)) {
    if (selected.length > 1) {
      fail(`"${q.title}": "${q.noneOption.label}" cannot be combined with other selections.`);
    }
    return { selected: [noneId], none: true };
  }

  if (q.maxSelect && selected.length > q.maxSelect) {
    fail(
      `"${q.title}": please select at most ${q.maxSelect} option${q.maxSelect === 1 ? '' : 's'}.`
    );
  }

  const out = { selected };
  if (selected.includes(OTHER_ID)) {
    const other = typeof raw.other === 'string' ? raw.other.trim() : '';
    if (!isNonEmptyString(other)) fail(`"${q.title}": please fill in the "Other" box.`);
    if (other.length > 500) fail(`"${q.title}": the "Other" text is too long (500 characters max).`);
    out.other = other;
  }
  return out;
}

/**
 * Plain "tick all that apply" question.
 * Canonical shape: { selected: [id...], other?: "text" }
 */
function validateMultiSelect(q, raw) {
  if (raw === undefined || raw === null) {
    if (q.required) fail(`"${q.title}" is required.`);
    return undefined;
  }
  const base = validateSelection(q, raw, { shapeHint: '{ selected: [...] }' });
  if (!base) return undefined;
  return base.none ? base : { selected: base.selected, ...(base.other ? { other: base.other } : {}) };
}

/**
 * Select-then-rank question.
 * Canonical shape: { selected: [id...], other?: "text", ranking: [id...] }
 * `ranking` must be an exact permutation of `selected`; the "none" answer carries none.
 */
function validateSelectRank(q, raw) {
  if (raw === undefined || raw === null) {
    if (q.required) fail(`"${q.title}" is required.`);
    return undefined;
  }
  const base = validateSelection(q, raw, { shapeHint: '{ selected, ranking }' });
  if (!base) return undefined;
  if (base.none) return base;

  let ranking = Array.isArray(raw.ranking) ? raw.ranking.slice() : [];
  if (ranking.some((s) => typeof s !== 'string')) {
    fail(`"${q.title}": "ranking" must be a list of choice ids.`);
  }
  ranking = ranking.map((s) => s.trim()).filter((s) => s !== '');
  // An unranked-but-selected answer is not usable data: the order is the answer.
  if (ranking.length !== base.selected.length || new Set(ranking).size !== ranking.length) {
    fail(`"${q.title}": please put every selection in order (1 to ${base.selected.length}).`);
  }
  for (const id of ranking) {
    if (!base.selected.includes(id)) {
      fail(`"${q.title}": "${id}" was ranked but not selected.`);
    }
  }

  const out = { selected: base.selected, ranking };
  if (base.other !== undefined) out.other = base.other;
  return out;
}

/**
 * Normalise + validate a select-weight answer.
 * Canonical shape: { selected: [id...], other?: "text", none?: true, weights?: { id: pct } }
 */
function validateSelectWeight(q, raw) {
  if (raw === undefined || raw === null) {
    if (q.required) fail(`"${q.title}" is required.`);
    return undefined;
  }
  const base = validateSelection(q, raw, { shapeHint: '{ selected, weights }' });
  if (!base) return undefined;
  if (base.none) return base;

  const selected = base.selected;
  const rawWeights = isPlainObject(raw.weights) ? raw.weights : {};
  const weightKeys = Object.keys(rawWeights);
  const missing = selected.filter((id) => !weightKeys.includes(id));
  const extra = weightKeys.filter((id) => !selected.includes(id));
  if (missing.length) fail(`"${q.title}": missing a weight for ${missing.join(', ')}.`);
  if (extra.length) fail(`"${q.title}": got a weight for unselected option ${extra.join(', ')}.`);

  const weights = {};
  let total = 0;
  for (const id of selected) {
    const n = rawWeights[id];
    const num = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
    if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
      fail(`"${q.title}": weights must be whole numbers of 0 or more.`);
    }
    weights[id] = num;
    total += num;
  }
  if (total !== 100) fail(`"${q.title}": weights must total exactly 100% (they total ${total}%).`);

  const out = { selected, weights };
  if (base.other !== undefined) out.other = base.other;
  return out;
}

/**
 * Normalise + validate an `allocate` answer: a fixed set of categories (declared on the
 * question, not chosen by the respondent) that must be split into whole percentages
 * totalling exactly 100.
 * Canonical shape: { weights: { categoryId: pct } } — every category present, 0 allowed.
 *
 * Tolerated inputs: a bare map `{ food: 40, hygiene: 30, clothing: 30 }` (no `weights`
 * wrapper) and numeric strings.
 */
function validateAllocate(q, raw) {
  const ids = categoryIds(q);
  if (raw === undefined || raw === null || raw === '') {
    if (q.required) fail(`"${q.title}" is required.`);
    return undefined;
  }
  if (!isPlainObject(raw)) {
    fail(`"${q.title}": answer must be an object like { weights: { ${ids.join(', ')} } }.`);
  }
  // Accept either { weights: {...} } or the bare map.
  const rawWeights = isPlainObject(raw.weights) ? raw.weights : raw;
  const given = Object.keys(rawWeights);

  const missing = ids.filter((id) => !given.includes(id));
  if (missing.length) {
    fail(
      `"${q.title}": missing a percentage for ${missing.map((id) => categoryLabel(q, id)).join(', ')}.`
    );
  }
  const extra = given.filter((id) => !ids.includes(id));
  if (extra.length) fail(`"${q.title}": "${extra[0]}" is not one of the categories.`);

  const weights = {};
  let total = 0;
  for (const id of ids) {
    const n = rawWeights[id];
    const num = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
    if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
      fail(`"${q.title}": percentages must be whole numbers of 0 or more.`);
    }
    if (num > 100) fail(`"${q.title}": no single category can be more than 100%.`);
    weights[id] = num;
    total += num;
  }
  if (total !== 100) {
    fail(`"${q.title}": percentages must total exactly 100% (they total ${total}%).`);
  }
  return { weights };
}

/** Validate one question's raw answer according to its type. */
function validateAnswer(q, raw) {
  switch (q.type) {
    case 'radio':
    case 'select':
      return validateChoice(q, raw);
    case 'allocate':
      return validateAllocate(q, raw);
    case 'select-weight':
      return validateSelectWeight(q, raw);
    case 'select-rank':
      return validateSelectRank(q, raw);
    case 'multi-select':
      return validateMultiSelect(q, raw);
    case 'text':
    case 'textarea':
    default:
      return validateText(q, raw);
  }
}

/**
 * Is a `showIf` condition satisfied by the *submitted* answers?
 *
 * Supported condition: { questionId, categoryAboveZero } — true when that `allocate`
 * question gave the named category more than 0%. Anything unrecognised fails open (the
 * question is treated as visible and therefore validated as usual).
 *
 * @param cond   the question's `showIf` object
 * @param valueOf  (questionId) => that question's validated answer
 */
function conditionMet(cond, valueOf) {
  if (!isPlainObject(cond)) return true;
  // A condition pointing at a question that doesn't exist is a survey.json mistake:
  // fail open (ask the question) rather than silently dropping answers.
  if (!questionsById.has(cond.questionId)) return true;
  const dep = valueOf(cond.questionId);
  if (typeof cond.categoryAboveZero === 'string') {
    const pct = dep?.weights?.[cond.categoryAboveZero];
    return typeof pct === 'number' && pct > 0;
  }
  if (cond.equals !== undefined) {
    const value = dep && typeof dep === 'object' ? dep.value : dep;
    return value === cond.equals;
  }
  return true;
}

/**
 * Validate a whole submission.
 * @returns {{ surveyId, answers, meta }} the cleaned payload ready to store
 * @throws {Invalid} with a human-readable message
 */
export function validateSubmission(body) {
  if (!isPlainObject(body)) fail('Request body must be a JSON object.');
  if (body.surveyId !== survey.surveyId) {
    fail(`Unknown surveyId "${body.surveyId}" — expected "${survey.surveyId}".`);
  }
  if (!isPlainObject(body.answers)) fail('"answers" must be an object of { questionId: answer }.');

  const raw = body.answers;
  const answers = {};

  // Conditional questions ("showIf") are evaluated against the *submitted* answers, so a
  // question's visibility can depend on another question's validated value. Values are
  // therefore computed lazily and memoised; `pending` guards against a circular showIf.
  const computed = new Map();
  const pending = new Set();

  const valueOf = (questionId) => {
    if (computed.has(questionId)) return computed.get(questionId);
    const dep = questionsById.get(questionId);
    if (!dep || pending.has(questionId)) return undefined;
    return resolve(dep);
  };

  /** @returns the validated answer, or undefined when absent, empty, or hidden. */
  const resolve = (q) => {
    if (computed.has(q.id)) return computed.get(q.id);
    pending.add(q.id);
    let value;
    try {
      // A hidden question is neither required nor stored: any answer sent for it anyway
      // is silently dropped.
      value = isVisible(q) ? validateAnswer(q, raw[q.id]) : undefined;
    } finally {
      pending.delete(q.id);
    }
    computed.set(q.id, value);
    return value;
  };

  const visibility = new Map();
  const isVisible = (q) => {
    if (!q.showIf) return true;
    if (!visibility.has(q.id)) visibility.set(q.id, conditionMet(q.showIf, valueOf));
    return visibility.get(q.id);
  };

  for (const q of questions) {
    const shown = isVisible(q);
    const value = resolve(q);
    if (value !== undefined) answers[q.id] = value;

    // Follow-up, if its trigger condition is met. Accepts either a top-level answer
    // keyed by the follow-up id, or a nested `followUp` field on the parent answer.
    if (q.followUp && shown) {
      const fu = q.followUp;
      const parentValue = value && typeof value === 'object' ? value.value : value;
      const triggered = !fu.showWhen || fu.showWhen.includes(parentValue);
      const nested = isPlainObject(raw[q.id]) ? raw[q.id].followUp ?? raw[q.id][fu.id] : undefined;
      const fuRaw = raw[fu.id] ?? nested;
      if (triggered) {
        const fuValue = validateText(fu, fuRaw);
        if (fuValue !== undefined) answers[fu.id] = fuValue;
      }
    }
  }

  const rawMeta = isPlainObject(body.meta) ? body.meta : {};
  const meta = {};
  for (const key of ['startedAt', 'completedAt', 'userAgent', 'durationMs', 'locale']) {
    if (rawMeta[key] !== undefined && typeof rawMeta[key] !== 'object') meta[key] = rawMeta[key];
  }

  return { surveyId: survey.surveyId, answers, meta };
}

export { Invalid, followUps };

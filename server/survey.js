// Loads the canonical survey definition from shared/survey.json.
// The client renders from this same file, so there is exactly one source of truth.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SURVEY_PATH = path.resolve(__dirname, '..', 'shared', 'survey.json');

export const survey = JSON.parse(fs.readFileSync(SURVEY_PATH, 'utf8'));

/** Every top-level question, in survey order. */
export const questions = survey.questions ?? [];

/** Follow-up questions (e.g. "who is the next contact?"), keyed by their own id. */
export const followUps = new Map(
  questions.filter((q) => q.followUp).map((q) => [q.followUp.id, { parent: q, ...q.followUp }])
);

export const questionsById = new Map(questions.map((q) => [q.id, q]));

/** The id used for the free-text "Other" choice on select / radio / select-weight. */
export const OTHER_ID = 'other';

export function optionIds(q) {
  return new Set((q.options ?? []).map((o) => o.id));
}

/** Category ids of an `allocate` question, in definition order. */
export function categoryIds(q) {
  return (q.categories ?? []).map((c) => c.id);
}

export function categoryLabel(q, id) {
  const cat = (q.categories ?? []).find((c) => c.id === id);
  return cat ? cat.label : id;
}

/**
 * The detail scale an option opens ("which sizes?", "male/female"), or null.
 * Options name a scale by key; the scales themselves live on the question.
 */
export function detailScale(q, optionId) {
  const opt = (q.options ?? []).find((o) => o.id === optionId);
  if (!opt || !opt.detail) return null;
  const scale = (q.detailScales ?? {})[opt.detail];
  return scale && Array.isArray(scale.options) ? scale : null;
}

/** Every option of this question that carries a detail scale, in order. */
export function optionsWithDetail(q) {
  return (q.options ?? []).filter((o) => detailScale(q, o.id));
}

export function detailLabel(q, optionId, detailId) {
  const scale = detailScale(q, optionId);
  const found = scale?.options.find((o) => o.id === detailId);
  return found ? found.label : detailId;
}

export function optionLabel(q, id) {
  if (id === OTHER_ID) return q.otherLabel ?? 'Other';
  if (q.noneOption && id === q.noneOption.id) return q.noneOption.label;
  const opt = (q.options ?? []).find((o) => o.id === id);
  return opt ? opt.label : id;
}

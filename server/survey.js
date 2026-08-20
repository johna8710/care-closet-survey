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

export function optionLabel(q, id) {
  if (id === OTHER_ID) return q.otherLabel ?? 'Other';
  if (q.noneOption && id === q.noneOption.id) return q.noneOption.label;
  const opt = (q.options ?? []).find((o) => o.id === id);
  return opt ? opt.label : id;
}

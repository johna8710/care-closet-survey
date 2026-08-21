/**
 * Conditional questions.
 *
 * A question may carry a `showIf` rule; without one it is always shown:
 *
 *   "showIf": { "questionId": "budget_allocation", "categoryAboveZero": "food" }
 *     -> show only while that allocate answer gives "food" more than 0%
 *
 *   "showIf": { "questionId": "contact_continuation", "equals": "no" }
 *   "showIf": { "questionId": "contact_continuation", "oneOf": ["no", "unsure"] }
 *     -> plain-value comparisons, for whatever the survey needs next
 *
 * Hiding is a *display* decision, never a data one: a hidden question keeps
 * whatever was already answered (so flipping a category back to 20% restores
 * the work), it simply stops producing screens, stops being validated and is
 * dropped from the payload at submit time — see buildAnswers().
 *
 * Rules this module doesn't recognise fail open (the question stays visible),
 * so a survey.json typo can never silently swallow a question.
 */

/** Deliberately dependency-free: reads the raw stored answer, nothing more. */
function weightsOf(value) {
  if (!value || typeof value !== 'object' || !value.weights || typeof value.weights !== 'object') {
    return null
  }
  return value.weights
}

function categoryPct(weights, categoryId) {
  const n = Number(weights[categoryId])
  return Number.isFinite(n) ? n : 0
}

export function isQuestionVisible(question, answers) {
  const rule = question && question.showIf
  if (!rule || !rule.questionId) return true

  const value = answers ? answers[rule.questionId] : undefined

  if (rule.categoryAboveZero) {
    const weights = weightsOf(value)
    // Nothing allocated yet: the survey shows its full length until the
    // respondent tells it otherwise, rather than pretending to be short and
    // then growing. (They cannot get past the allocation screen without a
    // valid 100% split, so this only ever applies on that screen itself.)
    if (!weights) return true
    return categoryPct(weights, rule.categoryAboveZero) > 0
  }
  if (rule.equals !== undefined) return value === rule.equals
  if (Array.isArray(rule.oneOf)) return rule.oneOf.includes(value)

  return true
}

/** The questions a respondent will actually see, given the answers so far. */
export function visibleQuestions(questions, answers) {
  return questions.filter((q) => isQuestionVisible(q, answers))
}

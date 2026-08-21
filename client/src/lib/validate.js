import {
  allocateTotal,
  rankValue,
  selectionValue,
  selectValue,
  weightTotal,
  weightValue
} from './answers.js'

/** Shared wording for both constant-sum screens (weighting and allocation). */
function sumMessage(total, noun) {
  if (total === 100) return null
  return total < 100
    ? `Your ${noun} add up to ${total}% — ${100 - total}% still to go before we can continue.`
    : `Your ${noun} add up to ${total}% — that’s ${total - 100}% over. Trim them back to 100%.`
}

/**
 * Returns a warm, human validation message, or null when the screen is good to
 * leave. Never throws, never alerts.
 *
 * A "step" is a screen: the first half of a two-part question ('main'), or its
 * weighting / ranking half ('weight' | 'rank').
 */
export function validateStep(step, answers) {
  const question = step.question
  const value = answers[question.id]

  if (step.part === 'weight') return sumMessage(weightTotal(value), 'weights')

  if (step.part === 'rank') {
    const v = rankValue(value)
    return v.ranking.length === v.selected.length ? null : 'Please put every item in order first.'
  }

  return validateQuestion(question, answers)
}

/** Validation for the first (or only) screen of a question. */
export function validateQuestion(question, answers) {
  const value = answers[question.id]

  switch (question.type) {
    case 'select': {
      const v = selectValue(value)
      if (!v.id) return question.required ? 'Please choose an option to continue.' : null
      if (v.id === 'other' && !v.other.trim()) {
        return 'Just add your district name in the box, and we’ll keep going.'
      }
      return null
    }

    case 'radio': {
      if (!value) return question.required ? 'Please pick one option to continue.' : null
      return null
    }

    case 'text':
    case 'textarea': {
      const s = typeof value === 'string' ? value.trim() : ''
      if (!s && question.required) return 'This one’s required — a short answer is perfect.'
      return null
    }

    case 'allocate':
      return sumMessage(allocateTotal(value, question.categories || []), 'percentages')

    case 'multi-select': {
      const v = selectionValue(value)
      if (v.selected.length === 0) {
        return question.required ? 'Please choose at least one option to continue.' : null
      }
      if (v.selected.includes('other') && !v.other.trim()) {
        return 'Add the other size in the box, and we can keep going.'
      }
      return null
    }

    case 'select-weight':
    case 'select-rank': {
      const v = weightValue(value)
      if (v.none) return null
      if (v.selected.length === 0) {
        return question.required
          ? `Please choose at least one — or pick “${question.noneOption?.label || 'None'}”.`
          : null
      }
      if (v.selected.includes('other') && !v.other.trim()) {
        return 'Tell us what the other item was, then we can keep going.'
      }
      return null
    }

    default:
      return null
  }
}

/** Is the screen "touched enough" that Next should read as Next rather than Skip? */
export function isAnswered(step, answers) {
  const question = step.question
  if (step.part !== 'main') return true
  const value = answers[question.id]
  if (question.type === 'select-weight' || question.type === 'select-rank') {
    const v = selectionValue(value)
    return v.none || v.selected.length > 0
  }
  if (question.type === 'allocate') return allocateTotal(value, question.categories || []) > 0
  if (question.type === 'multi-select') return selectionValue(value).selected.length > 0
  if (question.type === 'select') return Boolean(selectValue(value).id)
  if (typeof value === 'string') return value.trim().length > 0
  return Boolean(value)
}

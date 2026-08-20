import { selectionValue } from './answers.js'

/**
 * The survey is a list of *screens*, not a list of questions: the two-part
 * questions (select-weight, select-rank) show their second half on its own
 * screen, and that screen only exists once something is selected — picking the
 * exclusive "None" skips it entirely.
 *
 * Screens are recomputed from the answers on every render, so the flow reshapes
 * itself as the respondent changes their mind (and a resumed session lands on
 * the right screen, because the answers came back with it).
 *
 * @returns {Array<{ key, question, part, number }>}  part: 'main' | 'weight' | 'rank'
 */
export function buildSteps(questions, answers) {
  const steps = []
  questions.forEach((question, i) => {
    const number = i + 1
    steps.push({ key: question.id, question, part: 'main', number })

    const twoPart =
      question.type === 'select-weight' ? 'weight' : question.type === 'select-rank' ? 'rank' : null
    if (!twoPart) return

    const v = selectionValue(answers[question.id])
    if (!v.none && v.selected.length > 0) {
      steps.push({ key: `${question.id}::${twoPart}`, question, part: twoPart, number })
    }
  })
  return steps
}

/** Where a step sits, for the header ("Question 4 of 11 · Part 2"). */
export function stepCounter(step, questionCount) {
  if (!step) return null
  const base = `Question ${step.number} of ${questionCount}`
  return step.part === 'main' ? base : `${base} · Part 2`
}

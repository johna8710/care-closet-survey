import { selectionValue } from './answers.js'
import { visibleQuestions } from './visibility.js'

/**
 * The survey is a list of *screens*, not a list of questions:
 *
 *  - questions carrying a `showIf` rule drop out entirely while the rule is
 *    unmet (lib/visibility.js), taking their screens and their place in the
 *    numbering with them;
 *  - the two-part questions (select-weight, select-rank) show their second half
 *    on its own screen, and that screen only exists once something is selected —
 *    picking the exclusive "None" skips it entirely.
 *
 * Screens are recomputed from the answers on every render, so the flow reshapes
 * itself as the respondent changes their mind — walk Back to the budget screen,
 * drop Clothing to 0%, and the clothing questions are gone on the way forward
 * again (and back the moment it goes above 0%). A resumed session lands on the
 * right screen for the same reason: the answers came back with it.
 *
 * @returns {Array<{ key, question, part, number, total }>}  part: 'main' | 'weight' | 'rank'
 */
export function buildSteps(questions, answers) {
  const visible = visibleQuestions(questions, answers)
  const total = visible.length
  const steps = []

  visible.forEach((question, i) => {
    const number = i + 1
    steps.push({ key: question.id, question, part: 'main', number, total })

    const twoPart =
      question.type === 'select-weight' ? 'weight' : question.type === 'select-rank' ? 'rank' : null
    if (!twoPart) return

    const v = selectionValue(answers[question.id])
    if (!v.none && v.selected.length > 0) {
      steps.push({ key: `${question.id}::${twoPart}`, question, part: twoPart, number, total })
    }
  })

  return steps
}

/** How many questions this respondent will actually be asked. */
export function countVisible(questions, answers) {
  return visibleQuestions(questions, answers).length
}

/** Where a step sits, for the header ("Question 4 of 11 · Part 2"). */
export function stepCounter(step, questionCount) {
  if (!step) return null
  const base = `Question ${step.number} of ${questionCount || step.total}`
  return step.part === 'main' ? base : `${base} · Part 2`
}

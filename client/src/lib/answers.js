/**
 * Answer shapes (one per question type). The client stores exactly what it
 * POSTs, so the server can validate the same structures:
 *
 *   text / textarea / radio  -> "string"          (radio = option id)
 *   radio follow-up          -> stored under the follow-up's own question id
 *   select                   -> { id: "bbchs" } | { id: "other", other: "…" }
 *   multi-select             -> { selected: ["adult_m", "other"], other?: "…" }
 *   select-weight            -> { selected: ["a","b"], other?: "…",
 *                                 none?: true, weights?: { a: 60, b: 40 } }
 *   select-rank              -> { selected: ["a","b"], other?: "…",
 *                                 none?: true, ranking: ["b","a"] }
 *   allocate                 -> { weights: { food: 50, hygiene: 30, clothing: 20 } }
 *
 * select-weight and allocate weights always sum to exactly 100 (and start at
 * 0 — nothing is pre-filled for the respondent); select-rank ranking is always
 * a permutation of `selected`. select-weight / select-rank drop their second
 * half when the exclusive "none" option is chosen.
 *
 * Questions hidden by a `showIf` rule are left out of the POST entirely, even
 * when they were answered earlier — see buildAnswers().
 */

import { visibleQuestions } from './visibility.js'

export const emptySelection = () => ({ selected: [], other: '', none: false })

/** The half every multi-choice question shares: what was ticked. */
export function selectionValue(value) {
  if (!value || typeof value !== 'object') return emptySelection()
  return {
    selected: Array.isArray(value.selected) ? value.selected : [],
    other: typeof value.other === 'string' ? value.other : '',
    none: value.none === true
  }
}

export const emptyWeightValue = () => ({ selected: [], other: '', none: false, weights: {} })

export function weightValue(value) {
  const base = selectionValue(value)
  return {
    ...base,
    weights: value && typeof value === 'object' && value.weights && typeof value.weights === 'object'
      ? value.weights
      : {}
  }
}

/** Ranking, always normalised to a permutation of `selected` (selection order first). */
export function rankValue(value) {
  const base = selectionValue(value)
  const stored = value && typeof value === 'object' && Array.isArray(value.ranking) ? value.ranking : []
  const ranking = stored.filter((id) => base.selected.includes(id))
  base.selected.forEach((id) => {
    if (!ranking.includes(id)) ranking.push(id)
  })
  return { ...base, ranking }
}

/** allocate: every category always present, missing ones reading as 0. */
export function allocateValue(value, categories = []) {
  const stored = value && typeof value === 'object' && value.weights && typeof value.weights === 'object'
    ? value.weights
    : {}
  const weights = {}
  categories.forEach((c) => {
    weights[c.id] = clampPct(Number(stored[c.id]) || 0)
  })
  return { weights }
}

export function allocateTotal(value, categories = []) {
  const v = allocateValue(value, categories)
  return categories.reduce((sum, c) => sum + (Number(v.weights[c.id]) || 0), 0)
}

export function weightTotal(value) {
  const v = weightValue(value)
  return v.selected.reduce((sum, id) => sum + (Number(v.weights[id]) || 0), 0)
}

export function selectValue(value) {
  if (!value || typeof value !== 'object') return { id: '', other: '' }
  return { id: value.id || '', other: typeof value.other === 'string' ? value.other : '' }
}

/** Even split that always lands on exactly 100 (3 -> 34/33/33, 2 -> 50/50). */
export function evenSplit(ids) {
  const n = ids.length
  const weights = {}
  if (n === 0) return weights
  const base = Math.floor(100 / n)
  let remainder = 100 - base * n
  ids.forEach((id) => {
    weights[id] = base + (remainder-- > 0 ? 1 : 0)
  })
  return weights
}

export function clampPct(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Strip transient UI state before sending to the server, and drop anything the
 * respondent can no longer see: a question hidden by its `showIf` rule never
 * reaches the server, even if it was answered before the allocation changed.
 * (The answer stays in localStorage — flip the category back above 0% and the
 * work is still there.)
 */
export function buildAnswers(questions, answers) {
  const out = {}
  const push = (id, value) => {
    if (value === undefined || value === null) return
    if (typeof value === 'string' && value.trim() === '') return
    out[id] = value
  }

  visibleQuestions(questions, answers).forEach((q) => {
    const value = answers[q.id]
    if (value === undefined) return

    if (q.type === 'allocate') {
      const categories = q.categories || []
      if (categories.length === 0) return
      push(q.id, { weights: allocateValue(value, categories).weights })
      return
    }

    if (q.type === 'select-weight' || q.type === 'select-rank') {
      const v = q.type === 'select-rank' ? rankValue(value) : weightValue(value)
      // Exclusive "none": the server expects the none id in `selected`
      // and nothing else.
      if (v.none) {
        push(q.id, { selected: [q.noneOption?.id || 'none'] })
        return
      }
      if (v.selected.length === 0) return
      const payload = { selected: [...v.selected] }
      if (q.type === 'select-rank') {
        payload.ranking = [...v.ranking]
      } else {
        payload.weights = {}
        v.selected.forEach((id) => {
          payload.weights[id] = clampPct(Number(v.weights[id]) || 0)
        })
      }
      if (v.selected.includes('other') && v.other.trim()) payload.other = v.other.trim()
      push(q.id, payload)
      return
    }

    if (q.type === 'multi-select') {
      const v = selectionValue(value)
      if (v.selected.length === 0) return
      const payload = { selected: [...v.selected] }
      if (v.selected.includes('other') && v.other.trim()) payload.other = v.other.trim()
      push(q.id, payload)
      return
    }

    if (q.type === 'select') {
      const v = selectValue(value)
      if (!v.id) return
      // Server contract: { value: "<optionId>", other?: "text" }
      const payload = { value: v.id }
      if (v.id === 'other' && v.other.trim()) payload.other = v.other.trim()
      push(q.id, payload)
      return
    }

    if (typeof value === 'string') push(q.id, value.trim())
    else push(q.id, value)

    if (q.followUp) {
      const fu = answers[q.followUp.id]
      if (typeof fu === 'string' && fu.trim() && q.followUp.showWhen.includes(value)) {
        push(q.followUp.id, fu.trim())
      }
    }
  })

  return out
}

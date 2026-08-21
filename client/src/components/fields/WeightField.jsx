import WeightAllocator from './WeightAllocator.jsx'
import { clampPct, weightValue } from '../../lib/answers.js'

/**
 * Screen two of a select-weight question: split 100% across the items picked on
 * screen one. Every weight starts at 0 — nothing is pre-filled, so the numbers
 * are always the respondent's own.
 *
 * The controls themselves live in WeightAllocator, shared with the fixed
 * category budget screen (AllocateField).
 */
export default function WeightField({ question, value, onChange }) {
  const v = weightValue(value)

  const labelFor = (id) => {
    if (id === 'other') return v.other.trim() || 'Other'
    const opt = question.options.find((o) => o.id === id)
    return opt ? opt.label : id
  }

  const items = v.selected.map((id) => ({ id, name: labelFor(id) }))
  const total = items.reduce((sum, item) => sum + (Number(v.weights[item.id]) || 0), 0)
  const zeroItem = total === 100 ? v.selected.find((id) => clampPct(Number(v.weights[id]) || 0) === 0) : null

  return (
    <WeightAllocator
      items={items}
      weights={v.weights}
      onChange={(weights) => onChange({ ...v, weights })}
      groupLabel={question.weightPrompt}
      idPrefix={`wlab-${question.id}`}
      zeroNote={zeroItem ? `Heads up — “${labelFor(zeroItem)}” is still at 0%.` : null}
    />
  )
}

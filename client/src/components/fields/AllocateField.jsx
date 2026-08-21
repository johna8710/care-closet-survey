import WeightAllocator from './WeightAllocator.jsx'
import { allocateValue } from '../../lib/answers.js'

/**
 * A constant-sum split over categories fixed by the survey — no picking phase,
 * no "None", no "Other": every category is always on screen, starts at 0%, and
 * the three have to add up to 100 before Next opens.
 *
 * Setting a category to 0% is a real answer, not an omission: it means "don't
 * spend here", and the follow-up questions about that category drop out of the
 * survey (see lib/visibility.js). The note under the meter says so out loud, so
 * nobody is surprised by a shorter survey.
 */
export default function AllocateField({ question, value, onChange }) {
  const categories = question.categories || []
  const v = allocateValue(value, categories)

  const items = categories.map((c) => ({ id: c.id, name: c.label, sublabel: c.sublabel }))

  const zeros = categories.filter((c) => (Number(v.weights[c.id]) || 0) === 0)
  const zeroNote =
    zeros.length > 0
      ? `${listNames(zeros.map((c) => c.label))} ${zeros.length === 1 ? 'is' : 'are'} at 0% — we’ll skip the questions about ${zeros.length === 1 ? 'it' : 'them'}.`
      : null

  return (
    <WeightAllocator
      items={items}
      weights={v.weights}
      onChange={(weights) => onChange({ weights })}
      groupLabel={question.title}
      idPrefix={`alloc-${question.id}`}
      zeroNote={zeroNote}
      zeroNoteTone="info"
    />
  )
}

function listNames(names) {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

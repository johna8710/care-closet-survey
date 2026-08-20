import { useEffect, useRef } from 'react'
import ChoiceCard from './ChoiceCard.jsx'
import { selectValue } from '../../lib/answers.js'

/** Single-choice list of cards, with an optional inline "Other" text input. */
export default function SelectField({ question, value, onChange, onAutoAdvance }) {
  const v = selectValue(value)
  const otherRef = useRef(null)
  const wasOther = useRef(v.id === 'other')

  useEffect(() => {
    if (v.id === 'other' && !wasOther.current && otherRef.current) otherRef.current.focus()
    wasOther.current = v.id === 'other'
  }, [v.id])

  const pick = (id) => {
    onChange({ id, other: id === 'other' ? v.other : '' })
    // Single-choice questions advance themselves — except "Other", which
    // still needs typing.
    if (id !== 'other' && onAutoAdvance) onAutoAdvance()
  }

  return (
    <fieldset>
      <legend className="sr-only">{question.title}</legend>
      <div className="choices">
        {question.options.map((opt) => (
          <ChoiceCard
            key={opt.id}
            shape="radio"
            name={question.id}
            value={opt.id}
            checked={v.id === opt.id}
            label={opt.label}
            sublabel={opt.sublabel}
            onChange={() => pick(opt.id)}
          />
        ))}

        {question.allowOther ? (
          <ChoiceCard
            shape="radio"
            name={question.id}
            value="other"
            checked={v.id === 'other'}
            label={question.otherLabel || 'Other (please specify)'}
            onChange={() => pick('other')}
          >
            <span className="other-slot" data-open={v.id === 'other' ? 'true' : 'false'}>
              <span>
                <input
                  ref={otherRef}
                  type="text"
                  className="input"
                  value={v.other}
                  placeholder="Type your answer"
                  aria-label={question.otherLabel || 'Other (please specify)'}
                  onChange={(e) => onChange({ id: 'other', other: e.target.value })}
                />
              </span>
            </span>
          </ChoiceCard>
        ) : null}
      </div>
    </fieldset>
  )
}

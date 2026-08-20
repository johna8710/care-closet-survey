import { useEffect, useRef, useState } from 'react'
import ChoiceCard from './ChoiceCard.jsx'
import { selectionValue } from '../../lib/answers.js'

/**
 * The "tick what applies" screen shared by multi-select, select-weight and
 * select-rank questions: optional cap, optional exclusive "None", optional
 * inline "Other" text.
 *
 * Anything else already on the answer (weights, ranking) is passed straight
 * through — the second-half screens own those.
 */
export default function ChoiceListField({ question, value, onChange }) {
  const v = selectionValue(value)
  const max = question.maxSelect || null
  const noneOption = question.noneOption
  const otherLabel = question.otherLabel || 'Other (please specify)'

  const [notice, setNotice] = useState(null)
  const [blocked, setBlocked] = useState(false)

  const otherRef = useRef(null)
  const wasOtherSelected = useRef(v.selected.includes('other'))
  const blockTimer = useRef(null)
  const noticeTimer = useRef(null)

  useEffect(
    () => () => {
      clearTimeout(blockTimer.current)
      clearTimeout(noticeTimer.current)
    },
    []
  )

  useEffect(() => {
    const isOther = v.selected.includes('other')
    if (isOther && !wasOtherSelected.current && otherRef.current) otherRef.current.focus()
    wasOtherSelected.current = isOther
  }, [v.selected])

  const flash = (message) => {
    setNotice(message)
    setBlocked(true)
    clearTimeout(blockTimer.current)
    clearTimeout(noticeTimer.current)
    blockTimer.current = setTimeout(() => setBlocked(false), 420)
    noticeTimer.current = setTimeout(() => setNotice(null), 6000)
  }

  const commit = (next) => onChange({ ...(value && typeof value === 'object' ? value : {}), ...next })

  const toggle = (id) => {
    if (v.selected.includes(id)) {
      const selected = v.selected.filter((x) => x !== id)
      setNotice(null)
      commit({ selected, none: false, ...(id === 'other' ? { other: '' } : {}) })
      return
    }
    if (max && v.selected.length >= max) {
      flash(`You can pick up to ${max} — deselect one first.`)
      return
    }
    setNotice(null)
    commit({ selected: [...v.selected, id], none: false })
  }

  const toggleNone = () => {
    setNotice(null)
    commit(
      v.none
        ? { selected: [], other: '', none: false }
        : { selected: [], other: '', none: true, weights: {}, ranking: [] }
    )
  }

  const noneSelected = v.none
  const someSelected = v.selected.length > 0

  return (
    <fieldset>
      <legend className="sr-only">
        {question.title}
        {question.selectPrompt ? ` — ${question.selectPrompt}` : ''}
      </legend>

      <div className="choices" data-blocked={blocked ? 'true' : 'false'}>
        {question.options.map((opt) => (
          <ChoiceCard
            key={opt.id}
            shape="check"
            name={`${question.id}-${opt.id}`}
            value={opt.id}
            checked={v.selected.includes(opt.id)}
            disabled={noneSelected}
            label={opt.label}
            sublabel={opt.sublabel}
            onChange={() => toggle(opt.id)}
          />
        ))}

        {question.allowOther ? (
          <ChoiceCard
            shape="check"
            name={`${question.id}-other`}
            value="other"
            checked={v.selected.includes('other')}
            disabled={noneSelected}
            label={otherLabel}
            onChange={() => toggle('other')}
          >
            <span className="other-slot" data-open={v.selected.includes('other') ? 'true' : 'false'}>
              <span>
                <input
                  ref={otherRef}
                  type="text"
                  className="input"
                  value={v.other}
                  placeholder="Type the item"
                  aria-label={otherLabel}
                  onChange={(e) => commit({ other: e.target.value })}
                />
              </span>
            </span>
          </ChoiceCard>
        ) : null}

        {noneOption ? (
          <ChoiceCard
            shape="check"
            name={`${question.id}-none`}
            value={noneOption.id}
            checked={noneSelected}
            disabled={someSelected}
            isNone
            label={noneOption.label}
            onChange={toggleNone}
          />
        ) : null}
      </div>

      <div className="weight-tools" style={{ marginTop: '12px' }}>
        <span className="select-count" data-full={max && v.selected.length >= max ? 'true' : 'false'}>
          {noneSelected
            ? `“${noneOption.label}” selected`
            : max
              ? `${v.selected.length} of ${max} selected`
              : `${v.selected.length} selected`}
        </span>
      </div>

      <div aria-live="polite">
        {notice ? <p className="notice">{notice}</p> : null}
        {noneSelected ? (
          <p className="notice">Unselect this to choose specific items instead.</p>
        ) : null}
      </div>
    </fieldset>
  )
}

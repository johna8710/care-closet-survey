import { useEffect, useRef, useState } from 'react'
import ChoiceCard from './ChoiceCard.jsx'
import { detailScale, detailValue, selectionValue } from '../../lib/answers.js'

/**
 * The "tick what applies" screen shared by multi-select, select-weight and
 * select-rank questions: optional cap, optional exclusive "None", optional
 * inline "Other" text, and optional per-option detail chips (clothing sizes,
 * deodorant male/female) that unfold under an option once it is ticked.
 *
 * Anything else already on the answer (weights, ranking) is passed straight
 * through — the second-half screens own those.
 */
export default function ChoiceListField({ question, value, onChange }) {
  const v = selectionValue(value)
  const max = question.maxSelect || null
  const noneOption = question.noneOption
  const otherLabel = question.otherLabel || 'Other (please specify)'
  const otherPlaceholder = question.otherPlaceholder || 'Type the item'

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
      const details = { ...v.details }
      delete details[id]
      setNotice(null)
      commit({ selected, details, none: false, ...(id === 'other' ? { other: '' } : {}) })
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
        ? { selected: [], other: '', details: {}, none: false }
        : { selected: [], other: '', details: {}, none: true, weights: {}, ranking: [] }
    )
  }

  const toggleDetail = (optionId, detailId) => {
    const current = detailValue(question, value, optionId)
    const next = current.includes(detailId)
      ? current.filter((x) => x !== detailId)
      : [...current, detailId]
    commit({ details: { ...v.details, [optionId]: next } })
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
        {question.options.map((opt) => {
          const scale = detailScale(question, opt.id)
          const open = v.selected.includes(opt.id)
          const picked = detailValue(question, value, opt.id)
          return (
            <ChoiceCard
              key={opt.id}
              shape="check"
              name={`${question.id}-${opt.id}`}
              value={opt.id}
              checked={open}
              disabled={noneSelected}
              label={opt.label}
              sublabel={opt.sublabel}
              onChange={() => toggle(opt.id)}
            >
              {scale ? (
                // The chips live inside the card's <label>, so a tap on one must
                // not bubble up and untick the item it belongs to.
                <span
                  className="detail-slot"
                  data-open={open ? 'true' : 'false'}
                  onClick={(e) => e.preventDefault()}
                >
                  <span className="detail-pad">
                    <span className="detail-prompt">{scale.prompt}</span>
                    <span className="chips">
                      {scale.options.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="chip"
                          data-selected={picked.includes(d.id) ? 'true' : 'false'}
                          aria-pressed={picked.includes(d.id)}
                          tabIndex={open ? 0 : -1}
                          onClick={() => toggleDetail(opt.id, d.id)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </span>
                  </span>
                </span>
              ) : null}
            </ChoiceCard>
          )
        })}

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
                  placeholder={otherPlaceholder}
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

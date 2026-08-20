import { useMemo, useState } from 'react'
import { CheckIcon, MinusIcon, PlusIcon, ScalesIcon } from '../icons.jsx'
import { clampPct, evenSplit, weightTotal, weightValue } from '../../lib/answers.js'

/* Segment colours: warm while the respondent is still allocating, green the
   moment the total lands on exactly 100. */
const WARM = ['#E03939', '#FF8044', '#E8A33D']
const DONE = ['#2F6B4F', '#4E8F6C', '#7FB093']

/**
 * Screen two of a select-weight question: split 100% across the items picked on
 * screen one. Every weight starts at 0 — nothing is pre-filled, so the numbers
 * are always the respondent's own.
 */
export default function WeightField({ question, value, onChange }) {
  const v = weightValue(value)
  const [drafts, setDrafts] = useState({})

  const total = useMemo(() => weightTotal(v), [v])
  const complete = total === 100
  const over = total > 100
  const palette = complete ? DONE : WARM

  const labelFor = (id) => {
    if (id === 'other') return v.other.trim() || 'Other'
    const opt = question.options.find((o) => o.id === id)
    return opt ? opt.label : id
  }

  const setWeight = (id, next) => {
    onChange({ ...v, weights: { ...v.weights, [id]: clampPct(next) } })
  }

  const splitEvenly = () => {
    onChange({ ...v, weights: evenSplit(v.selected) })
    setDrafts({})
  }

  const remaining = 100 - total
  const status = complete
    ? 'Perfect — your weights total 100%.'
    : over
      ? `${total - 100}% over — trim a little.`
      : `${remaining}% remaining.`

  const zeroItem = complete ? v.selected.find((id) => (Number(v.weights[id]) || 0) === 0) : null

  return (
    <div className="weight-body">
      <div
        className="meter"
        data-complete={complete ? 'true' : 'false'}
        data-over={over ? 'true' : 'false'}
      >
        <div className="meter-top">
          {complete ? (
            <span className="meter-check" aria-hidden="true">
              <CheckIcon />
            </span>
          ) : null}
          <span className="meter-total">{total}%</span>
          <span className="meter-status">{complete ? 'Totals 100%' : status}</span>
        </div>
        <div className="meter-bar" aria-hidden="true">
          {v.selected.map((id, i) => {
            const w = clampPct(Number(v.weights[id]) || 0)
            return (
              <span
                key={id}
                className="meter-seg"
                style={{
                  width: `${Math.min(w, 100)}%`,
                  backgroundColor: palette[i % palette.length]
                }}
              />
            )
          })}
        </div>
        <p className="sr-only" aria-live="polite">
          {`Total ${total} percent. ${status}`}
        </p>
        {zeroItem ? (
          <p className="meter-over">Heads up — “{labelFor(zeroItem)}” is still at 0%.</p>
        ) : null}
      </div>

      <div className="weight-rows" role="group" aria-label={question.weightPrompt}>
        {v.selected.map((id, i) => {
          const w = clampPct(Number(v.weights[id]) || 0)
          const color = palette[i % palette.length]
          const name = labelFor(id)
          return (
            <div className="weight-row" key={id}>
              <div className="weight-row-top">
                <span className="weight-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="weight-name" id={`wlab-${question.id}-${id}`}>
                  {name}
                </span>
                <span className="stepper">
                  <button
                    type="button"
                    className="step-btn"
                    onClick={() => setWeight(id, w - 1)}
                    disabled={w <= 0}
                    aria-label={`Decrease ${name} by one percent`}
                  >
                    <MinusIcon />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="pct-input"
                    value={drafts[id] !== undefined ? drafts[id] : String(w)}
                    aria-label={`${name} percentage`}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
                      setDrafts((d) => ({ ...d, [id]: raw }))
                      setWeight(id, raw === '' ? 0 : parseInt(raw, 10))
                    }}
                    onBlur={() =>
                      setDrafts((d) => {
                        const next = { ...d }
                        delete next[id]
                        return next
                      })
                    }
                  />
                  <span className="pct-suffix" aria-hidden="true">
                    %
                  </span>
                  <button
                    type="button"
                    className="step-btn"
                    onClick={() => setWeight(id, w + 1)}
                    disabled={w >= 100}
                    aria-label={`Increase ${name} by one percent`}
                  >
                    <PlusIcon />
                  </button>
                </span>
              </div>
              <input
                type="range"
                className="slider"
                min="0"
                max="100"
                step="1"
                value={w}
                aria-labelledby={`wlab-${question.id}-${id}`}
                aria-valuetext={`${w} percent`}
                style={{
                  '--thumb': color,
                  '--track-bg': `linear-gradient(90deg, ${color} ${w}%, var(--cream-deep) ${w}%)`
                }}
                onChange={(e) => setWeight(id, Number(e.target.value))}
              />
            </div>
          )
        })}
      </div>

      <div className="weight-tools">
        <button type="button" className="btn-tool" onClick={splitEvenly}>
          <ScalesIcon />
          Split evenly
        </button>
        {!complete ? (
          <span className="select-count">{over ? `${total - 100}% over` : `${remaining}% left`}</span>
        ) : null}
      </div>
    </div>
  )
}

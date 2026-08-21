import { useMemo, useState } from 'react'
import { CheckIcon, MinusIcon, PlusIcon, ScalesIcon } from '../icons.jsx'
import { clampPct, evenSplit } from '../../lib/answers.js'

/* Segment colours: warm while the respondent is still allocating, green the
   moment the total lands on exactly 100. */
const WARM = ['#E03939', '#FF8044', '#E8A33D']
const DONE = ['#2F6B4F', '#4E8F6C', '#7FB093']

/**
 * The constant-sum allocator: a live total meter, one slider + numeric stepper
 * per item, and "Split evenly". Shared by both places 100% gets divided up —
 * the weighting half of a select-weight question (WeightField) and the
 * fixed-category budget screen (AllocateField) — so the two always look, feel
 * and round-trip identically.
 *
 * Presentational only: it owns no answer, just `weights` in and out.
 *
 * @param items     [{ id, name, sublabel? }] in display order
 * @param weights   { [id]: number } — anything missing counts as 0
 * @param onChange  (nextWeights) => void
 * @param zeroNote  optional line shown under the meter once the total is 100
 */
export default function WeightAllocator({
  items,
  weights,
  onChange,
  groupLabel,
  idPrefix,
  zeroNote = null,
  zeroNoteTone = 'warn',
  splitLabel = 'Split evenly'
}) {
  const [drafts, setDrafts] = useState({})

  const pct = (id) => clampPct(Number(weights && weights[id]) || 0)
  const total = useMemo(
    () => items.reduce((sum, item) => sum + (Number(weights && weights[item.id]) || 0), 0),
    [items, weights]
  )

  const complete = total === 100
  const over = total > 100
  const palette = complete ? DONE : WARM

  const setWeight = (id, next) => onChange({ ...weights, [id]: clampPct(next) })

  const splitEvenly = () => {
    onChange(evenSplit(items.map((item) => item.id)))
    setDrafts({})
  }

  const remaining = 100 - total
  const status = complete
    ? 'Perfect — your weights total 100%.'
    : over
      ? `${total - 100}% over — trim a little.`
      : `${remaining}% remaining.`

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
          {items.map((item, i) => (
            <span
              key={item.id}
              className="meter-seg"
              style={{
                width: `${Math.min(pct(item.id), 100)}%`,
                backgroundColor: palette[i % palette.length]
              }}
            />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {`Total ${total} percent. ${status}`}
        </p>
        {complete && zeroNote ? (
          <p className="meter-over" data-tone={zeroNoteTone}>
            {zeroNote}
          </p>
        ) : null}
      </div>

      <div className="weight-rows" role="group" aria-label={groupLabel}>
        {items.map((item, i) => {
          const id = item.id
          const w = pct(id)
          const color = palette[i % palette.length]
          const name = item.name
          return (
            <div className="weight-row" key={id}>
              <div className="weight-row-top">
                <span className="weight-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="weight-name" id={`${idPrefix}-${id}`}>
                  {name}
                  {item.sublabel ? <span className="weight-sub">{item.sublabel}</span> : null}
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
                aria-labelledby={`${idPrefix}-${id}`}
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
          {splitLabel}
        </button>
        {!complete ? (
          <span className="select-count">{over ? `${total - 100}% over` : `${remaining}% left`}</span>
        ) : null}
      </div>
    </div>
  )
}

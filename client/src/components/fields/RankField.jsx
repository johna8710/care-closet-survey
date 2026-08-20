import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, GripIcon } from '../icons.jsx'
import { rankValue } from '../../lib/answers.js'

const RANK_COLORS = ['#E03939', '#FF8044', '#E8A33D']

const reorder = (list, from, to) => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

/**
 * Screen two of a select-rank question: drag the chosen items into order.
 *
 * Dragging is pointer-based (mouse, pen and touch all arrive as pointer
 * events), and every drag has a keyboard/AT equivalent: each row carries
 * "move up" / "move down" buttons, and every move is announced politely.
 */
export default function RankField({ question, value, onChange }) {
  const v = rankValue(value)
  const ranking = v.ranking
  const count = ranking.length

  const [dragId, setDragId] = useState(null)
  const [offset, setOffset] = useState(0)
  const [announcement, setAnnouncement] = useState('')

  const listRef = useRef(null)
  const drag = useRef(null)
  const rankingRef = useRef(ranking)
  rankingRef.current = ranking
  const dragIdRef = useRef(null)
  dragIdRef.current = dragId

  const labelFor = (id) => {
    if (id === 'other') return v.other.trim() || 'Other'
    const opt = question.options.find((o) => o.id === id)
    return opt ? opt.label : id
  }

  const commit = (next) => onChange({ ...v, ranking: next })

  /* ---------------- FLIP: animate rows that changed places ---------------- */
  const lastTops = useRef(new Map())
  useLayoutEffect(() => {
    const rows = listRef.current ? listRef.current.querySelectorAll('[data-rank-id]') : []
    rows.forEach((el) => {
      const id = el.dataset.rankId
      const top = el.getBoundingClientRect().top
      const prev = lastTops.current.get(id)
      if (prev !== undefined && prev !== top && id !== dragIdRef.current) {
        el.style.transition = 'none'
        el.style.transform = `translateY(${prev - top}px)`
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.22s cubic-bezier(0.22, 0.9, 0.3, 1)'
          el.style.transform = ''
        })
      }
      lastTops.current.set(id, top)
    })
  })

  useEffect(() => () => (drag.current = null), [])

  /* ---------------- pointer dragging ---------------- */
  const rowStep = () => {
    const rows = listRef.current ? listRef.current.querySelectorAll('[data-rank-id]') : []
    if (rows.length < 2) return 0
    return rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top
  }

  const onPointerDown = (e, id) => {
    if (count < 2 || e.button > 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id, pointerId: e.pointerId, startY: e.clientY, step: rowStep() }
    setDragId(id)
    setOffset(0)
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    const dy = e.clientY - d.startY
    const step = d.step || rowStep()
    const list = rankingRef.current
    const index = list.indexOf(d.id)
    const target = clamp(index + Math.round(dy / (step || 1)), 0, list.length - 1)
    if (step && target !== index) {
      commit(reorder(list, index, target))
      d.startY += (target - index) * step
      setOffset(e.clientY - d.startY)
    } else {
      setOffset(dy)
    }
  }

  const endDrag = (e) => {
    const d = drag.current
    if (!d) return
    if (e && e.currentTarget.hasPointerCapture && e.currentTarget.hasPointerCapture(d.pointerId)) {
      e.currentTarget.releasePointerCapture(d.pointerId)
    }
    const at = rankingRef.current.indexOf(d.id)
    setAnnouncement(`${labelFor(d.id)} is now number ${at + 1} of ${count}.`)
    drag.current = null
    setDragId(null)
    setOffset(0)
  }

  /* ---------------- keyboard / AT fallback ---------------- */
  const move = (id, delta) => {
    const index = ranking.indexOf(id)
    const target = clamp(index + delta, 0, count - 1)
    if (target === index) return
    commit(reorder(ranking, index, target))
    setAnnouncement(`${labelFor(id)} moved to number ${target + 1} of ${count}.`)
  }

  const onHandleKeyDown = (e, id) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(id, e.key === 'ArrowUp' ? -1 : 1)
    }
  }

  return (
    <div className="rank-body">
      <ol className="rank-list" ref={listRef} data-dragging={dragId ? 'true' : 'false'}>
        {ranking.map((id, i) => {
          const name = labelFor(id)
          const isDragging = dragId === id
          const style = isDragging
            ? { transform: `translateY(${offset}px)`, transition: 'none' }
            : undefined
          return (
            <li
              key={id}
              data-rank-id={id}
              className="rank-row"
              data-dragging={isDragging ? 'true' : 'false'}
              {...(style ? { style } : {})}
            >
              <span
                className="rank-grip"
                role="button"
                tabIndex={0}
                aria-label={`Reorder ${name}. Currently number ${i + 1} of ${count}. Use the arrow keys, or the buttons beside it.`}
                onPointerDown={(e) => onPointerDown(e, id)}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onHandleKeyDown(e, id)}
              >
                <GripIcon />
              </span>

              <span
                className="rank-number"
                style={{ backgroundColor: RANK_COLORS[i % RANK_COLORS.length] }}
                aria-hidden="true"
              >
                {i + 1}
              </span>

              <span className="rank-name">
                {name}
                {i === 0 ? <span className="rank-tag">Most popular</span> : null}
              </span>

              <span className="rank-moves">
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => move(id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${name} up to number ${i}`}
                >
                  <ChevronUp />
                </button>
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => move(id, 1)}
                  disabled={i === count - 1}
                  aria-label={`Move ${name} down to number ${i + 2}`}
                >
                  <ChevronDown />
                </button>
              </span>
            </li>
          )
        })}
      </ol>

      <p className="rank-hint">
        Drag the handles, or use the arrows — number 1 is the most popular.
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}

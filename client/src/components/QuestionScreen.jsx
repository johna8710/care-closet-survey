import { useCallback, useEffect, useRef } from 'react'
import SelectField from './fields/SelectField.jsx'
import RadioField from './fields/RadioField.jsx'
import ChoiceListField from './fields/ChoiceListField.jsx'
import WeightField from './fields/WeightField.jsx'
import AllocateField from './fields/AllocateField.jsx'
import RankField from './fields/RankField.jsx'
import AutoTextarea from './fields/AutoTextarea.jsx'
import { AlertIcon, ArrowLeft, ArrowRight } from './icons.jsx'
import { isAnswered, validateStep } from '../lib/validate.js'
import { stepCounter } from '../lib/steps.js'

const AUTO_ADVANCE_MS = 300

export default function QuestionScreen({
  step,
  questionCount,
  answers,
  setAnswer,
  onNext,
  onBack,
  error,
  isLast,
  submitState,
  onRetry,
  transitionKey,
  dir
}) {
  const timer = useRef(null)
  const titleRef = useRef(null)
  const question = step.question
  const part = step.part

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    clearTimeout(timer.current)
    // Move focus to the new screen so screen readers announce it and
    // keyboard users carry on from the right place.
    if (titleRef.current) titleRef.current.focus({ preventScroll: true })
  }, [step.key])

  const autoAdvance = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onNext(), AUTO_ADVANCE_MS)
  }, [onNext])

  const cancelAuto = () => clearTimeout(timer.current)

  const value = answers[question.id]
  const blocked = Boolean(validateStep(step, answers))
  const answered = isAnswered(step, answers)
  const sending = submitState.status === 'sending'

  const nextLabel = isLast ? 'Submit' : !question.required && !answered ? 'Skip' : 'Next'

  const prompt =
    part === 'weight' ? question.weightPrompt : part === 'rank' ? question.rankPrompt : question.selectPrompt

  const handleSubmit = (e) => {
    e.preventDefault()
    cancelAuto()
    onNext()
  }

  // Enter advances from anywhere on the screen except a textarea (newline)
  // or a button (its own activation).
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey) return
    const tag = e.target.tagName
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return
    e.preventDefault()
    cancelAuto()
    onNext()
  }

  return (
    <form className="card" onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
      {/* The animated wrapper stays *inside* the card and never wraps .nav —
          a transformed ancestor would become the containing block for the
          position:fixed action bar. */}
      <div className="screen" key={transitionKey} data-dir={dir === 'back' ? 'back' : 'forward'}>
        <div className="q-head">
          <div className="q-eyebrow">
            <span className="dot" />
            <span className="meta-label">{stepCounter(step, questionCount)}</span>
            {question.required || part !== 'main' ? null : (
              <span className="meta-label">· Optional</span>
            )}
          </div>
          <h1 className="q-title" ref={titleRef} tabIndex={-1}>
            {question.title}
            {question.required && part === 'main' ? (
              <span className="req" aria-hidden="true">
                {' '}
                *
              </span>
            ) : null}
          </h1>
          {question.helper && part === 'main' ? (
            // The budget explainer is the reason this screen exists, so it is
            // set as a callout rather than fine print.
            <p className="q-helper" data-lead={question.type === 'allocate' ? 'true' : 'false'}>
              {question.helper}
            </p>
          ) : null}
          {prompt ? <p className="q-prompt">{prompt}</p> : null}
        </div>

        {part === 'weight' ? (
          <WeightField question={question} value={value} onChange={(v) => setAnswer(question.id, v)} />
        ) : null}

        {part === 'rank' ? (
          <RankField question={question} value={value} onChange={(v) => setAnswer(question.id, v)} />
        ) : null}

        {part === 'main' ? (
          <>
            {question.type === 'allocate' ? (
              <AllocateField
                question={question}
                value={value}
                onChange={(v) => setAnswer(question.id, v)}
              />
            ) : null}

            {question.type === 'select' ? (
              <SelectField
                question={question}
                value={value}
                onChange={(v) => setAnswer(question.id, v)}
                onAutoAdvance={autoAdvance}
              />
            ) : null}

            {question.type === 'radio' ? (
              <RadioField
                question={question}
                value={value}
                onChange={(v) => setAnswer(question.id, v)}
                onAutoAdvance={autoAdvance}
                followUpValue={question.followUp ? answers[question.followUp.id] : ''}
                onFollowUpChange={(v) => setAnswer(question.followUp.id, v)}
              />
            ) : null}

            {question.type === 'select-weight' ||
            question.type === 'select-rank' ||
            question.type === 'multi-select' ? (
              <ChoiceListField
                question={question}
                value={value}
                onChange={(v) => setAnswer(question.id, v)}
              />
            ) : null}

            {question.type === 'text' ? (
              <>
                <label className="sr-only" htmlFor={`q-${question.id}`}>
                  {question.title}
                </label>
                <input
                  id={`q-${question.id}`}
                  type="text"
                  className="input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder="Type your answer"
                  autoComplete="off"
                  onChange={(e) => setAnswer(question.id, e.target.value)}
                />
              </>
            ) : null}

            {question.type === 'textarea' ? (
              <>
                <label className="sr-only" htmlFor={`q-${question.id}`}>
                  {question.title}
                </label>
                <AutoTextarea
                  id={`q-${question.id}`}
                  value={typeof value === 'string' ? value : ''}
                  placeholder="Share as much or as little as you like"
                  onChange={(e) => setAnswer(question.id, e.target.value)}
                />
              </>
            ) : null}
          </>
        ) : null}

        <div role="alert">
          {error ? (
            <p className="field-error">
              <AlertIcon className="mark" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>

        {submitState.status === 'error' ? (
          <div className="retry">
            <h2>We couldn’t send that just yet</h2>
            <p>
              Your answers are safe — nothing was lost. Check your connection and try again, and if it
              keeps happening, leave this tab open and let us know.
            </p>
            {submitState.message ? <p className="detail">{submitState.message}</p> : null}
            <div className="retry-actions">
              <button type="button" className="btn btn-primary" onClick={onRetry} disabled={sending}>
                {sending ? <span className="spinner" /> : null}
                {sending ? 'Sending…' : 'Try again'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="nav">
        <button type="button" className="btn btn-ghost btn-back" onClick={() => { cancelAuto(); onBack() }}>
          <ArrowLeft className="arrow" />
          <span>Back</span>
        </button>
        <span className="nav-spacer" />
        <button
          type="submit"
          className="btn btn-primary btn-next"
          data-blocked={blocked ? 'true' : 'false'}
          disabled={sending}
        >
          {sending ? <span className="spinner" /> : null}
          <span>{sending ? 'Sending…' : nextLabel}</span>
          {!sending ? <ArrowRight className="arrow" /> : null}
        </button>
      </div>
    </form>
  )
}

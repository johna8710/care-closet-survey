import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import survey from '@shared/survey.json'
import ProgressHeader from './components/ProgressHeader.jsx'
import WelcomeScreen from './components/WelcomeScreen.jsx'
import QuestionScreen from './components/QuestionScreen.jsx'
import ThankYouScreen from './components/ThankYouScreen.jsx'
import { buildAnswers } from './lib/answers.js'
import { buildSteps, stepCounter } from './lib/steps.js'
import { validateStep } from './lib/validate.js'
import { clearSaved, hasProgress, loadSaved, saveState } from './lib/storage.js'

const QUESTIONS = survey.questions
const TOTAL_QUESTIONS = QUESTIONS.length

export default function App() {
  const [phase, setPhase] = useState('welcome') // welcome | question | thanks
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [startedAt, setStartedAt] = useState(null)
  const [dir, setDir] = useState('forward')
  const [error, setError] = useState(null)
  const [resume, setResume] = useState(null)
  const [submitState, setSubmitState] = useState({ status: 'idle', message: null })
  const [tick, setTick] = useState(0) // forces the transition to replay

  const mainRef = useRef(null)
  const answersRef = useRef(answers)
  answersRef.current = answers

  // Screens, not questions: the weighting / ranking halves are their own steps
  // and appear only once something is selected (see lib/steps.js).
  const steps = useMemo(() => buildSteps(QUESTIONS, answers), [answers])
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const total = steps.length
  const safeIndex = Math.min(index, total - 1)
  const step = steps[safeIndex]

  // The saved index points at a *screen*; show the respondent a question number.
  const resumeInfo = useMemo(() => {
    if (!resume) return null
    const savedSteps = buildSteps(QUESTIONS, resume.answers || {})
    const at = savedSteps[Math.min(resume.index || 0, savedSteps.length - 1)]
    return { ...resume, questionNumber: at ? at.number : 1 }
  }, [resume])

  /* ---------------- restore ---------------- */
  useEffect(() => {
    const saved = loadSaved(survey.surveyId)
    if (hasProgress(saved)) setResume(saved)
  }, [])

  /* ---------------- autosave ---------------- */
  useEffect(() => {
    if (phase !== 'question') return
    saveState(survey.surveyId, { index: safeIndex, answers, startedAt })
  }, [phase, safeIndex, answers, startedAt])

  /* ---------------- screen changes ---------------- */
  useEffect(() => {
    if (mainRef.current) window.scrollTo({ top: 0, behavior: 'auto' })
  }, [phase, safeIndex])

  const setAnswer = useCallback((id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
    setError(null)
  }, [])

  const begin = (fresh = true) => {
    if (fresh) {
      clearSaved()
      setAnswers({})
      setIndex(0)
    }
    setStartedAt((s) => s || new Date().toISOString())
    setDir('forward')
    setPhase('question')
    setResume(null)
    setTick((t) => t + 1)
  }

  const doResume = () => {
    if (!resume) return begin(true)
    const restored = resume.answers || {}
    const restoredSteps = buildSteps(QUESTIONS, restored)
    setAnswers(restored)
    setIndex(Math.min(resume.index || 0, restoredSteps.length - 1))
    setStartedAt(resume.startedAt || new Date().toISOString())
    setDir('forward')
    setPhase('question')
    setResume(null)
    setTick((t) => t + 1)
  }

  const startOver = () => {
    clearSaved()
    setResume(null)
    setAnswers({})
    setIndex(0)
    setStartedAt(null)
  }

  /* ---------------- submit ---------------- */
  const submit = useCallback(
    async (finalAnswers) => {
      setSubmitState({ status: 'sending', message: null })
      const payload = {
        surveyId: survey.surveyId,
        answers: buildAnswers(QUESTIONS, finalAnswers),
        meta: {
          startedAt: startedAt || new Date().toISOString(),
          completedAt: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
        }
      }
      try {
        const res = await fetch('/api/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          let message = `The server replied with ${res.status}.`
          try {
            const body = await res.json()
            if (body && (body.error || body.message)) message = body.error || body.message
          } catch {
            /* non-JSON error body — keep the status message */
          }
          setSubmitState({ status: 'error', message })
          return
        }
        clearSaved()
        setSubmitState({ status: 'done', message: null })
        setDir('forward')
        setPhase('thanks')
        setTick((t) => t + 1)
      } catch (err) {
        setSubmitState({
          status: 'error',
          message: err && err.message ? `Network error: ${err.message}` : 'Network error.'
        })
      }
    },
    [startedAt]
  )

  const goNext = useCallback(() => {
    const list = stepsRef.current
    const at = Math.min(index, list.length - 1)
    const current = list[at]
    const msg = validateStep(current, answersRef.current)
    if (msg) {
      setError(msg)
      return
    }
    setError(null)
    // The step list can grow (a selection just revealed a Part 2 screen), so
    // recompute it from the answers we are moving on with.
    const nextList = buildSteps(QUESTIONS, answersRef.current)
    if (at >= nextList.length - 1) {
      submit(answersRef.current)
      return
    }
    setDir('forward')
    setIndex(at + 1)
    setTick((t) => t + 1)
  }, [index, submit])

  const goBack = useCallback(() => {
    setError(null)
    setSubmitState({ status: 'idle', message: null })
    setDir('back')
    setTick((t) => t + 1)
    if (safeIndex === 0) {
      setPhase('welcome')
      return
    }
    setIndex(safeIndex - 1)
  }, [safeIndex])

  const percent = useMemo(() => {
    if (phase === 'welcome') return 0
    if (phase === 'thanks') return 100
    return Math.round(((safeIndex + 1) / (total + 1)) * 100)
  }, [phase, safeIndex, total])

  const counter = phase === 'question' ? stepCounter(step, TOTAL_QUESTIONS) : null

  return (
    <div className="app">
      <ProgressHeader organization={survey.organization} percent={percent} counter={counter} />

      <main className="app-main" ref={mainRef}>
        {phase === 'welcome' ? (
          <div className="screen" data-dir={dir === 'back' ? 'back' : 'forward'} key={`welcome-${tick}`}>
            <WelcomeScreen
              survey={survey}
              questionCount={TOTAL_QUESTIONS}
              resume={resumeInfo}
              onBegin={() => begin(true)}
              onResume={doResume}
              onStartOver={startOver}
            />
          </div>
        ) : null}

        {phase === 'question' && step ? (
          <QuestionScreen
            step={step}
            questionCount={TOTAL_QUESTIONS}
            answers={answers}
            setAnswer={setAnswer}
            onNext={goNext}
            onBack={goBack}
            error={error}
            isLast={safeIndex === total - 1}
            submitState={submitState}
            onRetry={() => submit(answersRef.current)}
            transitionKey={`${step.key}-${tick}`}
            dir={dir}
          />
        ) : null}

        {phase === 'thanks' ? (
          <div className="screen" key={`thanks-${tick}`}>
            <ThankYouScreen thankYou={survey.thankYou} organization={survey.organization} />
          </div>
        ) : null}
      </main>

      <footer className="app-footer">
        <p>
          {survey.organization} · <span className="tagline">Lunch is on us!</span>
        </p>
      </footer>
    </div>
  )
}

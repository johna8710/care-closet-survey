import TomatoMark from './TomatoMark.jsx'
import { ArrowRight, ClockIcon, ListIcon, SaveIcon } from './icons.jsx'
import { savedAgo } from '../lib/storage.js'

export default function WelcomeScreen({ survey, questionCount, resume, onBegin, onResume, onStartOver }) {
  return (
    <section className="card hero" aria-labelledby="welcome-title">
      {resume ? (
        <div className="resume">
          <h2>Welcome back!</h2>
          <p>
            You left off at question {Math.min(resume.questionNumber || resume.index + 1, questionCount)} of{' '}
            {questionCount}
            {resume.savedAt ? ` — saved ${savedAgo(resume.savedAt)}` : ''}. Your answers are still here.
          </p>
          <div className="resume-actions">
            <button type="button" className="btn btn-green" onClick={onResume}>
              Resume where you left off
            </button>
            <button type="button" className="btn btn-quiet" onClick={onStartOver}>
              Start over
            </button>
          </div>
        </div>
      ) : null}

      <span className="mark-wrap">
        <TomatoMark size={78} />
      </span>

      <p className="meta-label org">{survey.organization}</p>
      <h1 id="welcome-title">{survey.title}</h1>
      <p className="intro">{survey.intro}</p>

      <div className="chips">
        <span className="chip">
          <ClockIcon />
          About {survey.estimatedMinutes} minutes
        </span>
        <span className="chip">
          <ListIcon />
          {questionCount} questions
        </span>
        <span className="chip">
          <SaveIcon />
          Saves as you go
        </span>
      </div>

      <div className="hero-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={onBegin}>
          Begin the survey
          <ArrowRight className="arrow" />
        </button>
      </div>
    </section>
  )
}

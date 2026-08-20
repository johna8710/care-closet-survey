import TomatoMark from './TomatoMark.jsx'

export default function ProgressHeader({ organization, percent, counter }) {
  return (
    <header className="app-header">
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Survey progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={counter || `${Math.round(percent)}% complete`}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="header-bar">
        <span className="brand">
          <TomatoMark size={26} title="" />
          <span className="brand-name">{organization}</span>
        </span>
        {counter ? <span className="meta-label">{counter}</span> : null}
      </div>
    </header>
  )
}

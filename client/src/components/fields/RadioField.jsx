import ChoiceCard from './ChoiceCard.jsx'
import AutoTextarea from './AutoTextarea.jsx'

/** Radio list, with an optional conditional follow-up revealed underneath. */
export default function RadioField({
  question,
  value,
  onChange,
  onAutoAdvance,
  followUpValue,
  onFollowUpChange
}) {
  const followUp = question.followUp
  const showFollowUp = Boolean(followUp && value && followUp.showWhen.includes(value))

  const pick = (id) => {
    onChange(id)
    const opensFollowUp = Boolean(followUp && followUp.showWhen.includes(id))
    if (!opensFollowUp && onAutoAdvance) onAutoAdvance()
  }

  return (
    <>
      <fieldset>
        <legend className="sr-only">{question.title}</legend>
        <div className="choices">
          {question.options.map((opt) => (
            <ChoiceCard
              key={opt.id}
              shape="radio"
              name={question.id}
              value={opt.id}
              checked={value === opt.id}
              label={opt.label}
              sublabel={opt.sublabel}
              onChange={() => pick(opt.id)}
            />
          ))}
        </div>
      </fieldset>

      {followUp ? (
        <div className="followup" data-open={showFollowUp ? 'true' : 'false'}>
          <div className="followup-inner">
            <div className="pad">
              <label className="field-label" htmlFor={`fu-${followUp.id}`}>
                {followUp.title}
              </label>
              <AutoTextarea
                id={`fu-${followUp.id}`}
                value={followUpValue || ''}
                placeholder="Name, email, phone — whatever you have"
                minHeight={92}
                onChange={(e) => onFollowUpChange(e.target.value)}
                tabIndex={showFollowUp ? 0 : -1}
                aria-hidden={showFollowUp ? undefined : 'true'}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

import { CheckIcon, DotIcon } from '../icons.jsx'

/**
 * A single tappable choice card. `shape` is "radio" (single select) or
 * "check" (multi select); the whole card is the label, so the touch target
 * is the full row.
 */
export default function ChoiceCard({
  shape = 'radio',
  name,
  value,
  checked,
  disabled = false,
  isNone = false,
  label,
  sublabel,
  onChange,
  children
}) {
  return (
    <label
      className="choice"
      data-shape={shape}
      data-selected={checked ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      data-none={isNone ? 'true' : 'false'}
    >
      <input
        type={shape === 'radio' ? 'radio' : 'checkbox'}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="box" aria-hidden="true">
        {shape === 'radio' ? <DotIcon /> : <CheckIcon />}
      </span>
      <span className="label">
        {label}
        {sublabel ? <span className="sublabel">{sublabel}</span> : null}
        {children}
      </span>
    </label>
  )
}

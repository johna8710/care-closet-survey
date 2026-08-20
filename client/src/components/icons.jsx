const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false'
}

export const CheckIcon = (props) => (
  <svg {...base} {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

export const DotIcon = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
    <circle cx="12" cy="12" r="6" fill="currentColor" />
  </svg>
)

export const ArrowRight = (props) => (
  <svg {...base} {...props}>
    <path d="M4 12h15m0 0-6-6m6 6-6 6" />
  </svg>
)

export const ArrowLeft = (props) => (
  <svg {...base} {...props}>
    <path d="M20 12H5m0 0 6-6m-6 6 6 6" />
  </svg>
)

export const ClockIcon = (props) => (
  <svg {...base} strokeWidth={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

export const ListIcon = (props) => (
  <svg {...base} strokeWidth={2} {...props}>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
)

export const SaveIcon = (props) => (
  <svg {...base} strokeWidth={2} {...props}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4h-4" />
  </svg>
)

export const AlertIcon = (props) => (
  <svg {...base} strokeWidth={2.2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.2h.01" />
  </svg>
)

export const ScalesIcon = (props) => (
  <svg {...base} strokeWidth={2} {...props}>
    <path d="M12 4v16M7 20h10M4 9h16M4 9l-2 5a3 3 0 0 0 6 0L6 9M20 9l-2 5a3 3 0 0 0 6 0l-2-5" />
  </svg>
)

export const MinusIcon = (props) => (
  <svg {...base} strokeWidth={3} {...props}>
    <path d="M6 12h12" />
  </svg>
)

export const PlusIcon = (props) => (
  <svg {...base} strokeWidth={3} {...props}>
    <path d="M12 6v12M6 12h12" />
  </svg>
)

export const HeartIcon = (props) => (
  <svg {...base} strokeWidth={2} {...props}>
    <path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9Z" />
  </svg>
)

export const GripIcon = (props) => (
  <svg {...base} strokeWidth={2} {...props}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={3} />
  </svg>
)

export const ChevronUp = (props) => (
  <svg {...base} strokeWidth={2.6} {...props}>
    <path d="m6 15 6-6 6 6" />
  </svg>
)

export const ChevronDown = (props) => (
  <svg {...base} strokeWidth={2.6} {...props}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

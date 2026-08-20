import { useLayoutEffect, useRef } from 'react'

/** Textarea that grows with its content instead of showing a scrollbar. */
export default function AutoTextarea({ value, minHeight = 118, className = 'textarea', ...rest }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`
  }, [value, minHeight])

  return <textarea ref={ref} className={className} value={value} rows={3} {...rest} />
}

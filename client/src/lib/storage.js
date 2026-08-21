/* Bump on every change to the step model or answer shapes: a session saved by
   an older build must never resume into a screen that no longer means the same
   thing. v3 = conditional questions + the budget allocation screen. */
const KEY = 'lk-care-closet-survey-v3'

function available() {
  try {
    const k = '__lk_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

const ok = typeof window !== 'undefined' && available()

/* Sessions from older step models can't be migrated safely — clear them out
   rather than leaving dead keys behind. */
const LEGACY_KEYS = ['lk-care-closet-survey', 'lk-care-closet-survey-v2']
if (ok) {
  LEGACY_KEYS.forEach((key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  })
}

export function loadSaved(surveyId) {
  if (!ok) return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || data.surveyId !== surveyId || typeof data.answers !== 'object') return null
    return {
      index: Number.isInteger(data.index) ? data.index : 0,
      answers: data.answers || {},
      startedAt: data.startedAt || null,
      savedAt: data.savedAt || null
    }
  } catch {
    return null
  }
}

export function saveState(surveyId, state) {
  if (!ok) return
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        surveyId,
        index: state.index,
        answers: state.answers,
        startedAt: state.startedAt,
        savedAt: new Date().toISOString()
      })
    )
  } catch {
    /* quota or private mode — autosave is a nicety, never a blocker */
  }
}

export function clearSaved() {
  if (!ok) return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function hasProgress(saved) {
  if (!saved) return false
  return saved.index > 0 || Object.keys(saved.answers || {}).length > 0
}

export function savedAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const PREFIX = 'skw-keuangan:'

// sessionStorage (not localStorage) so login state clears automatically once the tab/browser
// is fully closed — surviving only a page refresh, not a new browser session. This is a
// deliberate security choice (see AppContext's isLoggedIn), not an oversight.

export function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveState<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // ignore quota / serialization errors in this mock app
  }
}

export function clearState(key: string): void {
  sessionStorage.removeItem(PREFIX + key)
}

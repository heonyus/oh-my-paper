/**
 * What this window alone is looking at: the paper open in it and its row of paper tabs. The
 * workspace is shared by every window, so these are kept beside it, in the window's own session
 * storage. The tabs are also left in local storage, where a new window starts from them.
 */
const DOCUMENT_KEY = "ohmypaper.windowDocument"
const TABS_KEY = "ohmypaper.readerTabs"

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    // Storage can be switched off; the window then simply starts from the workspace.
    return null
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    // Nothing to keep it in; the view is rebuilt from the workspace next time.
  }
}

export function windowDocument(): string | null {
  return read(() => window.sessionStorage, DOCUMENT_KEY)
}

export function rememberWindowDocument(id: string | null): void {
  write(() => window.sessionStorage, DOCUMENT_KEY, id)
}

function parseTabs(value: string | null): readonly string[] | null {
  if (value === null) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : null
  } catch {
    return null
  }
}

export function windowTabs(): readonly string[] {
  return (
    parseTabs(read(() => window.sessionStorage, TABS_KEY)) ??
    parseTabs(read(() => window.localStorage, TABS_KEY)) ??
    []
  )
}

export function rememberWindowTabs(ids: readonly string[]): void {
  const value = JSON.stringify(ids)
  write(() => window.sessionStorage, TABS_KEY, value)
  write(() => window.localStorage, TABS_KEY, value)
}

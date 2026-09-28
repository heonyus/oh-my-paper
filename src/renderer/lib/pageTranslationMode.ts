import { useEffect, useState } from "react"

/** `layout` sets each translation where its source paragraph sits on the page. */
export type PageTranslationMode = "layout" | "source" | "parallel" | "bilingual"

const defaultMode: PageTranslationMode = "layout"
const storagePrefix = "ohmypaper:page-translation-mode:v1:"

function isPageTranslationMode(value: string | null): value is PageTranslationMode {
  return value === "layout" || value === "source" || value === "parallel" || value === "bilingual"
}

export function pageTranslationModeKey(documentId: string): string {
  return `${storagePrefix}${documentId}`
}

export function readPageTranslationMode(documentId: string): PageTranslationMode {
  try {
    const value = globalThis.localStorage.getItem(pageTranslationModeKey(documentId))
    return isPageTranslationMode(value) ? value : defaultMode
  } catch (error) {
    if (error instanceof Error) return defaultMode
    throw error
  }
}

export function writePageTranslationMode(documentId: string, mode: PageTranslationMode): void {
  try {
    globalThis.localStorage.setItem(pageTranslationModeKey(documentId), mode)
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}

export function usePageTranslationMode(
  documentId: string,
): readonly [PageTranslationMode, (mode: PageTranslationMode) => void] {
  const [mode, setMode] = useState<PageTranslationMode>(() => readPageTranslationMode(documentId))
  useEffect(() => {
    setMode(readPageTranslationMode(documentId))
  }, [documentId])
  const update = (next: PageTranslationMode): void => {
    setMode(next)
    writePageTranslationMode(documentId, next)
  }
  return [mode, update]
}

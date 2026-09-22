import { useEffect, useState } from "react"

export type PageTranslationMode = "source" | "parallel" | "bilingual"

const defaultMode: PageTranslationMode = "bilingual"
const storagePrefix = "ohmypaper:page-translation-mode:v1:"

function isPageTranslationMode(value: string | null): value is PageTranslationMode {
  return value === "source" || value === "parallel" || value === "bilingual"
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

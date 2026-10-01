import { useSyncExternalStore } from "react"
import type { DocumentId } from "../types"

type PageTranslationSession = {
  readonly auto: boolean
  readonly documentId: DocumentId | null
  readonly openPages: readonly number[]
}

let session: PageTranslationSession = { auto: false, documentId: null, openPages: [] }
const listeners = new Set<() => void>()

const STORAGE_PREFIX = "ohmypaper:page-translation:"

/**
 * The pages a paper had its translation open on, as the reader left them. Automatic translation
 * is not kept: consent to it lasts only while the paper stays open.
 */
function storedSession(documentId: DocumentId): PageTranslationSession {
  try {
    const raw: unknown = JSON.parse(
      window.localStorage.getItem(`${STORAGE_PREFIX}${documentId}`) ?? "null",
    )
    if (typeof raw !== "object" || raw === null) throw new Error("none")
    const pages: unknown = Reflect.get(raw, "openPages")
    return {
      documentId,
      auto: false,
      openPages: Array.isArray(pages)
        ? pages.filter((page): page is number => Number.isInteger(page) && page > 0)
        : [],
    }
  } catch {
    return { auto: false, documentId, openPages: [] }
  }
}

function storeSession(next: PageTranslationSession): void {
  if (!next.documentId) return
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${next.documentId}`,
      JSON.stringify({ openPages: next.openPages }),
    )
  } catch {
    // Without storage the pages reopen closed; their translations are still cached.
  }
}

function publish(next: PageTranslationSession): void {
  session = next
  storeSession(next)
  for (const listener of listeners) listener()
}

export function usePageTranslationSession(): PageTranslationSession {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => session,
  )
}

export function setPageTranslationDocument(documentId: DocumentId): void {
  if (session.documentId === documentId) return
  // A paper reopens with the translations it had open, from their cache.
  session = storedSession(documentId)
  for (const listener of listeners) listener()
}

export function toggleAutomaticPageTranslation(): void {
  publish({ ...session, auto: !session.auto })
}

export function openPageTranslation(page: number): void {
  if (session.openPages.includes(page)) return
  publish({
    ...session,
    openPages: [...session.openPages, page].sort((left, right) => left - right),
  })
}

export function closePageTranslation(page: number): void {
  publish({ ...session, openPages: session.openPages.filter((candidate) => candidate !== page) })
}

export function togglePageTranslation(page: number): void {
  if (session.openPages.includes(page)) closePageTranslation(page)
  else openPageTranslation(page)
}

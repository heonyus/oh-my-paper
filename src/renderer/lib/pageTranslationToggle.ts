import { useSyncExternalStore } from "react"
import { aiPolicy } from "../../shared/documentAiJobs"
import type { DocumentId } from "../types"

type PageTranslationSession = {
  readonly auto: boolean
  readonly documentId: DocumentId | null
  readonly openPages: readonly number[]
}

let session: PageTranslationSession = { auto: false, documentId: null, openPages: [] }
const listeners = new Set<() => void>()

function publish(next: PageTranslationSession): void {
  session = next
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
  publish({ auto: false, documentId, openPages: [] })
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

export function openAutomaticPageTranslation(page: number): void {
  if (session.openPages.includes(page)) return
  const retainCount = Math.min(Math.max(0, aiPolicy.concurrentTextJobs - 1), 2)
  const retained = retainCount === 0 ? [] : session.openPages.slice(-retainCount)
  publish({
    ...session,
    openPages: [...retained, page].sort((left, right) => left - right),
  })
}

export function closePageTranslation(page: number): void {
  publish({ ...session, openPages: session.openPages.filter((candidate) => candidate !== page) })
}

export function togglePageTranslation(page: number): void {
  if (session.openPages.includes(page)) closePageTranslation(page)
  else openPageTranslation(page)
}

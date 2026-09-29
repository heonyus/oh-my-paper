import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  closePageTranslation,
  openPageTranslation,
  setPageTranslationDocument,
  toggleAutomaticPageTranslation,
  usePageTranslationSession,
} from "../../src/renderer/lib/pageTranslationToggle"
import { documentIdSchema } from "../../src/shared/schemas"

const firstDocument = documentIdSchema.parse("1111111111111111")
const secondDocument = documentIdSchema.parse("2222222222222222")
const cleanupDocument = documentIdSchema.parse("3333333333333333")

describe("page translation session", () => {
  it("resets automatic consent for a new document but keeps it within one document", () => {
    const { result, unmount } = renderHook(() => usePageTranslationSession())
    act(() => {
      setPageTranslationDocument(firstDocument)
      toggleAutomaticPageTranslation()
      openPageTranslation(1)
    })
    expect(result.current).toMatchObject({ auto: true, documentId: firstDocument, openPages: [1] })

    act(() => setPageTranslationDocument(secondDocument))
    expect(result.current).toMatchObject({ auto: false, documentId: secondDocument, openPages: [] })

    act(() => {
      toggleAutomaticPageTranslation()
      openPageTranslation(2)
    })
    expect(result.current).toMatchObject({ auto: true, documentId: secondDocument, openPages: [2] })
    unmount()
    act(() => setPageTranslationDocument(cleanupDocument))
  })

  it("keeps every opened pane until it is closed", () => {
    const { result, unmount } = renderHook(() => usePageTranslationSession())
    act(() => {
      setPageTranslationDocument(firstDocument)
      for (const page of [3, 1, 5, 2, 4]) openPageTranslation(page)
    })
    expect(result.current.openPages).toEqual([1, 2, 3, 4, 5])
    act(() => closePageTranslation(3))
    expect(result.current.openPages).toEqual([1, 2, 4, 5])
    unmount()
    act(() => setPageTranslationDocument(cleanupDocument))
  })
})

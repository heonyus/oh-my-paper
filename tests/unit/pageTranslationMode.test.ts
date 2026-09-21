import {
  pageTranslationModeKey,
  readPageTranslationMode,
  writePageTranslationMode,
} from "../../src/renderer/lib/pageTranslationMode"

describe("page translation reading mode", () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("keeps a document mode across a later reader mount", () => {
    const documentId = "aabbccddeeff0011"

    expect(readPageTranslationMode(documentId)).toBe("bilingual")
    writePageTranslationMode(documentId, "parallel")

    expect(localStorage.getItem(pageTranslationModeKey(documentId))).toBe("parallel")
    expect(readPageTranslationMode(documentId)).toBe("parallel")
  })

  it("falls back when stored mode is not a supported renderer", () => {
    localStorage.setItem(pageTranslationModeKey("1122334455667788"), "unknown")

    expect(readPageTranslationMode("1122334455667788")).toBe("bilingual")
  })
})

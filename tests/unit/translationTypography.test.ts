import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isBoldFont, isItalicFont, isSerifFont } from "../../src/renderer/lib/pdfPageTextRuns"
import { readTranslationFont, writeTranslationFont } from "../../src/renderer/lib/translationFont"

describe("PDF font weight", () => {
  it("reads weight from PDF.js flags and from the font's name", () => {
    expect(isBoldFont({ name: "MinionPro-Bold" })).toBe(true)
    expect(isBoldFont({ name: "Whitney-Semibold" })).toBe(true)
    expect(isBoldFont({ name: "NimbusRomNo9L-Medi", bold: true })).toBe(true)
    expect(isBoldFont({ name: "MinionPro-Regular" })).toBe(false)
    expect(isBoldFont({ name: "MinionPro-It" })).toBe(false)
    expect(isBoldFont({ name: "BoldonseSans-Regular" })).toBe(false)
    expect(isBoldFont(null)).toBe(false)
  })

  it("knows LaTeX's and URW's bold faces by name", () => {
    expect(isBoldFont({ name: "YXKVYW+CMBX10" })).toBe(true)
    expect(isBoldFont({ name: "NimbusRomNo9L-Medi" })).toBe(true)
    expect(isBoldFont({ name: "TDGUXT+CMR10" })).toBe(false)
    expect(isBoldFont({ name: "Roboto-Medium" })).toBe(false)
  })
})

describe("PDF font face", () => {
  it("takes serif from the font's name before PDF.js's fallback family", () => {
    expect(isSerifFont({ name: "TDGUXT+CMR10", fallbackName: "sans-serif" })).toBe(true)
    expect(isSerifFont({ name: "GZLLDV+SFRM0800", fallbackName: "sans-serif" })).toBe(true)
    expect(isSerifFont({ name: "ABCDEF+CMSS10", fallbackName: "serif" })).toBe(false)
    expect(isSerifFont({ name: "Unknown", fallbackName: "serif" })).toBe(true)
    expect(isSerifFont(null, "sans-serif")).toBe(false)
  })

  it("reads italic from the name as LaTeX and Adobe fonts give it", () => {
    expect(isItalicFont({ name: "ALQQGE+CMTI10" })).toBe(true)
    expect(isItalicFont({ name: "Times-Italic" })).toBe(true)
    expect(isItalicFont({ name: "MinionPro-It" })).toBe(true)
    expect(isItalicFont({ name: "CMMI10" })).toBe(false)
    expect(isItalicFont({ name: "TDGUXT+CMR10" })).toBe(false)
  })
})

describe("translation typeface setting", () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("follows the source by default and remembers a choice", () => {
    const changed = vi.fn()
    window.addEventListener("ohmypaper:translation-font", changed)

    expect(readTranslationFont()).toBe("auto")
    writeTranslationFont("serif")

    expect(readTranslationFont()).toBe("serif")
    expect(changed).toHaveBeenCalledOnce()
    window.removeEventListener("ohmypaper:translation-font", changed)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isBoldFont } from "../../src/renderer/lib/pdfPageTextRuns"
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

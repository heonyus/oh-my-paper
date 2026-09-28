import { describe, expect, it } from "vitest"
import { pageTranslationWorldPlacement } from "../../src/renderer/lib/usePageTranslationPlacement"

describe("page translation board placement", () => {
  it("places translation beside the PDF in board coordinates", () => {
    const placement = pageTranslationWorldPlacement(
      { left: 320, top: 180, width: 600, height: 900 },
      { left: 20, top: 30, width: 7_200, height: 9_600 },
      4_800,
    )

    expect(placement).toEqual({ left: 616, top: 100, width: 640, height: 600, pageWidth: 400 })
  })
})

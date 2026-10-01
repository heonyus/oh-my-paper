import { describe, expect, it } from "vitest"
import { cutInProportion } from "../../src/renderer/lib/pageTranslationCut"

describe("cutting a translation in proportion", () => {
  it("cuts at the space nearest each share", () => {
    expect(cutInProportion("하나 둘 셋 넷 다섯 여섯", [1, 1])).toEqual([
      "하나 둘 셋",
      "넷 다섯 여섯",
    ])
    expect(cutInProportion("하나 둘 셋 넷 다섯 여섯", [1, 1, 1])).toEqual([
      "하나 둘",
      "셋 넷",
      "다섯 여섯",
    ])
  })

  it("never cuts inside a gloss or a link", () => {
    expect(cutInProportion("거리 기록(history of distances) 방법이다", [1, 1])).toEqual([
      "거리 기록(history of distances)",
      "방법이다",
    ])
    expect(cutInProportion("앞 문장 [Smith et al.](#ref-1) 뒤", [1, 1])).toEqual([
      "앞 문장",
      "[Smith et al.](#ref-1) 뒤",
    ])
  })

  it("gives up when some part would be left empty", () => {
    expect(cutInProportion("띄어쓰기없는번역", [1, 1])).toBeNull()
    expect(cutInProportion("두 낱말", [1, 1, 1])).toBeNull()
    expect(cutInProportion("하나 둘", [1])).toBeNull()
  })
})

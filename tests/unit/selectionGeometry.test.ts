import { describe, expect, it } from "vitest"
import { rectsToElementSpace } from "../../src/renderer/lib/selectionGeometry"

describe("selection geometry", () => {
  it("uses the rendered world bounds when React viewport state is stale", () => {
    const fragments = rectsToElementSpace(
      [{ left: 300, top: 240, width: 106, height: 21.2 }],
      { left: -150, top: -80, width: 5_088, height: 6_784 },
      { width: 4_800, height: 6_400 },
    )
    const fragment = fragments[0]

    expect(fragment?.x).toBeCloseTo(424.5283)
    expect(fragment?.y).toBeCloseTo(301.8868)
    expect(fragment?.width).toBeCloseTo(100)
    expect(fragment?.height).toBeCloseTo(20)
  })
})

import { describe, expect, it } from "vitest"
import { structureAiRequest } from "../../src/renderer/lib/structureAiRequest"

describe("structure AI request", () => {
  it("sends figure image, paper overview, current section, and caption together", () => {
    const request = structureAiRequest(
      {
        id: "figure:1",
        kind: "figure",
        page: 2,
        title: "Figure 1",
        quote: "Figure 1: Overall leaderboard evaluation.",
        bounds: { x: 100, y: 200, width: 500, height: 300 },
      },
      "data:image/png;base64,aG90ZWJvb2s=",
      { paper: "cached paper overview", section: "nearby results section and full caption" },
    )

    expect(request).toMatchObject({
      action: "figure",
      imageDataUrl: "data:image/png;base64,aG90ZWJvb2s=",
      paperContext: "cached paper overview",
      sectionContext: "nearby results section and full caption",
      quote: "Figure 1: Overall leaderboard evaluation.",
    })
  })
})

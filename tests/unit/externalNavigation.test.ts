import { describe, expect, it } from "vitest"
import { externalHttpsUrl } from "../../src/electron/externalNavigation"

describe("external navigation", () => {
  it("allows HTTPS browser destinations and rejects local or insecure navigation", () => {
    expect(externalHttpsUrl("https://openreview.net/forum?id=lpFFpTbi9s")).toBe(
      "https://openreview.net/forum?id=lpFFpTbi9s",
    )
    expect(externalHttpsUrl("file:///Applications/oh-my-paper.app/index.html#page=3")).toBeNull()
    expect(externalHttpsUrl("http://example.com")).toBeNull()
  })
})

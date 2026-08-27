import { describe, expect, it, vi } from "vitest"
import { copyFeature, equationToLatex } from "../../src/renderer/lib/featureCopy"
import type { DetectedStructure } from "../../src/renderer/lib/structureDetector"

describe("feature copy", () => {
  it("copies a best-effort LaTeX representation without any provider request", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const equation: DetectedStructure = {
      id: "equation-1",
      kind: "equation",
      page: 3,
      title: "Equation (1) 해설",
      quote: "S_t = (R_t + P_t + C_t) / 6",
      bounds: { x: 120, y: 160, width: 200, height: 18 },
    }

    await copyFeature(document.body, equation)

    expect(writeText).toHaveBeenCalledWith("S_t = (R_t + P_t + C_t) / 6")
  })

  it("maps common PDF math symbols to LaTeX commands", () => {
    expect(equationToLatex("aᵢ ∼ π θ (aᵢ | Hᵢ₋₁, X) ≥ 0")).toBe(
      "a_i \\sim \\pi \\theta (a_i | H_{i-1}, X) \\ge 0",
    )
  })

  it("recovers common spaced PDF subscripts", () => {
    expect(equationToLatex("a i ∼ π θ ( a i | H i − 1 , X )")).toBe(
      "a_i \\sim \\pi \\theta ( a_i | H_{i-1} , X )",
    )
  })
})

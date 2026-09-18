import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LocalAiPanel } from "../../../src/renderer/components/localAi/LocalAiPanel"

describe("LocalAiPanel", () => {
  it("does not render internal localnode markers", () => {
    render(<LocalAiPanel api={null} nodeTitle="Attention" draft="" imeComposing={false} />)

    expect(screen.queryByText("[[localnode]]")).toBeNull()
  })
})

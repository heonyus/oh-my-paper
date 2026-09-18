import { describe, expect, it } from "vitest"
import { defaultWorkspace } from "../../src/electron/workspaceStore"
import { focusWorkspaceOnCard } from "../../src/renderer/lib/researchSidebarActions"
import { focusWorldRect } from "../../src/renderer/lib/viewport"
import { boardCardSchema } from "../../src/shared/schemas"

describe("sidebar highlight navigation", () => {
  it("focuses the source fragments instead of the former floating-card position", () => {
    const workspace = defaultWorkspace()
    const highlight = boardCardSchema.parse({
      id: "2889c232-6a05-46df-bd89-9f128b49ad42",
      documentId: "aabbccddeeff0011",
      kind: "highlight",
      title: "번역 주석",
      body: "출처",
      x: 1_400,
      y: 900,
      minimized: false,
      anchor: {
        page: 1,
        quote: "source",
        x: 500,
        y: 220,
        fragments: [{ x: 420, y: 200, width: 80, height: 18 }],
      },
    })
    const available = { width: 1_000, height: 760 }

    const focused = focusWorkspaceOnCard(workspace, highlight, available)

    expect(focused.viewport).toEqual(
      focusWorldRect(workspace.viewport, available, { x: 420, y: 200, width: 80, height: 18 }),
    )
  })
})

import { describe, expect, it } from "vitest"
import { workspaceSchema } from "../../src/shared/schemas"

describe("workspace boundary", () => {
  it("rejects document paths from persisted renderer state", () => {
    // Given
    const untrusted = {
      documents: [
        {
          id: "aabbccddeeff0011",
          name: "paper.pdf",
          hash: "a".repeat(64),
          bytes: 42,
          importedAt: "2026-08-26T00:00:00.000Z",
          path: "/private/paper.pdf",
        },
      ],
      cards: [],
      sidebarOpen: true,
      viewport: { x: 0, y: 0, zoom: 0.72 },
      activeDocumentId: null,
    }

    // When
    const result = workspaceSchema.safeParse(untrusted)

    // Then
    expect(result.success).toBe(false)
  })

  it("accepts an empty local workspace", () => {
    // Given
    const workspace = {
      documents: [],
      cards: [],
      sidebarOpen: true,
      viewport: { x: 0, y: 0, zoom: 0.72 },
      activeDocumentId: null,
    }

    // When
    const result = workspaceSchema.safeParse(workspace)

    // Then
    expect(result.success).toBe(true)
  })
})

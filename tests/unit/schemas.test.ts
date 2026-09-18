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
    if (result.success) {
      expect(result.data.uiFontFamily).toBe("wanted")
      expect(result.data.uiFontScale).toBe(1)
    }
  })

  it("accepts the full UI scale range and rejects values outside it", () => {
    const base = {
      documents: [],
      cards: [],
      sidebarOpen: true,
      viewport: { x: 0, y: 0, zoom: 0.72 },
      activeDocumentId: null,
    }

    expect(workspaceSchema.parse({ ...base, uiFontScale: 0.5 }).uiFontScale).toBe(0.5)
    expect(workspaceSchema.parse({ ...base, uiFontScale: 2 }).uiFontScale).toBe(2)
    expect(workspaceSchema.safeParse({ ...base, uiFontScale: 0.45 }).success).toBe(false)
  })
})

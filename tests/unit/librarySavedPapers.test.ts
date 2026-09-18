import { fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"
import {
  LibrarySavedPapers,
  loadPaperPages,
} from "../../src/renderer/components/LibrarySavedPapers"
import { knowledgeNodeSchema } from "../../src/shared/knowledgeSchemas"
import type { NodeFilter } from "../../src/shared/knowledgeTypes"

const node = knowledgeNodeSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "paper",
  title: "Saved paper",
  body: "",
  aliases: [],
  metadata: {
    access: { fullText: { url: "https://example.test/paper.pdf" } },
    landingUrl: "https://example.test/landing",
  },
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
})

describe("saved paper pagination", () => {
  it("uses the IPC maximum page size instead of sending an oversized limit", async () => {
    const requests: NodeFilter[] = []
    const client = {
      findNodes: async (filter?: NodeFilter) => {
        if (filter) requests.push(filter)
        return [node]
      },
    }
    const result = await loadPaperPages(client)

    expect(result.nodes).toHaveLength(1)
    expect(requests[0]).toEqual({ kind: "paper", limit: 100, offset: 0 })
  })

  it("opens discovery full text before the landing page", async () => {
    const onOpenExternal = vi.fn()
    const client = { findNodes: async () => [node] }
    render(
      createElement(LibrarySavedPapers, {
        clientOps: client,
        documents: [],
        onOpenNode: undefined,
        onOpenExternal,
      }),
    )

    fireEvent.click(await screen.findByRole("button", { name: "Saved paper 원문 열기" }))
    expect(onOpenExternal).toHaveBeenCalledWith("https://example.test/paper.pdf")
  })
})

import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { NoteFragmentSource } from "../../../src/renderer/components/knowledge/NoteFragmentSource"
import { noteFragmentSchema } from "../../../src/shared/fragmentAnchors"
import { knowledgeNodeSchema } from "../../../src/shared/knowledgeSchemas"

describe("NoteFragmentSource", () => {
  it("keeps the raw source exact while hiding its bookkeeping marker from default context", async () => {
    // Given
    const marker = "<!-- scourgify:block:22222222-2222-4222-8222-222222222222 -->"
    const userCommentBefore = "<!-- keep this user note -->"
    const userCommentAfter = "<!-- keep this HTML note -->"
    const quote = "Evidence must remain linked to its source."
    const body = `${userCommentBefore}\n${marker}\n\n${quote}\n${userCommentAfter}`
    const node = knowledgeNodeSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      kind: "note",
      title: "검토 노트",
      body,
      aliases: [],
      metadata: {},
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-06T00:00:00.000Z",
    })
    const anchor = noteFragmentSchema.parse({
      id: "33333333-3333-4333-8333-333333333333",
      nodeId: node.id,
      blockId: "22222222-2222-4222-8222-222222222222",
      revision: "0".repeat(64),
      quote,
      prefix: "",
      suffix: "",
      from: body.indexOf(quote),
      to: body.indexOf(quote) + quote.length,
    })

    // When
    render(<NoteFragmentSource node={node} anchor={anchor} onClose={() => {}} />)

    // Then
    await waitFor(() =>
      expect(screen.getByText("현재 본문에서 연결 위치를 확인했습니다.")).toBeVisible(),
    )
    const context = screen.getByLabelText("연결된 구절 문맥")
    expect(context.textContent).not.toContain(marker)
    expect(context.textContent).toContain(userCommentBefore)
    expect(context.textContent).toContain(userCommentAfter)
    expect(screen.getByRole("textbox", { name: "연결된 구절의 현재 마크다운 원문" })).toHaveValue(
      body,
    )
  })
})

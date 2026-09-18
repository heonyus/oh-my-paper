import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { type JSX, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { NodeDetailRelations } from "../../src/renderer/components/knowledge/NodeDetailRelations"
import { knowledgeNodeSchema } from "../../src/shared/knowledgeSchemas"

const source = knowledgeNodeSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "concept",
  title: "근거 검증",
  body: "",
  aliases: [],
  metadata: {},
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
})

const target = knowledgeNodeSchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  kind: "question",
  title: "검색의 재현성",
  body: "",
  aliases: [],
  metadata: {},
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
})

function RelationForm(): JSX.Element {
  const [targetId, setTargetId] = useState<typeof target.id | null>(null)
  return (
    <NodeDetailRelations
      node={source}
      allNodes={[source, target]}
      relations={[]}
      evidenceByRelation={new Map()}
      onCreateRelation={vi.fn(async () => {
        throw new Error("저장 실패")
      })}
      onUpdateRelation={vi.fn(async () => {})}
      onJumpToEvidence={() => {}}
      onSelectNode={() => {}}
      newRelTargetId={targetId}
      setNewRelTargetId={setTargetId}
      newRelPredicate="relates_to"
      setNewRelPredicate={() => {}}
    />
  )
}

describe("Knowledge relation sidebar", () => {
  it("keeps the chosen target after a failed relation save", async () => {
    // Given
    render(<RelationForm />)
    const select = screen.getByRole("combobox", { name: "대상 노드 선택" })

    // When
    fireEvent.change(select, { target: { value: target.id } })
    fireEvent.click(screen.getByRole("button", { name: "연결 추가" }))

    // Then
    await waitFor(() => expect(select).toHaveValue(target.id))
  })
})

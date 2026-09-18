import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { NodeListView } from "../../src/renderer/components/knowledge/NodeListView"
import { knowledgeNodeKindSchema } from "../../src/shared/knowledgeSchemas"

it("keeps every knowledge kind reachable through a compact native filter", () => {
  // Given
  const onKindChange = vi.fn()
  render(
    <NodeListView
      nodes={[]}
      selectedId={null}
      onSelect={() => {}}
      searchQuery=""
      onSearchChange={() => {}}
      selectedKind="all"
      onKindChange={onKindChange}
      onCreate={() => {}}
      loading={false}
    />,
  )
  const filter = screen.getByRole("combobox", { name: "지식 종류 필터" })

  // When
  fireEvent.change(filter, { target: { value: "note" } })

  // Then
  expect(onKindChange).toHaveBeenCalledWith("note")
  expect(
    new Set(screen.getAllByRole("option").map((option) => option.getAttribute("value"))),
  ).toEqual(new Set(["all", ...knowledgeNodeKindSchema.options]))
})

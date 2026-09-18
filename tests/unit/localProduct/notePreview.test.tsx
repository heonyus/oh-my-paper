import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NodeEditor } from "../../../src/renderer/components/knowledge/NodeEditor"
import { WikiBody } from "../../../src/renderer/components/knowledge/WikiBody"
import { NotePreview } from "../../../src/renderer/components/notes/NotePreview"
import { knowledgeNodeSchema } from "../../../src/shared/knowledgeSchemas"

const linkedNode = knowledgeNodeSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "concept",
  title: "FlashAttention",
  body: "",
  aliases: ["Flash"],
  metadata: {},
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
})

describe("NotePreview", () => {
  it("renders rich Markdown and hides source block markers", () => {
    // Given
    const source = [
      "<!-- scourgify:block:22222222-2222-4222-8222-222222222222 -->",
      "# 제목",
      "**핵심** and $x^2$",
      "",
      "| 조건 | 값 |",
      "| --- | --- |",
      "| 언어 | 한국어 |",
    ].join("\n")

    // When
    const { container } = render(
      <WikiBody body={source} nodes={[linkedNode]} onNodeSelect={() => {}} />,
    )

    // Then
    expect(screen.getByRole("heading", { name: "제목" })).toBeVisible()
    expect(screen.getByText("핵심").tagName).toBe("STRONG")
    expect(container.querySelector(".katex")).not.toBeNull()
    expect(screen.getByRole("table")).toBeVisible()
    expect(container.textContent).not.toContain("scourgify:block")
  })

  it("keeps stable wiki links clickable", () => {
    // Given
    const onNodeSelect = vi.fn()
    render(
      <WikiBody
        body="참조 [[11111111-1111-4111-8111-111111111111|Flash]]"
        nodes={[linkedNode]}
        onNodeSelect={onNodeSelect}
      />,
    )

    // When
    fireEvent.click(screen.getByRole("button", { name: "Flash" }))

    // Then
    expect(onNodeSelect).toHaveBeenCalledWith(linkedNode.id)
  })

  it("renders only canonical collection-authorized asset URLs", () => {
    // Given
    const hash = "a".repeat(64)
    const source = [
      `![allowed](assets/${hash}.webp)`,
      "![remote](https://example.com/tracker.png)",
      "![file](file:///tmp/private.png)",
      "![app](app://assets/private.png)",
      `![traversal](assets/../${hash}.png)`,
      `![unknown](other/${hash}.png)`,
    ].join("\n")

    // When
    const { container } = render(<NotePreview source={source} nodes={[]} onNodeSelect={() => {}} />)

    // Then
    const images = container.querySelectorAll("img")
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute("src")).toBe(`scourgify-asset://local/assets/${hash}.webp`)
  })

  it("does not render raw HTML elements", () => {
    // Given / When
    const { container } = render(
      <NotePreview source={'<em data-private="yes">raw</em>'} nodes={[]} onNodeSelect={() => {}} />,
    )

    // Then
    expect(container.querySelector("em")).toBeNull()
  })
})

describe("NodeEditor assets", () => {
  it("forwards the optional asset insertion hook", async () => {
    // Given
    const onAssetInsert = vi.fn(async () => null)
    render(
      <NodeEditor
        title="제목"
        body=""
        aliases=""
        kind="note"
        metadata={{}}
        dirty={false}
        nodes={[]}
        saving={false}
        error={null}
        onTitleChange={() => {}}
        onBodyChange={() => {}}
        onAliasesChange={() => {}}
        onSave={() => {}}
        onAssetInsert={onAssetInsert}
      />,
    )

    // When
    fireEvent.click(screen.getByText("삽입 도구"))
    fireEvent.click(screen.getByRole("button", { name: "이미지" }))

    // Then
    await waitFor(() => expect(onAssetInsert).toHaveBeenCalledWith({ kind: "pick" }))
  })
})

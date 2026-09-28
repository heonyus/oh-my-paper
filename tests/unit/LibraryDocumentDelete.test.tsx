import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { LibraryDocumentDetail } from "../../src/renderer/components/LibraryDocumentDetail"
import { type DocumentRecord, documentRecordSchema } from "../../src/shared/schemas"

const paper = documentRecordSchema.parse({
  id: "aaaaaaaaaaaaaaaa",
  name: "paper.pdf",
  hash: "a".repeat(64),
  bytes: 100,
  importedAt: "2026-09-03T00:00:00.000Z",
  pageCount: 2,
  title: "Early prediction of circulatory failure",
  authors: [],
  year: null,
  doi: null,
  kind: "research_paper",
  overview: "",
  quality: { textCharacters: 100, needsOcr: false, warnings: [] },
})

function Harness({ onDelete }: { readonly onDelete: (id: DocumentRecord["id"]) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <LibraryDocumentDetail
      document={paper}
      onOpenReader={vi.fn()}
      deletion={{ confirming, onConfirmingChange: setConfirming, onDelete }}
    />
  )
}

describe("LibraryDocumentDelete", () => {
  it("asks for confirmation before deleting and can be cancelled", async () => {
    const onDelete = vi.fn(async () => {})
    render(<Harness onDelete={onDelete} />)

    await userEvent.click(screen.getByRole("button", { name: "라이브러리에서 삭제" }))
    expect(screen.getByText("이 문서를 삭제할까요?")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "취소" }))
    expect(onDelete).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "라이브러리에서 삭제" }))
    await userEvent.click(screen.getByRole("button", { name: "삭제" }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(paper.id))
    expect(screen.queryByText("이 문서를 삭제할까요?")).toBeNull()
  })

  it("keeps the confirmation open and shows why a delete failed", async () => {
    render(
      <Harness
        onDelete={async () => {
          throw new Error("document_not_found")
        }}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "라이브러리에서 삭제" }))
    await userEvent.click(screen.getByRole("button", { name: "삭제" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("document_not_found")
    expect(screen.getByText("이 문서를 삭제할까요?")).toBeVisible()
  })
})

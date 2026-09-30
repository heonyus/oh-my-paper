import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PaperBibliographyPanel } from "../../../src/renderer/components/bibliography/PaperBibliographyPanel"
import { bibliographyPaperSchema } from "../../../src/shared/bibliographySchemas"

const current = bibliographyPaperSchema.parse({
  node: {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "paper",
    title: "Existing paper",
    body: "",
    aliases: [],
    metadata: {},
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
  },
  metadata: {
    citationKey: "lee2026existing",
    authors: ["Minji Park"],
    year: 2026,
    doi: "10.1000/shared",
    arxivId: null,
    venue: "Clinical AI",
    tags: ["EHR"],
    readingState: "reading",
  },
})

describe("PaperBibliographyPanel", () => {
  it("requires duplicate review before saving but never offers an automatic merge", async () => {
    // Given
    const onSave = vi.fn().mockResolvedValue(current)
    const onPreviewDuplicates = vi.fn().mockResolvedValue({
      candidates: [
        {
          paperNodeId: "22222222-2222-4222-8222-222222222222",
          title: "Potential duplicate",
          reasons: ["doi"],
        },
      ],
    })
    render(
      <PaperBibliographyPanel
        paper={current}
        onSave={onSave}
        onPreviewDuplicates={onPreviewDuplicates}
        onExportBibtex={vi.fn()}
      />,
    )

    // When
    fireEvent.click(screen.getByRole("button", { name: "논문 정보 저장" }))

    // Then
    expect(await screen.findByText(/Potential duplicate/u)).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: /병합/u })).not.toBeInTheDocument()

    // When
    fireEvent.click(screen.getByRole("button", { name: "중복을 유지하고 저장" }))

    // Then
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
  })
})

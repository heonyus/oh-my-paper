import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AiOverviewPanel } from "../../src/renderer/components/AiOverviewPanel"
import type { AiRequest } from "../../src/shared/ipc"
import { documentRecordSchema } from "../../src/shared/schemas"

const documentFixture = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 12,
  title: "Paper",
  authors: ["Researcher"],
  year: 2026,
  doi: null,
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

describe("AiOverviewPanel", () => {
  it("generates a summary only after an explicit click and can save it to the board", async () => {
    const onAiRequest = vi.fn(
      async (_request: Omit<AiRequest, "documentId">) => "1. 문제\n2. 방법\n3. 결과",
    )
    const onSave = vi.fn()
    render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: true, provider: "openai", model: "gpt-5" }}
        onAiRequest={onAiRequest}
        onSave={onSave}
      />,
    )

    expect(onAiRequest).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "3줄 요약 다시 생성" }))
    expect(await screen.findByText(/1\. 문제/u)).toBeVisible()
    expect(onAiRequest.mock.lastCall?.[0]?.action).toBe("three_line_summary")
    await userEvent.click(screen.getByRole("button", { name: "3줄 요약 보드에 저장" }))
    expect(onSave).toHaveBeenCalledWith("3줄 요약", "1. 문제\n2. 방법\n3. 결과")
  })
})

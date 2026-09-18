import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ExportPanel } from "../../../src/renderer/components/export/ExportPanel"
import type { ExportApi } from "../../../src/shared/exportIpc"
import { knowledgeNodeSchema } from "../../../src/shared/knowledgeSchemas"
import { sha256Schema } from "../../../src/shared/schemas"

const note = knowledgeNodeSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "note",
  title: "Canonical note",
  body: "body",
  aliases: [],
  metadata: {},
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
})

describe("ExportPanel", () => {
  it("previews the selected note before allowing a native export", async () => {
    const user = userEvent.setup()
    const api: ExportApi = {
      preview: vi.fn(async () => ({
        nodeId: note.id,
        title: note.title,
        revision: sha256Schema.parse("a".repeat(64)),
        recordCount: 1,
        assetCount: 0,
        bibliographyCount: 0,
        sourceCount: 0,
        limitationCount: 0,
      })),
      save: vi.fn(async () => ({ saved: true, fileName: "export.md" })),
    }

    render(<ExportPanel api={api} nodes={[note]} />)

    await user.selectOptions(screen.getByLabelText("내보낼 노트"), note.id)
    expect(screen.getByRole("button", { name: "미리보기" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "파일로 저장" })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "미리보기" }))

    expect(api.preview).toHaveBeenCalledWith(note.id)
    expect(
      within(screen.getByLabelText("내보내기 미리보기")).getByText("Canonical note"),
    ).toBeTruthy()
    expect(screen.getByText("저장된 노트와 연결된 자료를 파일로 내보냅니다.")).toBeTruthy()
    expect(screen.getByText("원본 확인 완료 · 제외되는 항목 없음")).toBeTruthy()
    expect(screen.queryByText(/revision/u)).toBeNull()
    expect(screen.getByRole("button", { name: "파일로 저장" })).toBeEnabled()
  })
})

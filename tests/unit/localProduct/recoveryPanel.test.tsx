import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { RecoveryPanel } from "../../../src/renderer/components/collection/RecoveryPanel"
import { accountRecoveryRecordSchema } from "../../../src/shared/accountIpc"
import { knowledgeNodeSchema } from "../../../src/shared/knowledgeSchemas"
import type { CreateNodeInput } from "../../../src/shared/knowledgeTypes"

it("previews recovery bytes and explicitly creates a new note without overwriting the original", async () => {
  const record = accountRecoveryRecordSchema.parse({
    recoveryId: "b6116621-1aa9-43bc-84f1-c49f630e164b",
    draft: {
      nodeId: "11111111-1111-4111-8111-111111111111",
      title: "읽다가 남긴 생각",
      body: "# 초안\n\n수식 $x^2$와 [[연결]]을 그대로 보관합니다.",
      expectedBody: "이전 내용",
      aliases: ["메모"],
      capturedAt: "2026-09-06T00:00:00.000Z",
    },
  })
  const createNote = vi.fn(async (input: CreateNodeInput) =>
    knowledgeNodeSchema.parse({
      ...input,
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: record.draft.capturedAt,
      updatedAt: record.draft.capturedAt,
    }),
  )
  const readRecoveryDraft = vi.fn(async () => record)
  const onOpen = vi.fn()
  render(
    <RecoveryPanel
      api={{
        listRecoveryDrafts: async () => [
          { ...record.draft, recoveryId: record.recoveryId, bytes: 512 },
        ],
        readRecoveryDraft,
      }}
      createNote={createNote}
      onOpen={onOpen}
    />,
  )
  expect(readRecoveryDraft).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "복구할 초안 확인" }))
  fireEvent.click(await screen.findByRole("button", { name: /읽다가 남긴 생각/ }))
  await waitFor(() =>
    expect(screen.getByLabelText("복구할 Markdown 원문")).toHaveValue(record.draft.body),
  )
  expect(createNote).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "새 노트로 복구" }))
  await screen.findByText("새 노트로 복구했습니다. 복구 사본도 계속 보관됩니다.")
  expect(createNote).toHaveBeenCalledExactlyOnceWith({
    kind: "note",
    title: "읽다가 남긴 생각 (복구)",
    body: record.draft.body,
    aliases: ["메모"],
    metadata: { recoveredFrom: record.recoveryId, originalNodeId: record.draft.nodeId },
  })
  fireEvent.click(screen.getByRole("button", { name: "복구한 노트 열기" }))
  expect(onOpen).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222")
})

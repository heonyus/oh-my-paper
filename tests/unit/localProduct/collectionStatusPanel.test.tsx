import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { CollectionStatusPanel } from "../../../src/renderer/components/collection/CollectionStatusPanel"
import { type CollectionApi, collectionStatusSchema } from "../../../src/shared/collectionIpc"

it("shows bounded-scan guidance, refreshes on changes/retry, and keeps the last status after a refresh failure", async () => {
  const degraded = collectionStatusSchema.parse({
    state: "degraded",
    indexComplete: false,
    reliabilityWarning: "scan incomplete",
    missingNoteIds: [],
    unresolvedConflictIds: [],
    lastScanAt: "2026-09-06T00:00:00.000Z",
    error: "read_failed: per_note_bytes: 4194368 exceeds 4194304",
  })
  const listeners = new Set<() => void>()
  const status = vi.fn(async () => degraded)
  const api: Pick<CollectionApi, "status" | "onChanged"> = {
    status,
    onChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  render(<CollectionStatusPanel api={api} />)

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("큰 노트"))
  expect(screen.getByText(/기존 색인 내용은 유지됩니다/)).toBeInTheDocument()
  expect(status).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }))
  await waitFor(() => expect(status).toHaveBeenCalledTimes(2))

  act(() => {
    for (const listener of listeners) listener()
  })
  await waitFor(() => expect(status).toHaveBeenCalledTimes(3))

  status.mockRejectedValueOnce(new Error("temporary status failure"))
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("확인하지 못했습니다"))
  expect(screen.getByText(/기존 색인 내용은 유지됩니다/)).toBeInTheDocument()
})

it("does not render a warning while the collection is ready", async () => {
  const api: Pick<CollectionApi, "status" | "onChanged"> = {
    status: vi.fn(async () =>
      collectionStatusSchema.parse({
        state: "ready",
        indexComplete: true,
        reliabilityWarning: null,
        missingNoteIds: [],
        unresolvedConflictIds: [],
        lastScanAt: "2026-09-06T00:00:00.000Z",
        error: null,
      }),
    ),
    onChanged: () => () => {},
  }

  render(<CollectionStatusPanel api={api} />)

  await waitFor(() => expect(api.status).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole("region", { name: "컬렉션 상태" })).not.toBeInTheDocument()
})

it.each([
  {
    error: "read_failed: note_count: 4097 exceeds 4096",
    missingNoteIds: [],
    guidance: "노트 파일 수를 4,096개 이하로 줄인 뒤",
    inappropriate: "큰 노트",
  },
  {
    error: "read_failed: per_note_bytes: 4194305 exceeds 4194304",
    missingNoteIds: [],
    guidance: "파일당 4MiB 이하로 줄이거나 나눈 뒤",
    inappropriate: "노트 파일 수를",
  },
  {
    error: "read_failed: aggregate_bytes: 67108865 exceeds 67108864",
    missingNoteIds: [],
    guidance: "전체 크기를 64MiB 이하로 줄인 뒤",
    inappropriate: "줄이거나 나눈 뒤",
  },
  {
    error: null,
    missingNoteIds: ["11111111-1111-4111-8111-111111111111"],
    guidance: "원본 파일의 위치를 확인하거나 복구하세요.",
    inappropriate: "색인 내용은 유지됩니다",
  },
])("renders accurate recovery guidance for $error / $missingNoteIds", async (scenario) => {
  const api: Pick<CollectionApi, "status" | "onChanged"> = {
    status: async () =>
      collectionStatusSchema.parse({
        state: "degraded",
        indexComplete: false,
        reliabilityWarning: null,
        unresolvedConflictIds: [],
        lastScanAt: null,
        error: scenario.error,
        missingNoteIds: scenario.missingNoteIds,
      }),
    onChanged: () => () => {},
  }

  render(<CollectionStatusPanel api={api} />)

  const message = await screen.findByRole("alert")
  expect(message).toHaveTextContent(scenario.guidance)
  expect(message).not.toHaveTextContent(scenario.inappropriate)
})

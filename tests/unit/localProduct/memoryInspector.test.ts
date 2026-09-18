import { fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { describe, expect, it } from "vitest"
import { MemoryInspector } from "../../../src/renderer/components/memory/MemoryInspector"
import {
  type MemoryId,
  type MemoryNavigationRecent,
  type MemoryPage,
  memoryIdSchema,
  memoryRecordSchema,
} from "../../../src/shared/memorySchemas"

const id = memoryIdSchema.parse("11111111-1111-4111-8111-111111111111")

function page(): MemoryPage {
  return {
    page: 0,
    pageSize: 20,
    hasNextPage: false,
    records: [
      memoryRecordSchema.parse({
        id,
        derivationKey: "memory:decision",
        text: "검토한 결정은 로컬 근거를 사용합니다.",
        conservativeTokenEstimate: 20,
        scope: { kind: "collection", key: "collection-test" },
        evidence: [
          {
            kind: "note",
            sourceKey: "note:test",
            sourceRevision: "rev-1",
            quote: "로컬 근거",
            page: null,
          },
        ],
        revision: 1,
        origin: { kind: "user", modelVersion: null },
        state: "pending",
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
        invalidatedAt: null,
      }),
    ],
  }
}

const recents: readonly MemoryNavigationRecent[] = [
  {
    id: 1,
    scope: { kind: "collection", key: "collection-test" },
    kind: "opened_page",
    fact: "문서 1쪽을 열었습니다.",
    sourceKey: "document:test",
    sourceRevision: "rev-1",
    occurredAt: "2026-09-06T00:00:00.000Z",
  },
]

describe("MemoryInspector", () => {
  it("renders review evidence and routes approval through typed props", () => {
    const approved: MemoryId[] = []
    render(
      createElement(MemoryInspector, {
        page: page(),
        navigationRecents: recents,
        pendingActionId: null,
        onPageChange: () => undefined,
        onApprove: (memoryId) => {
          approved.push(memoryId)
        },
        onReject: () => undefined,
        onForget: () => undefined,
      }),
    )

    expect(screen.getByText("검토한 결정은 로컬 근거를 사용합니다.")).toBeInTheDocument()
    expect(screen.getByText("note:test · rev-1")).toBeInTheDocument()
    expect(screen.getByText("문서 1쪽을 열었습니다.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /승인/u }))
    expect(approved).toEqual([id])
  })
})

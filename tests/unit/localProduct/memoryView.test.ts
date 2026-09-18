import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { describe, expect, it } from "vitest"
import { MemoryView } from "../../../src/renderer/components/memory/MemoryView"
import type { MemoryPreloadApi } from "../../../src/shared/memoryIpc"
import {
  type MemoryPage,
  type MemoryScope,
  memoryDerivationKeySchema,
} from "../../../src/shared/memorySchemas"

const scope: MemoryScope = { kind: "collection", key: "collection-test" }
const emptyPage: MemoryPage = {
  page: 0,
  pageSize: 20,
  records: [],
  hasNextPage: false,
}

function apiWith(overrides: Partial<MemoryPreloadApi> = {}): MemoryPreloadApi {
  return {
    getScope: async () => scope,
    list: async () => emptyPage,
    navigationRecents: async () => [],
    retrieve: async () => ({ records: [], conservativeTokenCount: 0, omittedCount: 0 }),
    propose: async () => ({
      kind: "suppressed",
      derivationKey: memoryDerivationKeySchema.parse("memory:test"),
      scope,
      forgottenAt: "2026-09-06T00:00:00.000Z",
    }),
    approve: async () => {
      throw new Error("unused")
    },
    reject: async () => {
      throw new Error("unused")
    },
    forget: async () => {
      throw new Error("unused")
    },
    invalidate: async () => 0,
    export: async () => ({ page: emptyPage, navigationRecents: [] }),
    ...overrides,
  }
}

describe("MemoryView", () => {
  it("loads the scoped inspector and submits only an explicit user proposal", async () => {
    const proposals: string[] = []
    const derivationKeys: string[] = []
    const api = apiWith({
      propose: async (input) => {
        proposals.push(input.text)
        derivationKeys.push(input.derivationKey)
        return {
          kind: "suppressed",
          derivationKey: memoryDerivationKeySchema.parse(input.derivationKey),
          scope,
          forgottenAt: "2026-09-06T00:00:00.000Z",
        }
      },
    })
    render(createElement(MemoryView, { api, projectName: "연구 프로젝트" }))

    await waitFor(() =>
      expect(screen.getByText("표시할 의미 기억이 없습니다.")).toBeInTheDocument(),
    )
    expect(screen.getByText(/이 컬렉션 · 연구 프로젝트/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("기억할 내용"), {
      target: { value: "사용자가 직접 확인한 내용" },
    })
    fireEvent.click(screen.getByRole("button", { name: "기억 저장" }))

    await waitFor(() => expect(proposals).toEqual(["사용자가 직접 확인한 내용"]))
    expect(derivationKeys[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(
      screen.getByText("이전에 잊은 내용이라 다시 자동 저장하지 않았습니다."),
    ).toBeInTheDocument()
  })

  it("keeps a failed list visible as an actionable error", async () => {
    const api = apiWith({
      list: async () => {
        throw new Error("local database unavailable")
      },
    })
    render(createElement(MemoryView, { api }))

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("local database unavailable"),
    )
    expect(screen.getByText("메모리를 표시할 수 없습니다.")).toBeInTheDocument()
  })
})

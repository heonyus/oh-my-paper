import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useNodeDraft } from "../../../src/renderer/components/knowledge/useNodeDraft"
import { knowledgeNodeSchema } from "../../../src/shared/knowledgeSchemas"

const node = knowledgeNodeSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "note",
  title: "원래 제목",
  body: "원래 본문",
  aliases: ["기존 별칭"],
  metadata: {},
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
})

describe("useNodeDraft deferred saves", () => {
  it("refreshes a clean same-node draft from a restored note", () => {
    // Given
    const update = vi.fn(async () => node)
    const { result, rerender } = renderHook(
      ({ currentNode }: { readonly currentNode: typeof node }) =>
        useNodeDraft(currentNode, update, () => {}),
      { initialProps: { currentNode: node } },
    )
    act(() => result.current.start())
    const restoredNode = {
      ...node,
      title: "복원된 제목",
      body: "복원된 본문",
      aliases: ["복원 별칭"],
    }

    // When
    act(() => rerender({ currentNode: restoredNode }))

    // Then
    expect(result.current.title).toBe("복원된 제목")
    expect(result.current.body).toBe("복원된 본문")
    expect(result.current.aliases).toBe("복원 별칭")
    expect(result.current.dirty).toBe(false)
  })

  it("preserves dirty and in-flight text across same-node refreshes", async () => {
    // Given
    let resolveUpdate: ((value: typeof node) => void) | undefined
    const update = vi.fn(
      () =>
        new Promise<typeof node>((resolve) => {
          resolveUpdate = resolve
        }),
    )
    const { result, rerender } = renderHook(
      ({ currentNode }: { readonly currentNode: typeof node }) =>
        useNodeDraft(currentNode, update, () => {}),
      { initialProps: { currentNode: node } },
    )
    act(() => result.current.start())
    act(() => {
      result.current.setTitle("사용자 제목")
      result.current.setBody("사용자 본문")
    })
    const restoredNode = {
      ...node,
      title: "외부 복원 제목",
      body: "외부 복원 본문",
      aliases: ["외부 복원 별칭"],
    }

    // When
    act(() => rerender({ currentNode: restoredNode }))
    let save: Promise<void> | undefined
    act(() => {
      save = result.current.save(true)
    })
    act(() => result.current.reset())
    act(() => rerender({ currentNode: { ...restoredNode, body: "두 번째 복원 본문" } }))

    // Then
    expect(result.current.title).toBe("사용자 제목")
    expect(result.current.body).toBe("사용자 본문")
    expect(result.current.dirty).toBe(true)

    const resolve = resolveUpdate
    if (resolve === undefined || save === undefined) throw new Error("save was not pending")
    const savedNode = { ...node, title: "사용자 제목", body: "사용자 본문", aliases: [] }
    await act(async () => {
      resolve(savedNode)
      await save
    })
    act(() => rerender({ currentNode: savedNode }))
    expect(result.current.body).toBe("사용자 본문")
  })

  it("keeps the returned save body until the parent refreshes its node", async () => {
    // Given
    let resolveUpdate: ((value: typeof node) => void) | undefined
    const update = vi.fn(
      () =>
        new Promise<typeof node>((resolve) => {
          resolveUpdate = resolve
        }),
    )
    const { result } = renderHook(() => useNodeDraft(node, update, () => {}))
    act(() => result.current.start())
    act(() => result.current.setBody("저장된 본문"))

    // When
    let save: Promise<void> | undefined
    act(() => {
      save = result.current.save(true)
    })
    const resolve = resolveUpdate
    if (resolve === undefined || save === undefined) throw new Error("save was not pending")
    await act(async () => {
      resolve({ ...node, body: "저장된 본문" })
      await save
    })

    // Then
    expect(result.current.body).toBe("저장된 본문")
    expect(result.current.baseBody).toBe("저장된 본문")
  })

  it("keeps newer typing when an earlier normalized save resolves", async () => {
    // Given
    let resolveUpdate: ((value: typeof node) => void) | undefined
    const update = vi.fn(
      () =>
        new Promise<typeof node>((resolve) => {
          resolveUpdate = resolve
        }),
    )
    const { result } = renderHook(() => useNodeDraft(node, update, () => {}))
    act(() => result.current.start())
    act(() => result.current.setTitle("  저장 제목  "))

    // When
    let save: Promise<void> | undefined
    act(() => {
      save = result.current.save(true)
    })
    act(() => result.current.setTitle("더 최신 제목"))
    const resolve = resolveUpdate
    if (resolve === undefined || save === undefined) throw new Error("save was not pending")
    await act(async () => {
      resolve({ ...node, title: "저장 제목", body: "원래 본문", aliases: ["기존 별칭"] })
      await save
    })

    // Then
    expect(update).toHaveBeenCalledOnce()
    expect(result.current.title).toBe("더 최신 제목")
    expect(result.current.baseBody).toBe("원래 본문")
    expect(result.current.dirty).toBe(true)
  })
})

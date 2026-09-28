import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PaperDiscussion } from "../../src/renderer/components/PaperDiscussion"

const key = "ohmypaper:discussion:aabbccddeeff0011"

describe("PaperDiscussion", () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (item: string) => values.get(item) ?? null,
      setItem: (item: string, value: string) => values.set(item, value),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("settles an interrupted persisted assistant entry on reopen", () => {
    window.localStorage.setItem(
      key,
      JSON.stringify([
        { id: "user-1", role: "user", content: "질문" },
        { id: "assistant-1", role: "assistant", content: "답변 작성 중…" },
      ]),
    )

    render(
      <PaperDiscussion
        provider={{ configured: true, provider: "openrouter", model: "test-model" }}
        documentId="aabbccddeeff0011"
        onAsk={async () => "답변"}
      />,
    )

    expect(screen.getByText("중단되었습니다.")).toBeVisible()
    expect(screen.getByRole("textbox", { name: "논문 토론 질문" })).toBeEnabled()
  })

  it("turns cited pages in answers into chips that jump to the source", async () => {
    window.localStorage.setItem(
      key,
      JSON.stringify([
        { id: "user-1", role: "user", content: "Page 2 데이터는?" },
        {
          id: "assistant-1",
          role: "assistant",
          content:
            "HiRID는 7,333개 변수입니다 [[p.2 | a total of 7,333 routinely collected]]. 전처리는 11페이지.",
        },
      ]),
    )
    const onNavigateToSource = vi.fn()

    render(
      <PaperDiscussion
        provider={{ configured: true, provider: "anthropic", model: "claude-sonnet-5" }}
        documentId="aabbccddeeff0011"
        onAsk={async () => "답변"}
        onNavigateToSource={onNavigateToSource}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "p.2" }))
    await userEvent.click(screen.getByRole("button", { name: "11페이지" }))

    expect(onNavigateToSource).toHaveBeenNthCalledWith(1, {
      page: 2,
      quote: "a total of 7,333 routinely collected",
    })
    expect(onNavigateToSource).toHaveBeenNthCalledWith(2, { page: 11 })
    expect(screen.queryByRole("button", { name: "Page 2" })).toBeNull()
  })
})

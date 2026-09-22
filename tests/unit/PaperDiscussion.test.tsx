import { render, screen } from "@testing-library/react"
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
})

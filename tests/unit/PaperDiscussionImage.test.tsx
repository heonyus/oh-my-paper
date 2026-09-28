import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PaperDiscussion } from "../../src/renderer/components/PaperDiscussion"
import { fitWithin } from "../../src/renderer/lib/chatImage"

const dataUrl = "data:image/png;base64,iVBORw0KGgo="

vi.mock("../../src/renderer/lib/chatImage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/renderer/lib/chatImage")>()
  return {
    ...original,
    chatImageFromFile: vi.fn(async (file: File) => ({ dataUrl, name: file.name })),
  }
})

const key = "ohmypaper:discussion:aabbccddeeff0011"
let stored = new Map<string, string>()

describe("paper chat image attachments", () => {
  beforeEach(() => {
    stored = new Map()
    vi.stubGlobal("localStorage", {
      getItem: (item: string) => stored.get(item) ?? null,
      setItem: (item: string, value: string) => stored.set(item, value),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("sends a picked image with the question and keeps only a marker in storage", async () => {
    const onAsk = vi.fn(async () => "Figure 2의 곡선입니다")
    const { container } = render(
      <PaperDiscussion
        provider={{ configured: true, provider: "anthropic", model: "claude-sonnet-5" }}
        documentId="aabbccddeeff0011"
        onAsk={onAsk}
      />,
    )
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error("image input missing")

    await userEvent.upload(input, new File(["png"], "figure.png", { type: "image/png" }))
    expect(await screen.findByAltText("첨부 이미지: figure.png")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "토론 질문 보내기" }))

    await waitFor(() => expect(onAsk).toHaveBeenCalledOnce())
    expect(onAsk.mock.calls[0]).toEqual([
      "첨부한 이미지를 이 논문 내용과 연결해 설명해 주세요.",
      [],
      expect.any(Function),
      expect.any(AbortSignal),
      dataUrl,
    ])
    expect(screen.getByAltText("첨부 이미지")).toHaveAttribute("src", dataUrl)
    expect(screen.queryByAltText("첨부 이미지: figure.png")).toBeNull()
    await waitFor(() => expect(stored.get(key)).toContain('"attachment":"image"'))
    expect(stored.get(key)).not.toContain("base64")
  })

  it("keeps an image's aspect ratio while bounding its long edge", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1000, 5000, 1000)).toEqual({ width: 200, height: 1000 })
  })
})

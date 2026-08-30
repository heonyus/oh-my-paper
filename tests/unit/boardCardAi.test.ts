import { describe, expect, it, vi } from "vitest"
import { regenerateBoardCardTitle } from "../../src/renderer/lib/boardCardAi"
import { boardCardSchema } from "../../src/shared/schemas"

describe("board card AI routing", () => {
  it("uses the dedicated card-title action with source context", async () => {
    const card = boardCardSchema.parse({
      id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
      documentId: "aabbccddeeff0011",
      kind: "explanation",
      title: "기존 제목",
      body: "카드 본문",
      x: 1,
      y: 1,
      minimized: false,
      anchor: {
        page: 3,
        quote: "원문 문맥",
        x: 1,
        y: 1,
        fragments: [{ x: 1, y: 1, width: 2, height: 2 }],
      },
    })
    const request = vi.fn(async () => "새 제목")

    await regenerateBoardCardTitle(card, request)

    expect(request).toHaveBeenCalledWith({
      action: "card_title",
      page: 3,
      quote: "카드 본문",
      before: "원문 문맥",
      after: "",
    })
  })
})

import { describe, expect, it } from "vitest"
import {
  CARD_CHAT_MESSAGE_MAX,
  CARD_CHAT_MESSAGES_MAX,
  withinCardChatLimits,
} from "../../src/renderer/lib/cardChatLimits"
import { boardCardSchema } from "../../src/shared/schemas"

describe("card chat limits", () => {
  it("cuts a long answer, drops an empty one and keeps the latest turns", () => {
    const chat = withinCardChatLimits([
      ...Array.from({ length: 30 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `turn ${index}`,
      })),
      { role: "assistant", content: "   " },
      { role: "assistant", content: "가".repeat(9_000) },
    ])

    expect(chat).toHaveLength(CARD_CHAT_MESSAGES_MAX)
    expect(chat[0]?.content).toBe("turn 7")
    expect(chat.at(-1)?.content).toHaveLength(CARD_CHAT_MESSAGE_MAX)
    expect(chat.at(-1)?.content.endsWith("…")).toBe(true)
    expect(boardCardSchema.shape.chat.safeParse(chat).success).toBe(true)
  })

  it("never splits an emoji at the cut", () => {
    const [message] = withinCardChatLimits([
      { role: "assistant", content: `${"a".repeat(CARD_CHAT_MESSAGE_MAX - 2)}😀😀` },
    ])

    expect(message?.content).toBe(`${"a".repeat(CARD_CHAT_MESSAGE_MAX - 2)}…`)
  })
})

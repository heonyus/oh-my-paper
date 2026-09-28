import { describe, expect, it } from "vitest"
import {
  cleanTutorText,
  earlierNoteParagraphs,
  noteTutorRequest,
  visibleTutorText,
} from "../../src/renderer/lib/noteTutor"
import { documentIdSchema } from "../../src/shared/ids"

const pageTexts = [
  "Abstract.",
  "Participants rated the always-visible translation as easier and more pleasant, although they recalled less.",
]

describe("note tutor", () => {
  it("keeps declarative sentences whose citations are on their page", () => {
    const reply =
      "짚은 방향이 맞아요. 참가자들은 번역이 계속 보이는 조건을 더 쉽다고 평가했어요 [[p.2 | rated the always-visible translation as easier]]. 그런데 왜 그랬을까요? 저자는 실험을 두 번 반복했어요 [[p.2 | the experiment was repeated twice]]."

    expect(cleanTutorText(reply, pageTexts)).toBe(
      "짚은 방향이 맞아요. 참가자들은 번역이 계속 보이는 조건을 더 쉽다고 평가했어요 [[p.2 | rated the always-visible translation as easier]].",
    )
  })

  it("shows only finished sentences while a reply streams", () => {
    expect(visibleTutorText("짚은 방향이 맞아요. 참가자들은 번역", pageTexts)).toBe(
      "짚은 방향이 맞아요.",
    )
    expect(visibleTutorText("아직 첫 문장", pageTexts)).toBe("")
  })

  it("sends the paragraph, the related passages and the reader's earlier notes", () => {
    const request = noteTutorRequest({
      paragraph: "편한 게 꼭 남는 건 아니다.",
      earlierLines: "사람들은 번역이 보이는 쪽을 더 좋아했다",
      passages: [{ page: 2, text: pageTexts[1] ?? "" }],
      earlierNotes: [{ id: "x:0", title: "Retrieval Practice", text: "떠올려야 남는다" }],
      page: 2,
    })

    expect(request).toMatchObject({
      action: "note_tutor",
      page: 2,
      quote: "편한 게 꼭 남는 건 아니다.",
      sectionContext:
        "Lines the reader wrote earlier in this note, already answered; for reference only:\n사람들은 번역이 보이는 쪽을 더 좋아했다",
    })
    expect(request.sourceEvidence).toContain("[Page 2]")
    expect(request.sourceEvidence).toContain("〈Retrieval Practice〉 떠올려야 남는다")
  })

  it("turns notes on other papers into plain paragraphs", () => {
    const current = documentIdSchema.parse("aabbccddeeff0011")
    const other = documentIdSchema.parse("aabbccddeeff0022")
    const paragraphs = earlierNoteParagraphs(
      [
        {
          documentId: current,
          markdown: "지금 읽는 논문의 긴 노트 문장입니다",
          updatedAt: "2026-09-28T00:00:00.000Z",
        },
        {
          documentId: other,
          markdown:
            "## 문제\n\n> 떠올려야 오래 남는다는 결과가 반복해서 나왔다 [[p.3 | retrieval beats rereading]]\n\n짧음",
          updatedAt: "2026-09-28T00:00:00.000Z",
        },
      ],
      new Map([
        [current, "Current"],
        [other, "Retrieval Practice"],
      ]),
      current,
    )
    expect(paragraphs).toEqual([
      {
        id: `${other}:1`,
        title: "Retrieval Practice",
        text: "떠올려야 오래 남는다는 결과가 반복해서 나왔다",
      },
    ])
  })
})

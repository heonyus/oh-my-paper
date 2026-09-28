import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WorkspaceStore } from "../../src/electron/workspaceStore"
import { UNVERIFIED_NOTE } from "../../src/renderer/lib/ownSummaryCheck"
import { ownWordsCheckRequest, verifiedOwnWordsCheck } from "../../src/renderer/lib/ownWordsCheck"
import { boardCardSchema, documentRecordSchema } from "../../src/shared/schemas"

const passage =
  "Readers who write a gist before seeing a translation read the English source more closely."

const card = boardCardSchema.parse({
  id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
  documentId: "aabbccddeeff0011",
  kind: "note",
  title: "내 말로",
  body: "  번역을 보기 전에 요지를 쓰면 원문을 더 꼼꼼히 읽는다  ",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 4,
    quote: passage,
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

const temporaryRoots: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("own words check", () => {
  it("sends the reader's text with only the selected passage as evidence", () => {
    expect(ownWordsCheckRequest(card)).toEqual({
      action: "own_words_check",
      page: 4,
      quote: "번역을 보기 전에 요지를 쓰면 원문을 더 꼼꼼히 읽는다",
      sourceEvidence: `SELECTED PASSAGE (page 4):\n${passage}`,
      before: "",
      after: "",
    })
  })

  it("keeps a verdict whose quote comes from the passage", () => {
    const reply = JSON.stringify({
      verdict: "match",
      note: "요지를 정확히 짚었습니다.",
      quote: "read the English source more closely",
    })
    expect(verifiedOwnWordsCheck(reply, passage, "요지", "2026-09-28T00:00:00.000Z")).toEqual({
      checkedAt: "2026-09-28T00:00:00.000Z",
      text: "요지",
      verdict: "match",
      note: "요지를 정확히 짚었습니다.",
      quote: "read the English source more closely",
    })
  })

  it("turns a verdict without a passage quote into unverifiable", () => {
    const reply =
      '```json\n{"verdict":"diverges","note":"다릅니다.","quote":"an invented sentence here"}\n```'
    expect(verifiedOwnWordsCheck(reply, passage, "요지", "2026-09-28T00:00:00.000Z")).toMatchObject(
      { verdict: "unverifiable", note: UNVERIFIED_NOTE, quote: null },
    )
  })

  it("accepts the whole passage as the quote when the selection is short", () => {
    const reply = JSON.stringify({
      verdict: "missing",
      note: "범위가 빠졌습니다.",
      quote: "p < 0.05",
    })
    expect(
      verifiedOwnWordsCheck(reply, "p < 0.05", "유의", "2026-09-28T00:00:00.000Z"),
    ).toMatchObject({ verdict: "missing", quote: "p < 0.05" })
  })

  it("persists the check with the card", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-own-words-"))
    temporaryRoots.push(root)
    const store = new WorkspaceStore(root)
    await store.addDocument(
      documentRecordSchema.parse({
        id: "aabbccddeeff0011",
        name: "paper.pdf",
        hash: "a".repeat(64),
        bytes: 1024,
        importedAt: "2026-08-30T00:00:00.000Z",
        pageCount: 12,
        title: "Paper",
        authors: [],
        year: null,
        doi: null,
        quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
      }),
    )
    const ownCheck = {
      checkedAt: "2026-09-28T00:00:00.000Z",
      text: "번역을 보기 전에 요지를 쓰면 원문을 더 꼼꼼히 읽는다",
      verdict: "match" as const,
      note: "요지를 정확히 짚었습니다.",
      quote: "read the English source more closely",
    }

    await store.save({ ...(await store.read()), cards: [{ ...card, ownCheck }] })

    expect((await store.read()).cards[0]?.ownCheck).toEqual(ownCheck)
    await store.close()
  })
})

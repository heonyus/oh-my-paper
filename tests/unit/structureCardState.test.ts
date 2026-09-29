import { describe, expect, it } from "vitest"
import {
  citationFailureBody,
  interruptedCardBody,
  settleInterruptedCards,
  shouldRegenerateStructureCard,
  structureFailureBody,
  upsertStructureCard,
} from "../../src/renderer/lib/structureCardState"
import type { DetectedStructure } from "../../src/renderer/lib/structureDetector"
import { boardCardSchema, workspaceSchema } from "../../src/shared/schemas"

const structure: DetectedStructure = {
  id: "figure-1",
  kind: "figure",
  page: 1,
  title: "Figure 1 해설",
  quote: "Comparison between EHR tasks",
  bounds: { x: 320, y: 180, width: 220, height: 160 },
}

function card(id: string, fragmentX: number) {
  return boardCardSchema.parse({
    id,
    documentId: "aabbccddeeff0011",
    kind: "infographic",
    title: structure.title,
    body: "loading",
    x: 900,
    y: 240,
    minimized: false,
    sourceKey: `1:figure:${structure.title}:${structure.quote}`,
    anchor: {
      page: 1,
      quote: structure.quote,
      x: fragmentX + 200,
      y: 260,
      fragments: [{ x: fragmentX, y: 180, width: 200, height: 160 }],
    },
  })
}

describe("structure card state", () => {
  it("keeps one card per structure and refreshes its source geometry", () => {
    const existing = {
      ...card("f7ac31b5-19f6-4bec-b30a-3cf8692f9d82", 100),
      body: "cached explanation",
      loading: false,
      chat: [{ role: "user" as const, content: "follow-up" }],
    }
    const fresh = card("88bdf14a-eace-4d70-80be-45ea55e8dd06", 320)

    const result = upsertStructureCard([existing], fresh, structure)

    expect(result.cards).toHaveLength(1)
    expect(result.card.id).toBe(existing.id)
    expect(result.card.x).toBe(existing.x)
    expect(result.card.anchor.fragments[0]?.x).toBe(320)
    expect(result.card.body).toBe("cached explanation")
    expect(result.card.chat).toEqual(existing.chat)
    expect(result.reused).toBe(true)
  })

  it("retries only an incomplete cached citation card", () => {
    const citation = boardCardSchema.parse({
      id: "63b52673-19ca-4b24-9680-4d3e7615887c",
      documentId: "aabbccddeeff0011",
      kind: "citation",
      title: "DeepMind, 2025",
      body: "메타정보를 확인했습니다.",
      x: 900,
      y: 240,
      minimized: false,
      loading: false,
      anchor: {
        page: 2,
        quote: "DeepMind, 2025",
        x: 820,
        y: 260,
        fragments: [{ x: 620, y: 180, width: 120, height: 24 }],
      },
    })

    expect(shouldRegenerateStructureCard(citation)).toBe(true)
    expect(shouldRegenerateStructureCard({ ...citation, loading: true }, true)).toBe(false)
    expect(shouldRegenerateStructureCard({ ...citation, loading: true }, false)).toBe(true)
    expect(shouldRegenerateStructureCard(card("81ecb049-348d-48cc-aa75-a33920407e9a", 100))).toBe(
      false,
    )
  })

  it("retries an explanation that did not finish, and only that", () => {
    const explained = { ...card("0f5e7c1a-5b8e-4c3e-9a51-3c2d8e4f6a10", 100), loading: false }
    const failed = { ...explained, body: structureFailureBody }
    const legacy = {
      ...explained,
      body: "AI 요청을 완료하지 못했습니다. 설정을 확인하고 다시 시도해주세요.",
    }

    expect(shouldRegenerateStructureCard({ ...explained, body: "그림 설명" })).toBe(false)
    expect(shouldRegenerateStructureCard(failed)).toBe(true)
    expect(shouldRegenerateStructureCard(legacy)).toBe(true)
    // Loading with its request still running: clicking again only focuses the card.
    expect(shouldRegenerateStructureCard({ ...explained, loading: true }, true)).toBe(false)
    // Loading with nothing running, as after a reload mid-answer.
    expect(shouldRegenerateStructureCard({ ...explained, loading: true }, false)).toBe(true)
  })

  it("settles cards still loading from a closed session so they can be retried", () => {
    const figure = { ...card("1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", 100), loading: true }
    const citation = {
      ...card("2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e", 100),
      kind: "citation" as const,
      loading: true,
    }
    const selection = {
      ...card("3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f", 100),
      kind: "explanation" as const,
      sourceKey: undefined,
      loading: true,
    }
    const done = { ...card("4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80", 100), loading: false }
    const workspaceOf = (cards: readonly unknown[]) =>
      workspaceSchema.parse({
        documents: [],
        cards,
        sidebarOpen: true,
        viewport: { x: 0, y: 0, zoom: 1 },
        activeDocumentId: null,
      })
    const workspace = workspaceOf([figure, citation, selection, done])

    const settled = settleInterruptedCards(workspace).cards

    expect(settled.map((item) => [item.loading, item.body])).toEqual([
      [false, structureFailureBody],
      [false, citationFailureBody],
      [false, interruptedCardBody],
      [false, "loading"],
    ])
    expect(settled[0] && shouldRegenerateStructureCard(settled[0])).toBe(true)
    const idle = workspaceOf([done])
    expect(settleInterruptedCards(idle)).toBe(idle)
  })
})

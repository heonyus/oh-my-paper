import { describe, expect, it } from "vitest"
import {
  conciseCardTitle,
  normalizeWorkspaceTranslations,
  parsedCardResponse,
  parsedTranslationResponse,
} from "../../src/renderer/lib/cardPresentation"
import { workspaceSchema } from "../../src/shared/schemas"

describe("card presentation", () => {
  it("parses a concise heading and preserves structured Markdown body", () => {
    expect(parsedCardResponse("# 통합 벤치마크\n\n## 핵심\n\n- 근거", "섹션 해설")).toEqual({
      title: "통합 벤치마크",
      body: "## 핵심\n\n- 근거",
    })
  })

  it("removes generic title suffixes and bounds long titles", () => {
    expect(conciseCardTitle("Figure 1 해설", "그림")).toBe("Figure 1")
    expect(conciseCardTitle("가".repeat(60), "카드")).toHaveLength(42)
  })

  it("formats a single-word translation as three meanings with the primary meaning bold", () => {
    expect(
      parsedTranslationResponse(
        '{"meanings":["나타내다","시사하다, 암시하다","가리키다, 보여주다"]}',
        "indicates",
      ),
    ).toEqual({
      title: "indicates",
      body: "1. **나타내다**\n2. 시사하다, 암시하다\n3. 가리키다, 보여주다",
    })
  })

  it("repairs a verbose legacy word translation into a word title and meaning-only body", () => {
    expect(
      parsedTranslationResponse(
        '**"indicates"** — 가장 흔한 한국어 뜻: **나타내다, 시사하다**. (문맥상 설명)',
        "indicates",
      ),
    ).toEqual({ title: "indicates", body: "1. **나타내다**\n2. 시사하다" })
  })

  it("formats a short English phrase translation as numbered meanings with the best fit bold", () => {
    expect(
      parsedTranslationResponse(
        '{"meanings":["검증 가능한 정답","확인 가능한 실제값"]}',
        "verifiable ground truth",
      ),
    ).toEqual({
      title: "verifiable ground truth",
      body: "1. **검증 가능한 정답**\n2. 확인 가능한 실제값",
    })
    expect(parsedTranslationResponse("검증 가능한 정답", "verifiable ground truth")).toEqual({
      title: "verifiable ground truth",
      body: "1. **검증 가능한 정답**",
    })
  })

  it("uses a neutral paragraph title while preserving translated paragraph breaks", () => {
    expect(
      parsedTranslationResponse(
        "첫 번째 번역 문단입니다.\n\n두 번째 번역 문단입니다.",
        "This is a long paragraph containing more than five selected words from the paper.",
      ),
    ).toEqual({
      title: "문단 번역",
      body: "첫 번째 번역 문단입니다.\n\n두 번째 번역 문단입니다.",
    })
  })

  it("migrates a cached verbose word translation when the workspace opens", () => {
    const workspace = workspaceSchema.parse({
      documents: [],
      cards: [
        {
          id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
          documentId: "aabbccddeeff0011",
          kind: "translation",
          title: '**"indicates"** — 가장 흔한 한국어 뜻',
          body: '**"indicates"** — 가장 흔한 한국어 뜻: **나타내다, 시사하다**.',
          x: 0,
          y: 0,
          minimized: false,
          loading: false,
          chat: [],
          anchor: {
            page: 1,
            quote: "indicates",
            x: 0,
            y: 0,
            fragments: [{ x: 0, y: 0, width: 1, height: 1 }],
          },
        },
      ],
      sidebarOpen: true,
      viewport: { x: 0, y: 0, zoom: 1 },
      activeDocumentId: null,
    })

    expect(normalizeWorkspaceTranslations(workspace).cards[0]).toMatchObject({
      title: "indicates",
      body: "1. **나타내다**\n2. 시사하다",
    })
  })

  it("migrates a legacy translation note into a persistent highlight annotation", () => {
    const workspace = workspaceSchema.parse({
      documents: [],
      cards: [
        {
          id: "83fcb8ab-9085-4f88-af36-f4d25cdd2365",
          documentId: "aabbccddeeff0011",
          kind: "note",
          title: "번역 주석",
          body: "1. **출처**\n2. 근거\n3. 정보원",
          x: 0,
          y: 0,
          minimized: false,
          loading: false,
          chat: [],
          anchor: {
            page: 1,
            quote: "source",
            x: 0,
            y: 0,
            fragments: [{ x: 0, y: 0, width: 1, height: 1 }],
          },
        },
      ],
      sidebarOpen: true,
      viewport: { x: 0, y: 0, zoom: 1 },
      activeDocumentId: null,
    })

    expect(normalizeWorkspaceTranslations(workspace).cards[0]).toMatchObject({
      kind: "highlight",
      title: "번역 주석",
      body: "1. **출처**\n2. 근거\n3. 정보원",
      anchor: { page: 1, quote: "source" },
    })
  })
})

import { describe, expect, it } from "vitest"
import {
  alignSentences,
  isRunInHeading,
  paragraphRegions,
  translationPieces,
} from "../../src/renderer/lib/pageTranslationParagraphs"
import type { PageTranslationBlock } from "../../src/renderer/lib/pageTranslationSource"
import type { PageTextRun } from "../../src/renderer/lib/pdfPageTextRuns"
import {
  type ParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../../src/shared/documentPageModel"

const bounds = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

function line(index: number, x: number, y: number, content: string, width = 400) {
  return {
    id: `page:1:block:${index}`,
    label: "text",
    order: index,
    bounds: bounds(x, y, width, 14),
    content,
    contentFormat: "markdown",
    translationPolicy: "include",
  }
}

/** A Nature-style methods column: run-in subheads, an indented paragraph, a bullet list. */
const page: ParsedDocumentPage = parsedDocumentPageSchema.parse({
  schemaVersion: "1.0.0",
  sourceHash: "a".repeat(64),
  parser: "PDF.js+PaddleOCR-VL-1.6",
  configVersion: "hybrid-v11",
  pageNumber: 1,
  width: 1_000,
  height: 1_400,
  blocks: [
    line(0, 80, 45, "Articles NATURE", 300),
    {
      ...line(1, 80, 100, "## Methods", 80),
      label: "paragraph_title",
      bounds: bounds(80, 100, 80, 20),
    },
    line(2, 85, 127, "Study design and setting. The study was"),
    line(3, 85, 144, "designed as a cohort study. It ran at"),
    line(4, 85, 161, "one site.", 80),
    line(5, 105, 182, "The study flow chart is in Fig. 2.", 380),
    line(6, 85, 199, "Admissions before 2008 were excluded.", 300),
    line(7, 85, 227, "Artifact removal. Artifacts were corrected."),
    line(8, 85, 244, "Four main types were identified:", 260),
    line(9, 85, 267, "• Timestamp artifacts. Time fields were"),
    line(10, 110, 284, "swapped in some rows.", 200),
    line(11, 545, 102, "and the rest of the sentence continues here."),
    line(12, 545, 119, "Another sentence follows.", 220),
  ],
  layout: [
    { label: "header", order: 6, bounds: bounds(80, 40, 120, 30), content: "ARTICLES" },
    { label: "paragraph_title", order: 0, bounds: bounds(80, 100, 80, 20), content: "## Methods" },
    {
      label: "text",
      order: 1,
      bounds: bounds(80, 125, 420, 52),
      content:
        "Study design and setting. The study was designed as a cohort study. It ran at one site.",
    },
    {
      label: "text",
      order: 2,
      bounds: bounds(80, 180, 420, 35),
      content: "The study flow chart is in Fig. 2. Admissions before 2008 were excluded.",
    },
    {
      label: "text",
      order: 3,
      bounds: bounds(80, 225, 420, 35),
      content: "Artifact removal. Artifacts were corrected. Four main types were identified:",
    },
    {
      label: "text",
      order: 4,
      bounds: bounds(80, 265, 420, 35),
      content: "- Timestamp artifacts. Time fields were swapped in some rows.",
    },
    // The layout model found the box but returned no text for it.
    { label: "text", order: 5, bounds: bounds(540, 100, 420, 35), content: "" },
  ],
})

function sentence(
  index: number,
  group: string,
  source: string,
  translation: string,
): PageTranslationBlock {
  return {
    id: `${group}:sentence:${index}`,
    parsedBlockId: group,
    kind: "body",
    structureKind: "body",
    source,
    translation,
    sourceBounds: bounds(80, 45, 420, 260),
    sourcePageWidth: 1_000,
    sourcePageHeight: 1_400,
  }
}

const left = "page:1:block:0"
const right = "page:1:block:11"
const translations: readonly PageTranslationBlock[] = [
  sentence(1, left, "Articles NATURE", "기사 네이처"),
  {
    ...sentence(1, "page:1:block:1", "## Methods", "## 방법"),
    id: "page:1:block:1",
    kind: "heading",
    structureKind: "heading",
    sourceBounds: bounds(80, 100, 80, 20),
  },
  sentence(2, left, "Study design and setting.", "연구 설계 및 환경."),
  sentence(3, left, "The study was designed as a cohort study.", "코호트 연구로 설계되었다."),
  sentence(4, left, "It ran at one site.", "한 기관에서 수행되었다."),
  sentence(5, left, "The study flow chart is in Fig. 2.", "연구 흐름도는 그림 2에 있다."),
  sentence(6, left, "Admissions before 2008 were excluded.", "2008년 이전 입원은 제외되었다."),
  sentence(7, left, "Artifact removal.", "아티팩트 제거."),
  sentence(8, left, "Artifacts were corrected.", "아티팩트를 보정했다."),
  sentence(
    9,
    left,
    "Four main types were identified: • Timestamp artifacts.",
    "네 가지 주요 유형이 확인되었다: 타임스탬프 아티팩트(Timestamp artifacts).",
  ),
  sentence(
    10,
    left,
    "Time fields were swapped in some rows.",
    "일부 행에서 시간 필드가 뒤바뀌었다.",
  ),
  sentence(
    1,
    right,
    "and the rest of the sentence continues here.",
    "문장의 나머지가 여기 이어진다.",
  ),
  sentence(2, right, "Another sentence follows.", "다른 문장이 뒤따른다."),
]

describe("paragraph-faithful translation layout", () => {
  const regions = paragraphRegions(translations, page)
  const byId = new Map(regions.map((region) => [region.id, region]))

  it("gives every source paragraph its own translation, in its own box", () => {
    expect(regions.map((region) => region.id)).toEqual([
      "page:1:block:1",
      "layout:1",
      "layout:2",
      "layout:3",
      "layout:4",
      "layout:5",
    ])
    expect(byId.get("layout:1")?.rect.x).toBeCloseTo(0.085)
    expect(byId.get("layout:5")?.translation).toBe(
      "문장의 나머지가 여기 이어진다. 다른 문장이 뒤따른다.",
    )
  })

  it("sets run-in subheadings in bold and keeps first-line indents", () => {
    expect(byId.get("layout:1")?.translation).toBe(
      "**연구 설계 및 환경.** 코호트 연구로 설계되었다. 한 기관에서 수행되었다.",
    )
    expect(byId.get("layout:1")?.typography?.indent).toBe(0)
    expect(byId.get("layout:2")?.translation).toBe(
      "연구 흐름도는 그림 2에 있다. 2008년 이전 입원은 제외되었다.",
    )
    expect(byId.get("layout:2")?.typography?.indent).toBeCloseTo(2)
  })

  it("moves a list item out of the sentence that introduced it, as a hanging list item", () => {
    expect(byId.get("layout:3")?.translation).toBe(
      "**아티팩트 제거.** 아티팩트를 보정했다. 네 가지 주요 유형이 확인되었다:",
    )
    const item = byId.get("layout:4")
    expect(item?.translation).toBe(
      "- 타임스탬프 아티팩트(Timestamp artifacts). 일부 행에서 시간 필드가 뒤바뀌었다.",
    )
    expect(item?.typography?.bullet).toBe(true)
    expect(item?.typography?.hang).toBeCloseTo(2.5)
  })

  it("keeps the source line pitch while shrinking Korean slightly", () => {
    const typography = byId.get("layout:1")?.typography
    expect(typography?.fontSize).toBeCloseTo(1.316)
    expect(typography?.lineHeight).toBeCloseTo(17 / 13.16)
  })

  it("leaves a running head glued to the first paragraph as the original", () => {
    expect(regions.flatMap((region) => region.blockIds)).not.toContain(`${left}:sentence:1`)
  })

  it("uses one region per parsed block when the page has no layout", () => {
    const { layout: _layout, ...withoutLayout } = page
    expect(paragraphRegions(translations, withoutLayout).map((region) => region.id)).toEqual([
      left,
      "page:1:block:1",
      right,
    ])
  })
})

describe("sentence to paragraph alignment", () => {
  it("tells list items apart by their opening words", () => {
    const items = [
      "Patient currently not in circulatory failure: if MAP is above 65 mmHg.",
      "Patient currently in circulatory failure: MAP is at most 65 mmHg.",
    ]
    const sentences = [...items].reverse().map((source, index) => ({
      id: `s:${index}`,
      parsedBlockId: "b",
      source,
    }))

    expect(alignSentences(sentences, items)).toEqual([1, 0])
  })

  it("cuts a translation at new lines and list markers", () => {
    expect(
      translationPieces({
        source: "We defined three states: • Patient not in failure.",
        translation: "세 가지 상태를 정의했다.\n\n- 순환부전이 아닌 환자.",
      }),
    ).toEqual([
      { translation: "세 가지 상태를 정의했다.", source: "We defined three states:" },
      { translation: "순환부전이 아닌 환자.", source: "Patient not in failure." },
    ])
  })

  it("recognises run-in subheadings but not ordinary short sentences", () => {
    expect(isRunInHeading("Study design and setting.", true)).toBe(true)
    expect(isRunInHeading("• Out of range artifacts.", true)).toBe(true)
    expect(isRunInHeading("Study design and setting.", false)).toBe(false)
    expect(isRunInHeading("Results are shown in Fig. 2.", true)).toBe(false)
    expect(isRunInHeading("We defined the following three states:", true)).toBe(false)
  })
})

/** A text run given in page pixels of the synthetic 1000 × 1400 page. */
function run(text: string, x: number, y: number, width: number, bold = false, serif = true) {
  return {
    text,
    rect: { x: x / 1_000, y: y / 1_400, width: width / 1_000, height: 14 / 1_400 },
    bold,
    serif,
  } satisfies PageTextRun
}

describe("typesetting read from the PDF's fonts", () => {
  const runs: readonly PageTextRun[] = [
    run("Methods", 80, 102, 80, true, false),
    run("Study design and setting.", 85, 127, 170, true),
    run("The study was", 260, 127, 120),
    run("Artifact removal.", 85, 227, 120),
    run("Artifacts were corrected.", 210, 227, 180),
    run("•", 85, 267, 6),
    run("Timestamp artifacts. Time fields were", 110, 267, 300),
  ]
  const regions = paragraphRegions(translations, page, runs)
  const byId = new Map(regions.map((region) => [region.id, region]))

  it("bolds a run-in subheading only where the PDF sets it bold", () => {
    expect(byId.get("layout:1")?.translation.startsWith("**연구 설계 및 환경.**")).toBe(true)
    // Regular type in the PDF, although the words look like a subheading.
    expect(byId.get("layout:3")?.translation.startsWith("아티팩트 제거.")).toBe(true)
  })

  it("follows the source's serif body and sans-serif headings", () => {
    expect(byId.get("layout:1")?.serif).toBe(true)
    expect(byId.get("page:1:block:1")?.serif).toBe(false)
  })

  it("cuts a running head PDF text ran into the first sentence", () => {
    const glued = translations.map((block) =>
      block.id === `${left}:sentence:2`
        ? {
            ...block,
            source: "Articles NATURE Study design and setting.",
            translation: "Articles NATURE 연구 설계 및 환경.",
          }
        : block,
    )
    const first = paragraphRegions(glued, page, runs).find((region) => region.id === "layout:1")

    expect(first?.translation.startsWith("**연구 설계 및 환경.**")).toBe(true)
  })

  it("leaves the reference list in its original typesetting", () => {
    const withReferences = parsedDocumentPageSchema.parse({
      ...page,
      layout: [
        ...(page.layout ?? []),
        {
          label: "paragraph_title",
          order: 7,
          bounds: bounds(540, 300, 120, 20),
          content: "## References",
        },
        {
          label: "text",
          order: 8,
          bounds: bounds(540, 325, 420, 35),
          content: "59. Ye, L. & Keogh, E. in Proceedings of KDD 947-956 (2009).",
        },
      ],
      blocks: [...page.blocks, line(13, 545, 327, "59. Ye, L. & Keogh, E. in Proceedings of KDD")],
    })
    const reference = sentence(
      3,
      right,
      "59. Ye, L. & Keogh, E. in Proceedings of KDD 947-956 (2009).",
      "59. Ye, L. & Keogh, E. KDD 학술대회 논문집 947-956 (2009).",
    )

    const placed = paragraphRegions([...translations, reference], withReferences, runs)

    expect(placed.map((region) => region.id)).not.toContain("layout:8")
  })

  it("keeps a paragraph within its column when a caption spans the page", () => {
    const withCaption = parsedDocumentPageSchema.parse({
      ...page,
      blocks: [
        ...page.blocks,
        line(14, 85, 320, "Fig. 1 | A caption running across both columns of the page.", 800),
      ],
    })
    const first = paragraphRegions(translations, withCaption, runs).find(
      (region) => region.id === "layout:1",
    )

    expect(first?.rect.width).toBeLessThan(0.45)
  })

  it("places a translated caption and bolds its lead as the PDF does", () => {
    const withCaption = parsedDocumentPageSchema.parse({
      ...page,
      layout: [
        ...(page.layout ?? []),
        {
          label: "figure_title",
          order: 9,
          bounds: bounds(540, 400, 420, 35),
          content: "Fig. 1 | Validation results. Curves show the held-out split.",
        },
      ],
      blocks: [...page.blocks, line(15, 545, 402, "Fig. 1 | Validation results. Curves show the")],
    })
    const caption = {
      ...sentence(
        1,
        "page:1:block:15",
        "Fig. 1 | Validation results. Curves show the held-out split.",
        "그림 1 | 검증 결과. 곡선은 보류된 분할을 보여준다.",
      ),
      id: "page:1:block:15",
    }
    const placed = paragraphRegions([...translations, caption], withCaption, [
      ...runs,
      run("Fig. 1 | Validation results.", 545, 402, 200, true),
      run("Curves show the", 750, 402, 120),
    ]).find((region) => region.id === "layout:9")

    expect(placed?.translation).toBe("**그림 1 | 검증 결과.** 곡선은 보류된 분할을 보여준다.")
  })
})

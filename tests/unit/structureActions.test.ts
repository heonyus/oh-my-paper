import { describe, expect, it, vi } from "vitest"
import { createStructureActionHandler } from "../../src/renderer/lib/structureActions"
import { structureFailureBody } from "../../src/renderer/lib/structureCardState"
import type { DetectedStructure } from "../../src/renderer/lib/structureDetector"
import type { AiRequestRunner } from "../../src/renderer/types"
import { type BoardCard, documentIdSchema } from "../../src/shared/schemas"

function sized(element: HTMLElement, width: number, height: number): HTMLElement {
  element.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height }) as DOMRect
  Object.defineProperty(element, "offsetWidth", { value: width })
  Object.defineProperty(element, "offsetHeight", { value: height })
  return element
}

const section: DetectedStructure = {
  id: "section-2",
  kind: "section",
  page: 1,
  title: "2. Methods 해설",
  quote: "2. Methods",
  bounds: { x: 40, y: 60, width: 200, height: 20 },
}

describe("structure explanation cards", () => {
  it("asks again when a structure whose explanation failed is clicked again", async () => {
    const viewer = document.createElement("div")
    const page = sized(document.createElement("div"), 800, 1_000)
    page.className = "page"
    page.setAttribute("data-page-number", "1")
    viewer.append(page)
    let cards: readonly BoardCard[] = []
    const onAiRequest = vi
      .fn<AiRequestRunner>()
      .mockRejectedValueOnce(new DOMException("switched papers", "AbortError"))
      .mockResolvedValueOnce("# 방법\n\n표본과 절차를 설명한다.")
    const handle = createStructureActionHandler({
      documentId: documentIdSchema.parse("aabbccddeeff0011"),
      currentPaperTitle: "Paper",
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportElement: viewer as HTMLDivElement,
      worldElement: sized(document.createElement("div"), 2_000, 3_000) as HTMLDivElement,
      getCards: () => cards,
      commitCards: (next) => {
        cards = next
      },
      onViewportChange: () => {},
      onCardActivated: () => {},
      onCardStream: () => {},
      onCardStreamEnd: () => {},
      onAiRequest,
    })

    handle(section)
    await vi.waitFor(() =>
      expect(cards[0]).toMatchObject({ loading: false, body: structureFailureBody }),
    )

    handle(section)
    await vi.waitFor(() =>
      expect(cards[0]).toMatchObject({
        loading: false,
        title: "방법",
        body: "표본과 절차를 설명한다.",
      }),
    )
    expect(cards).toHaveLength(1)

    // A finished explanation is kept: clicking again only brings its card forward.
    handle(section)
    expect(onAiRequest).toHaveBeenCalledTimes(2)
  })
})

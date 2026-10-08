import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import {
  clearActiveDocumentAst,
  setActiveDocumentAst,
  waitForDocumentAst,
} from "../../src/renderer/lib/documentAstRuntime"
import {
  formatWholePaper,
  usesWholePaper,
  wholePaperCharacterBudget,
  wholePaperText,
} from "../../src/renderer/lib/wholePaperContext"
import { documentIdSchema } from "../../src/shared/schemas"

const documentId = documentIdSchema.parse("abcdefabcdefabcd")

function page(number: number, text: string) {
  const item: TextItem = {
    str: text,
    dir: "ltr",
    transform: [10, 0, 0, 10, 40, 740],
    width: text.length * 6,
    height: 10,
    fontName: "Helvetica",
    hasEOL: false,
  }
  return { page: number, width: 600, height: 800, items: [item] }
}

afterEach(() => {
  vi.useRealTimers()
  clearActiveDocumentAst(documentId)
})

describe("whole-paper context", () => {
  it("keeps every page in reading order instead of favouring page 1", () => {
    const text = formatWholePaper(["Title and abstract", "", "Methods", "Results"], 10_000)

    expect(text.startsWith("FULL PAPER TEXT in reading order: all 4 pages.")).toBe(true)
    expect(text.indexOf("[Page 1]")).toBeLessThan(text.indexOf("[Page 3]"))
    expect(text.indexOf("[Page 3]")).toBeLessThan(text.indexOf("[Page 4]"))
    expect(text).not.toContain("[Page 2]")
  })

  it("drops whole trailing pages at the budget and says which pages were sent", () => {
    const pages = Array.from({ length: 10 }, (_, index) => `page ${index + 1} `.repeat(40))

    const text = formatWholePaper(pages, 1_500)

    expect(text).toMatch(/^FULL PAPER TEXT in reading order: pages 1-\d of 10\. Later pages/)
    expect(text).toContain("[Page 1]")
    expect(text).not.toContain("[Page 10]")
    expect(formatWholePaper(pages, 10)).toBe("")
  })

  it("sizes the paper by connection and covers chat and the paper-level tools", () => {
    expect(
      wholePaperCharacterBudget({ mode: "claude", claudeModel: "claude-sonnet-5-5" }),
    ).toBeGreaterThanOrEqual(500_000)
    expect(wholePaperCharacterBudget({ mode: "claude" })).toBe(
      wholePaperCharacterBudget({ mode: "claude", claudeModel: "claude-haiku-5-5" }),
    )
    expect(wholePaperCharacterBudget({ mode: "claude", claudeModel: "claude-haiku-4-5" })).toBeLessThan(
      wholePaperCharacterBudget({ mode: "claude", claudeModel: "claude-sonnet-5-5" }),
    )
    expect(wholePaperCharacterBudget({ mode: "api" })).toBeLessThan(
      wholePaperCharacterBudget({ mode: "chatgpt" }),
    )
    for (const action of ["chat", "paper_summary", "three_line_summary", "keywords"] as const)
      expect(usesWholePaper(action)).toBe(true)
    expect(usesWholePaper("explanation")).toBe(false)
  })

  it("waits for the reader to load the AST, then sends every page of it", async () => {
    const ast = buildSourceDocumentAst("a".repeat(64), [
      page(1, "Early prediction of circulatory failure"),
      page(2, "Patient variables and preprocessing"),
      page(3, "External validation results"),
    ])
    const pending = wholePaperText(documentId, 10_000)
    setActiveDocumentAst(documentId, ast)

    const text = await pending
    expect(text).toContain("all 3 pages")
    expect(text).toContain("[Page 2]\nPatient variables and preprocessing")
    expect(text).toContain("[Page 3]\nExternal validation results")
  })

  it("gives up waiting for an AST after the timeout", async () => {
    vi.useFakeTimers()
    clearActiveDocumentAst(documentId)
    const timedOut = waitForDocumentAst(documentId, 1_000)
    vi.advanceTimersByTime(1_000)
    await expect(timedOut).resolves.toBeNull()
  })
})

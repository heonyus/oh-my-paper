import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CitationPanel } from "../../src/renderer/components/CitationPanel"
import { documentRecordSchema } from "../../src/shared/schemas"

const documentFixture = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 12,
  title: "Paper",
  authors: ["Researcher"],
  year: 2026,
  doi: null,
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

describe("CitationPanel", () => {
  it("verifies identity, assesses reading value, and saves the result", async () => {
    Object.defineProperty(window, "scourgify", {
      configurable: true,
      value: {
        lookupCitation: vi.fn(async () => ({
          status: "found",
          query: "Cited Paper",
          match: { score: 0.98, signals: ["title similarity 100%"], candidatesCompared: 3 },
          paper: {
            paperId: "paper-1",
            title: "Cited Paper",
            authors: ["Jane Doe"],
            year: 2024,
            venue: "KDD",
            abstract: "A method paper.",
            doi: "10.1234/cited-paper",
            url: "https://example.org/cited-paper",
            openAccessUrl: null,
            citationCount: 12,
          },
        })),
      },
    })
    const assessment = {
      breakdown: {
        dependency: 30,
        methodological: 25,
        conceptual: 20,
        evidentiary: 12,
        contextSufficiency: 9,
      },
      confidence: 0.95,
      citationReason: "핵심 방법을 직접 채택했습니다.",
      readingValue: "방법 전체를 정독해야 합니다.",
      reasons: ["방법 의존성이 높습니다."],
      recommendedSections: ["full_text"],
      limitations: [],
    }
    const onSave = vi.fn()
    render(
      <CitationPanel
        document={documentFixture}
        citations={[
          {
            key: "1",
            title: "Cited Paper",
            authors: "Jane Doe",
            year: 2024,
            venue: "KDD",
            rawText: "[1] Cited Paper",
            doi: null,
            contexts: [{ page: 2, text: "We directly adopt the method from [1]." }],
          },
        ]}
        onAiRequest={vi.fn(async () => JSON.stringify(assessment))}
        onSave={onSave}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /논문 확인·판독/u }))
    expect((await screen.findAllByText("정독")).length).toBeGreaterThan(0)
    expect(screen.getByText(/신원 일치 98%/u)).toBeVisible()
    expect(screen.getByText("96/100")).toBeVisible()
    expect(screen.getByText("현재 논문 의존도")).toBeVisible()
    expect(screen.getByRole("button", { name: "실제 논문 열기" })).toBeVisible()
    expect(screen.getByRole("textbox", { name: "Cited Paper 질문" })).not.toHaveAttribute(
      "placeholder",
    )
    await userEvent.click(screen.getByRole("button", { name: /보드에 저장/u }))
    expect(onSave).toHaveBeenCalledOnce()
    Reflect.deleteProperty(window, "scourgify")
  })
})

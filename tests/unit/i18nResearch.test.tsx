import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CitationItem } from "../../src/renderer/components/CitationItem"
import { PaperDiscussion } from "../../src/renderer/components/PaperDiscussion"
import { ScholarSearchSteps } from "../../src/renderer/components/ScholarSearchSteps"
import { LocaleProvider } from "../../src/renderer/lib/locale"
import { citationMessages } from "../../src/renderer/messages/citations"
import { researchMessages } from "../../src/renderer/messages/research"
import { scholarMessages } from "../../src/renderer/messages/scholar"
import { memoryMessages } from "../../src/shared/memoryMessages"
import { memoryOriginLabel, memoryStateLabel } from "../../src/shared/memorySchemas"
import { researchViewMessages } from "../../src/web/research/messages"
import { ResearchComposer } from "../../src/web/research/ResearchComposer"
import { ResearchRail } from "../../src/web/research/ResearchRail"
import { expectCompleteCatalog } from "../support/i18nCatalog"

function inEnglish(children: ReactNode) {
  return render(<LocaleProvider initialPreference="en">{children}</LocaleProvider>)
}

describe("research catalogs", () => {
  it("covers every key in Korean and English", () => {
    expectCompleteCatalog(researchMessages)
    expectCompleteCatalog(citationMessages)
    expectCompleteCatalog(scholarMessages)
    expectCompleteCatalog(researchViewMessages)
    expectCompleteCatalog(memoryMessages)
  })
})

describe("research panels in English", () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (item: string) => values.get(item) ?? null,
      setItem: (item: string, value: string) => values.set(item, value),
      removeItem: (item: string) => values.delete(item),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("labels the paper discussion and settles an interrupted answer", () => {
    window.localStorage.setItem(
      "ohmypaper:discussion:aabbccddeeff0011",
      JSON.stringify([
        { id: "user-1", role: "user", content: "What is new?" },
        { id: "assistant-1", role: "assistant", content: "답변 작성 중…" },
      ]),
    )
    inEnglish(
      <PaperDiscussion
        provider={{ configured: true, provider: "openrouter", model: "test-model" }}
        documentId="aabbccddeeff0011"
        onAsk={async () => "Answer"}
      />,
    )

    expect(screen.getByRole("region", { name: "Paper discussion" })).toBeInTheDocument()
    expect(screen.getByText("You")).toBeVisible()
    expect(screen.getByText("Stopped.")).toBeVisible()
    expect(screen.getByRole("textbox", { name: "Question about this paper" })).toBeEnabled()
  })

  it("shows a citation's contexts and actions", () => {
    const authors = Array.from({ length: 24 }, (_, index) => `Author ${index + 1}, A. B.`).join(
      ", ",
    )
    inEnglish(
      <CitationItem
        entry={{
          key: "7",
          title: "Nighttime intensivist staffing and mortality among critically ill patients",
          authors,
          year: 2012,
          venue: "N. Engl. J. Med.",
          rawText: "[7] Wallace, D. J. Nighttime intensivist staffing.",
          doi: null,
          contexts: [{ page: 2, text: "Staffing matters [7]." }],
        }}
        state={undefined}
        ranked={undefined}
        onAnalyze={vi.fn()}
        onSave={vi.fn()}
        onAsk={vi.fn(async () => "")}
      />,
    )

    expect(screen.getByRole("button", { name: "Show more" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    expect(screen.getByText("Citation contexts: 1")).toBeVisible()
    expect(screen.getByRole("button", { name: "Verify and assess" })).toBeVisible()
  })

  it("describes scholarly search steps", () => {
    inEnglish(
      <ScholarSearchSteps
        steps={[
          { id: "provider-crossref", kind: "provider", provider: "crossref", status: "running" },
          {
            id: "provider-arxiv",
            kind: "provider",
            provider: "arxiv",
            status: "failed",
            detail: "rate_limited",
          },
          {
            id: "provider-openalex",
            kind: "provider",
            provider: "openalex",
            status: "done",
            found: 3,
            detail: "cached",
          },
          { id: "rank", kind: "rank", status: "done", found: 2 },
        ]}
      />,
    )

    expect(screen.getByRole("list", { name: "Search progress" })).toBeInTheDocument()
    expect(screen.getByText("Querying Crossref…")).toBeVisible()
    expect(screen.getByText("arXiv failed · rate limited")).toBeVisible()
    expect(screen.getByText("OpenAlex: 3 (cached)")).toBeVisible()
    expect(screen.getByText("Sorted by relevance · 2 passed")).toBeVisible()
  })

  it("names the research rail groups and composer controls", () => {
    const now = new Date().toISOString()
    inEnglish(
      <>
        <ResearchRail
          threads={[
            {
              id: "t1",
              title: "Memory systems",
              createdAt: now,
              updatedAt: now,
              contextDocIds: [],
              messages: [],
            },
          ]}
          activeId={null}
          onNew={vi.fn()}
          onSelect={vi.fn()}
        />
        <ResearchComposer
          documents={[]}
          attachedIds={[]}
          sending={false}
          mode="deep"
          onModeChange={vi.fn()}
          onAttach={vi.fn()}
          onDetach={vi.fn()}
          onSend={vi.fn()}
          onCancel={vi.fn()}
        />
      </>,
    )

    expect(screen.getByRole("complementary", { name: "Research chat history" })).toBeVisible()
    expect(screen.getByRole("button", { name: "New chat" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Previous 7 days" })).toBeVisible()
    expect(screen.getByRole("textbox", { name: "Research question" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Deep research" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "Start deep research" })).toBeDisabled()
  })
})

describe("memory labels", () => {
  it("stay Korean by default and read English when asked", () => {
    expect(memoryStateLabel("pending")).toBe("검토 대기")
    expect(memoryStateLabel("pending", "en")).toBe("Pending review")
    expect(memoryOriginLabel({ kind: "local_inference", modelVersion: "q4" }, "en")).toBe(
      "Local inference · q4",
    )
    expect(memoryOriginLabel({ kind: "local_inference", modelVersion: null })).toBe("로컬 추론")
  })
})

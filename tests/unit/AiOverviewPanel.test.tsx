import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ComponentProps, type JSX, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { AiOverviewPanel } from "../../src/renderer/components/AiOverviewPanel"
import { UNVERIFIED_NOTE } from "../../src/renderer/lib/ownSummaryCheck"
import type { OwnSummaryUpdate } from "../../src/renderer/lib/useOwnSummary"
import type { AiRequest } from "../../src/shared/ipc"
import type { OwnSummary } from "../../src/shared/ownSummary"
import { documentRecordSchema } from "../../src/shared/schemas"

vi.mock("../../src/renderer/lib/documentAstRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/renderer/lib/documentAstRuntime")>()),
  waitForDocumentAst: vi.fn(async () => null),
}))

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

const skipped: OwnSummary = {
  documentId: documentFixture.id,
  status: "skipped",
  afterReveal: false,
  lines: { problem: "", method: "", result: "" },
  updatedAt: "2026-09-28T00:00:00.000Z",
}

type HarnessProps = Omit<
  ComponentProps<typeof AiOverviewPanel>,
  "document" | "currentPage" | "ownSummary" | "onOwnSummaryChange" | "onSave"
> & {
  readonly initial?: OwnSummary | undefined
  readonly onSave?: ComponentProps<typeof AiOverviewPanel>["onSave"] | undefined
  readonly onOwnSummaryChange?: ((next: OwnSummaryUpdate) => void) | undefined
}

/** Feeds own-summary updates back the way the workspace does. */
function Harness({ initial, onOwnSummaryChange, onSave, ...props }: HarnessProps): JSX.Element {
  const [summary, setSummary] = useState(initial)
  return (
    <AiOverviewPanel
      {...props}
      document={documentFixture}
      currentPage={1}
      onSave={onSave ?? vi.fn()}
      ownSummary={summary}
      onOwnSummaryChange={(next) => {
        onOwnSummaryChange?.(next)
        setSummary({ ...next, documentId: documentFixture.id, updatedAt: new Date().toISOString() })
      }}
    />
  )
}

const configured = {
  configured: true,
  provider: "openrouter",
  model: "z-ai/glm-5.3-flash",
} as const

describe("AiOverviewPanel", () => {
  it("keeps the AI overview closed until the reader writes or skips", async () => {
    const onAiRequest = vi.fn(
      async (request: Omit<AiRequest, "documentId">) => `result:${request.action}`,
    )
    const onOwnSummaryChange = vi.fn()
    render(
      <Harness
        provider={configured}
        onAiRequest={onAiRequest}
        onOwnSummaryChange={onOwnSummaryChange}
      />,
    )

    expect(screen.getByRole("textbox", { name: "문제" })).toBeVisible()
    expect(screen.queryByRole("button", { name: /^3줄 요약$/u })).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onAiRequest).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "건너뛰고 AI 요약 보기" }))

    expect(onOwnSummaryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "skipped" }),
    )
    await waitFor(() => expect(onAiRequest).toHaveBeenCalledTimes(3))
    expect(screen.getByText("내 3줄을 건너뛰었습니다.")).toBeVisible()
    expect(screen.getByRole("button", { name: /^3줄 요약$/u })).toBeVisible()
  })

  it("keeps a draft without opening the overview", async () => {
    const onAiRequest = vi.fn(async () => "unused")
    const onOwnSummaryChange = vi.fn()
    render(
      <Harness
        provider={configured}
        onAiRequest={onAiRequest}
        onOwnSummaryChange={onOwnSummaryChange}
      />,
    )

    await userEvent.type(screen.getByRole("textbox", { name: "문제" }), "기억에 남는 읽기")
    await userEvent.tab()

    expect(onOwnSummaryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "draft",
        lines: expect.objectContaining({ problem: "기억에 남는 읽기" }),
      }),
    )
    expect(onAiRequest).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: /^3줄 요약$/u })).not.toBeInTheDocument()
  })

  it("checks only written lines and never asserts a verdict without evidence", async () => {
    const onAiRequest = vi.fn(async (request: Omit<AiRequest, "documentId">) =>
      request.action === "own_summary_check"
        ? JSON.stringify({
            items: [
              {
                line: "problem",
                verdict: "match",
                note: "문제 설정을 정확히 짚었습니다.",
                page: 1,
                quote: "a sentence that does not appear on any page",
              },
            ],
          })
        : `result:${request.action}`,
    )
    const onOwnSummaryChange = vi.fn()
    render(
      <Harness
        provider={configured}
        onAiRequest={onAiRequest}
        onOwnSummaryChange={onOwnSummaryChange}
      />,
    )

    await userEvent.type(screen.getByRole("textbox", { name: "문제" }), "AI 요약이 기억을 줄인다")
    await userEvent.click(screen.getByRole("button", { name: "제출하고 대조하기" }))

    await waitFor(() => expect(screen.getByText("확인 불가")).toBeVisible())
    const check = onAiRequest.mock.calls.find(([request]) => request.action === "own_summary_check")
    expect(JSON.parse(check?.[0].quote ?? "")).toEqual({ problem: "AI 요약이 기억을 줄인다" })
    expect(screen.getByText(UNVERIFIED_NOTE)).toBeVisible()
    expect(screen.queryByText("맞음")).not.toBeInTheDocument()
    expect(screen.getAllByText("떠올리지 못함")).toHaveLength(2)
    expect(onOwnSummaryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "submitted",
        afterReveal: false,
        check: expect.objectContaining({
          items: [expect.objectContaining({ line: "problem", verdict: "unverifiable" })],
        }),
      }),
    )
    await waitFor(() =>
      expect(onAiRequest.mock.calls.map(([request]) => request.action)).toEqual(
        expect.arrayContaining(["keywords", "three_line_summary", "paper_summary"]),
      ),
    )
  })

  it("reports a check that cannot be read instead of inventing a result", async () => {
    const onAiRequest = vi.fn(async (request: Omit<AiRequest, "documentId">) =>
      request.action === "own_summary_check" ? "좋은 요약입니다!" : `result:${request.action}`,
    )
    render(<Harness provider={configured} onAiRequest={onAiRequest} />)

    await userEvent.type(screen.getByRole("textbox", { name: "결과" }), "정확도가 올랐다")
    await userEvent.click(screen.getByRole("button", { name: "제출하고 대조하기" }))

    expect(await screen.findByText("대조 결과를 읽지 못했습니다. 다시 시도해주세요.")).toBeVisible()
    expect(screen.getByRole("button", { name: "원문과 대조" })).toBeEnabled()
  })

  it("generates the overview once revealed and can save it to the board", async () => {
    const onAiRequest = vi.fn(
      async (_request: Omit<AiRequest, "documentId">) => "1. 문제\n2. 방법\n3. 결과",
    )
    const onSave = vi.fn()
    render(
      <Harness
        initial={skipped}
        provider={{ configured: true, provider: "openai", model: "gpt-5" }}
        onAiRequest={onAiRequest}
        onSave={onSave}
      />,
    )

    await waitFor(() => expect(onAiRequest).toHaveBeenCalledTimes(3))
    expect((await screen.findAllByText("문제")).length).toBeGreaterThan(0)
    expect(onAiRequest.mock.calls.map(([request]) => request.action)).toContain(
      "three_line_summary",
    )
    await userEvent.click(screen.getByRole("button", { name: "3줄 요약 보드에 저장" }))
    expect(onSave).toHaveBeenCalledWith("3줄 요약", "1. 문제\n2. 방법\n3. 결과")
  })

  it("restores cached insights without another provider request", () => {
    const onAiRequest = vi.fn(async () => "unused")
    render(
      <Harness
        initial={skipped}
        provider={configured}
        cachedInsights={[
          {
            documentId: documentFixture.id,
            kind: "keywords",
            value: "**캐시된 키워드**",
            updatedAt: "2026-08-28T00:00:00.000Z",
          },
          {
            documentId: documentFixture.id,
            kind: "threeLines",
            value: "1. 캐시된 세 줄",
            updatedAt: "2026-08-28T00:00:00.000Z",
          },
          {
            documentId: documentFixture.id,
            kind: "summary",
            value: "**캐시된 요약**",
            updatedAt: "2026-08-28T00:00:00.000Z",
          },
        ]}
        onAiRequest={onAiRequest}
      />,
    )

    expect(screen.getByText("캐시된 요약").tagName).toBe("STRONG")
    expect(onAiRequest).not.toHaveBeenCalled()
  })

  it("adopts insights cached while the panel is mounted", () => {
    const onAiRequest = vi.fn(async () => "unused")
    const unconfigured = {
      configured: false,
      provider: "openrouter",
      model: "z-ai/glm-5.3-flash",
    } as const
    const { rerender } = render(
      <Harness initial={skipped} provider={unconfigured} onAiRequest={onAiRequest} />,
    )

    rerender(
      <Harness
        initial={skipped}
        provider={unconfigured}
        cachedInsights={[
          {
            documentId: documentFixture.id,
            kind: "keywords",
            value: "캐시된 키워드",
            updatedAt: "2026-08-28T00:00:00.000Z",
          },
          {
            documentId: documentFixture.id,
            kind: "threeLines",
            value: "1. 캐시된 세 줄",
            updatedAt: "2026-08-28T00:00:00.000Z",
          },
          {
            documentId: documentFixture.id,
            kind: "summary",
            value: "**뒤늦게 저장된 요약**",
            updatedAt: "2026-08-30T00:00:00.000Z",
          },
        ]}
        onAiRequest={onAiRequest}
      />,
    )

    expect(screen.getByText("뒤늦게 저장된 요약")).toBeVisible()
    expect(onAiRequest).not.toHaveBeenCalled()
  })

  it("sends chat history within the request schema's bounds", async () => {
    const saved = Array.from({ length: 30 }, (_, index) => ({
      id: `entry-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: index === 29 ? "긴 답변 ".repeat(1_500) : `message ${index}`,
    }))
    const values = new Map([[`ohmypaper:discussion:${documentFixture.id}`, JSON.stringify(saved)]])
    vi.stubGlobal("localStorage", {
      getItem: (item: string) => values.get(item) ?? null,
      setItem: (item: string, value: string) => values.set(item, value),
    })
    const onAiRequest = vi.fn(async (_request: Omit<AiRequest, "documentId">) => "답변")
    render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={3}
        provider={{ configured: true, provider: "anthropic", model: "claude-sonnet-5" }}
        ownSummary={undefined}
        onOwnSummaryChange={vi.fn()}
        onAiRequest={onAiRequest}
        onSave={vi.fn()}
      />,
    )

    await userEvent.type(screen.getByRole("textbox", { name: "논문 토론 질문" }), "변수는?")
    await userEvent.click(screen.getByRole("button", { name: "토론 질문 보내기" }))

    await waitFor(() => expect(onAiRequest).toHaveBeenCalledOnce())
    const request = onAiRequest.mock.calls[0]?.[0]
    expect(request).toMatchObject({ action: "chat", quote: "변수는?", page: 3 })
    expect(request?.history?.length).toBeLessThanOrEqual(24)
    expect(request?.history?.every((message) => message.content.length <= 4_000)).toBe(true)
    vi.unstubAllGlobals()
  })

  it("uses a quiet text disclosure and an empty discussion composer", async () => {
    render(
      <Harness
        initial={skipped}
        provider={configured}
        cachedInsights={[
          {
            documentId: documentFixture.id,
            kind: "summary",
            value: "긴 요약 ".repeat(60),
            updatedAt: "2026-08-28T00:00:00.000Z",
          },
        ]}
        onAiRequest={vi.fn(async () => "unused")}
      />,
    )

    expect(screen.queryByText("전체 보기")).not.toBeInTheDocument()
    const titleToggle = screen.getByRole("button", { name: /^요약$/u })
    expect(titleToggle).toHaveAttribute("aria-expanded", "true")
    expect(titleToggle).toHaveAttribute("aria-controls")
    const disclosure = screen.getByRole("button", { name: "요약 전체 내용 펼치기" })
    expect(disclosure).toHaveTextContent("더 보기")
    await userEvent.click(disclosure)
    expect(screen.getByRole("button", { name: "요약 접기" })).toBeVisible()
    const controlledId = titleToggle.getAttribute("aria-controls")
    if (!controlledId) throw new Error("insight toggle must reference its body")
    await userEvent.click(titleToggle)
    expect(titleToggle).toHaveAttribute("aria-expanded", "false")
    expect(document.getElementById(controlledId)).toHaveAttribute("hidden")
    expect(screen.getByRole("textbox", { name: "논문 토론 질문" })).not.toHaveAttribute(
      "placeholder",
    )
    expect(screen.queryByRole("heading", { name: "토론" })).not.toBeInTheDocument()
  })

  it("distinguishes a configured provider request failure from missing setup", async () => {
    render(
      <Harness
        initial={skipped}
        provider={configured}
        onAiRequest={vi.fn(async () => {
          throw new Error("request failed")
        })}
      />,
    )

    expect(
      await screen.findAllByText("요청을 완료하지 못했습니다. 다시 시도해주세요."),
    ).toHaveLength(3)
    expect(screen.queryByText("AI 설정을 확인해주세요.")).not.toBeInTheDocument()
  })

  it("does not show a redundant With AI heading", () => {
    render(
      <Harness
        provider={{ configured: false, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        onAiRequest={vi.fn(async () => "unused")}
      />,
    )

    expect(screen.queryByRole("heading", { name: "With AI" })).not.toBeInTheDocument()
  })
})

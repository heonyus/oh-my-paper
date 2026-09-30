import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AiOverviewPanel } from "../../src/renderer/components/AiOverviewPanel"
import type { AiRequest } from "../../src/shared/ipc"
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

describe("AiOverviewPanel", () => {
  it("generates the overview on open and can save it to the board", async () => {
    const onAiRequest = vi.fn(
      async (_request: Omit<AiRequest, "documentId">) => "1. 문제\n2. 방법\n3. 결과",
    )
    const onSave = vi.fn()
    render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
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

  it("shows keywords as tags that open their definition", async () => {
    render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: true, provider: "openai", model: "gpt-5" }}
        onAiRequest={vi.fn(async () => "unused")}
        onSave={vi.fn()}
        cachedInsights={[
          {
            documentId: documentFixture.id,
            kind: "keywords",
            value:
              "# 핵심 용어\n\n- **circEWS**: 순환부전 조기 경보 시스템.\n- **AUPRC**: 정밀도-재현율 곡선 아래 면적.",
            updatedAt: "2026-09-30T00:00:00.000Z",
          },
        ]}
      />,
    )

    const tag = screen.getByRole("button", { name: "circEWS" })
    expect(screen.getByRole("button", { name: "AUPRC" })).toBeInTheDocument()
    expect(screen.queryByText("핵심 용어")).not.toBeInTheDocument()
    expect(screen.queryByText("순환부전 조기 경보 시스템.")).not.toBeInTheDocument()

    await userEvent.click(tag)
    expect(tag).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("순환부전 조기 경보 시스템.")).toBeInTheDocument()
    await userEvent.click(tag)
    expect(screen.queryByText("순환부전 조기 경보 시스템.")).not.toBeInTheDocument()
  })

  it("restores cached insights without another provider request", () => {
    const onAiRequest = vi.fn(async () => "unused")
    render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: true, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
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
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByText("캐시된 요약").tagName).toBe("STRONG")
    expect(onAiRequest).not.toHaveBeenCalled()
  })

  it("adopts insights cached while the panel is mounted", () => {
    const onAiRequest = vi.fn(async () => "unused")
    const { rerender } = render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: false, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        onAiRequest={onAiRequest}
        onSave={vi.fn()}
      />,
    )

    rerender(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: false, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
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
        onSave={vi.fn()}
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
        cachedInsights={(["keywords", "threeLines", "summary"] as const).map((kind) => ({
          documentId: documentFixture.id,
          kind,
          value: "cached",
          updatedAt: "2026-08-28T00:00:00.000Z",
        }))}
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
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: true, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        cachedInsights={[
          {
            documentId: documentFixture.id,
            kind: "summary",
            value: "긴 요약 ".repeat(60),
            updatedAt: "2026-08-28T00:00:00.000Z",
          },
        ]}
        onAiRequest={vi.fn(async () => "unused")}
        onSave={vi.fn()}
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

  it("generates missing overview sections automatically", async () => {
    const onAiRequest = vi.fn(
      async (request: Omit<AiRequest, "documentId">) => `result:${request.action}`,
    )
    const onInsightChange = vi.fn()
    render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: true, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        onAiRequest={onAiRequest}
        onInsightChange={onInsightChange}
        onSave={vi.fn()}
      />,
    )

    await waitFor(() => expect(onAiRequest).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(onInsightChange).toHaveBeenCalledTimes(3))
    expect(screen.queryByRole("button", { name: "생성하기" })).not.toBeInTheDocument()
  })

  it("distinguishes a configured provider request failure from missing setup", async () => {
    render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: true, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        onAiRequest={vi.fn(async () => {
          throw new Error("request failed")
        })}
        onSave={vi.fn()}
      />,
    )

    expect(
      await screen.findAllByText("요청을 완료하지 못했습니다. 다시 시도해주세요."),
    ).toHaveLength(3)
    expect(screen.queryByText("AI 설정을 확인해주세요.")).not.toBeInTheDocument()
  })

  it("does not show a redundant With AI heading", () => {
    render(
      <AiOverviewPanel
        document={documentFixture}
        currentPage={1}
        provider={{ configured: false, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        onAiRequest={vi.fn(async () => "unused")}
        onSave={vi.fn()}
      />,
    )

    expect(screen.queryByRole("heading", { name: "With AI" })).not.toBeInTheDocument()
  })
})

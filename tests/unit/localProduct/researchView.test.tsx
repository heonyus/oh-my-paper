import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ResearchReportEditor } from "../../../src/renderer/components/research/ResearchReportEditor"
import { ResearchView } from "../../../src/renderer/components/research/ResearchView"
import type { ResearchApi } from "../../../src/shared/researchIpc"
import {
  type ResearchJobSnapshot,
  researchJobSnapshotSchema,
} from "../../../src/shared/researchJobSchemas"

const preview = researchJobSnapshotSchema.parse({
  id: "123e4567-e89b-42d3-a456-426614174020",
  input: {
    question: "What evidence is available?",
    provider: "codex_subscription",
    scope: { external: true, localSourceIds: [] },
    budgets: { searchRounds: 5, sources: 20, minutes: 15, modelTurns: 20 },
  },
  status: "awaiting_start",
  phase: "preview",
  pauseReason: null,
  error: null,
  counts: { searchRounds: 0, sourcesAttempted: 0, sourcesRetrieved: 0, modelTurns: 0 },
  sources: [],
  discoveredSources: [],
  requests: [],
  checkpoint: { localSourceIndex: 0, searchComplete: false, nextSourceIndex: 0 },
  nextQuery: "What evidence is available?",
  report: null,
  reportNodeId: null,
  providerUsage: { state: "unknown" },
  warnings: [],
  elapsedMs: 0,
  activeSince: null,
  startedAt: null,
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
})

describe("ResearchView consent boundary", () => {
  it("shows the unreviewed AI draft notice beside editable report text", () => {
    const reportJob = researchJobSnapshotSchema.parse({
      ...preview,
      status: "completed",
      phase: "report_ready",
      report: {
        title: "AI report",
        markdown: "> AI가 작성한 초안입니다.",
        citations: [],
        partial: false,
      },
    })

    render(
      <ResearchReportEditor
        job={reportJob}
        title="AI report"
        markdown={reportJob.report?.markdown ?? ""}
        onTitle={vi.fn()}
        onMarkdown={vi.fn()}
        onSave={vi.fn(async () => undefined)}
      />,
    )

    expect(
      screen.getByText("AI가 작성한 초안입니다. 인용과 해석을 원문에서 확인하세요."),
    ).toBeVisible()
    expect(screen.getByDisplayValue("> AI가 작성한 초안입니다.")).toBeVisible()
  })

  it("previews without work and requires a second explicit action to start", async () => {
    // Given
    const user = userEvent.setup()
    const api: ResearchApi = {
      list: vi.fn(async () => []),
      preview: vi.fn(async () => preview),
      status: vi.fn(async () => preview),
      start: vi.fn(async () => preview),
      cancel: vi.fn(async () => preview),
      resume: vi.fn(async () => preview),
      saveReport: vi.fn(async () => preview),
    }
    render(<ResearchView research={api} />)

    // Then
    expect(api.preview).not.toHaveBeenCalled()
    expect(api.start).not.toHaveBeenCalled()

    // When
    await user.type(screen.getByLabelText("조사 질문"), "What evidence is available?")
    await user.click(screen.getByRole("button", { name: "범위 미리보기" }))

    // Then
    const start = await screen.findByRole("button", { name: "조사 시작" })
    expect(start).toBeDisabled()
    expect(api.start).not.toHaveBeenCalled()

    // When
    await user.click(
      screen.getByLabelText("위 범위 안에서 자료 본문 읽기, 검색, AI 실행을 허용합니다."),
    )
    await user.click(start)

    // Then
    expect(api.start).toHaveBeenCalledWith({ jobId: preview.id })
  })

  it("restores paused jobs from the local history list", async () => {
    // Given
    const paused = researchJobSnapshotSchema.parse({
      ...preview,
      status: "paused",
      phase: "searching",
      pauseReason: "search_unavailable",
      sources: [
        {
          id: "123e4567-e89b-42d3-a456-426614174021",
          title: "Structured result",
          url: "https://example.org/evidence",
          finalUrl: "https://example.org/evidence",
          page: null,
          snippet: "Search metadata only",
          access: "metadata_only",
          origin: "web",
          contentType: null,
          byteLength: 0,
          contentHash: null,
          content: null,
          fetchedAt: null,
        },
      ],
    })
    const api: ResearchApi = {
      list: vi.fn(async () => [paused]),
      preview: vi.fn(async () => preview),
      status: vi.fn(async () => paused),
      start: vi.fn(async () => paused),
      cancel: vi.fn(async () => paused),
      resume: vi.fn(async () => paused),
      saveReport: vi.fn(async () => paused),
    }
    const user = userEvent.setup()
    render(<ResearchView research={api} />)

    // When
    await user.click(await screen.findByRole("button", { name: "복원" }))

    // Then
    expect(screen.getByText("중지 이유: search_unavailable")).toBeVisible()
    expect(screen.getByRole("button", { name: "명시적으로 재개" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Structured result" })).toHaveAttribute(
      "href",
      "https://example.org/evidence",
    )
    expect(screen.getByText(/metadata-only/)).toBeVisible()
    expect(api.resume).not.toHaveBeenCalled()
  })

  it("keeps duplicate preview submits from creating concurrent jobs", async () => {
    const api: ResearchApi = {
      list: vi.fn(async () => []),
      preview: vi.fn(() => new Promise<ResearchJobSnapshot>(() => undefined)),
      status: vi.fn(async () => preview),
      start: vi.fn(async () => preview),
      cancel: vi.fn(async () => preview),
      resume: vi.fn(async () => preview),
      saveReport: vi.fn(async () => preview),
    }
    render(<ResearchView research={api} />)
    const question = screen.getByLabelText("조사 질문")
    fireEvent.change(question, { target: { value: "A bounded preview" } })
    const form = question.closest("form")
    if (!form) throw new Error("research form missing")

    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => expect(api.preview).toHaveBeenCalledOnce())
    expect(screen.getByRole("button", { name: "미리보기 준비 중…" })).toBeDisabled()
  })

  it("disables every job mutation while one mutation is pending", async () => {
    const api: ResearchApi = {
      list: vi.fn(async () => []),
      preview: vi.fn(async () => preview),
      status: vi.fn(async () => preview),
      start: vi.fn(() => new Promise<ResearchJobSnapshot>(() => undefined)),
      cancel: vi.fn(async () => preview),
      resume: vi.fn(async () => preview),
      saveReport: vi.fn(async () => preview),
    }
    const user = userEvent.setup()
    render(<ResearchView research={api} />)
    await user.type(screen.getByLabelText("조사 질문"), "Start once")
    await user.click(screen.getByRole("button", { name: "범위 미리보기" }))
    await user.click(
      screen.getByLabelText("위 범위 안에서 자료 본문 읽기, 검색, AI 실행을 허용합니다."),
    )
    const start = screen.getByRole("button", { name: "조사 시작" })

    await user.click(start)
    fireEvent.click(start)

    expect(api.start).toHaveBeenCalledOnce()
    expect(start).toBeDisabled()
  })

  it("requires fresh consent when restoring a different job scope", async () => {
    const firstJob = researchJobSnapshotSchema.parse({
      ...preview,
      input: { ...preview.input, question: "First scope" },
    })
    const secondJob = researchJobSnapshotSchema.parse({
      ...preview,
      id: "123e4567-e89b-42d3-a456-426614174021",
      input: { ...preview.input, question: "Second scope" },
    })
    const api: ResearchApi = {
      list: vi.fn(async () => [firstJob, secondJob]),
      preview: vi.fn(async () => preview),
      status: vi.fn(async () => preview),
      start: vi.fn(async () => preview),
      cancel: vi.fn(async () => preview),
      resume: vi.fn(async () => preview),
      saveReport: vi.fn(async () => preview),
    }
    const user = userEvent.setup()
    render(<ResearchView research={api} />)
    const restores = await screen.findAllByRole("button", { name: "복원" })
    const firstRestore = restores[0]
    if (!firstRestore) throw new Error("first restore button missing")
    await user.click(firstRestore)
    const consent = screen.getByLabelText(
      "위 범위 안에서 자료 본문 읽기, 검색, AI 실행을 허용합니다.",
    )
    await user.click(consent)
    expect(consent).toBeChecked()

    const secondRestore = screen.getAllByRole("button", { name: "복원" })[1]
    if (!secondRestore) throw new Error("second restore button missing")
    await user.click(secondRestore)

    expect(consent).not.toBeChecked()
    expect(screen.getByRole("button", { name: "조사 시작" })).toBeDisabled()
  })

  it("opens validated local source URLs through the internal callback", async () => {
    // Given
    const localId = "123e4567-e89b-42d3-a456-426614174022"
    const paused = researchJobSnapshotSchema.parse({
      ...preview,
      status: "paused",
      phase: "synthesizing",
      pauseReason: "network_lost",
      sources: [
        {
          id: localId,
          title: "Canonical local note",
          url: `ohmypaper://node/${localId}`,
          finalUrl: `ohmypaper://node/${localId}`,
          page: null,
          snippet: "Local excerpt",
          access: "local_excerpt",
          origin: "local",
          contentType: "text/markdown",
          byteLength: 13,
          contentHash: "a".repeat(64),
          content: "Local excerpt",
          fetchedAt: "2026-09-06T00:00:00.000Z",
        },
      ],
    })
    const api: ResearchApi = {
      list: vi.fn(async () => [paused]),
      preview: vi.fn(async () => preview),
      status: vi.fn(async () => paused),
      start: vi.fn(async () => paused),
      cancel: vi.fn(async () => paused),
      resume: vi.fn(async () => paused),
      saveReport: vi.fn(async () => paused),
    }
    const onOpenLocalSource = vi.fn()
    const user = userEvent.setup()
    render(<ResearchView research={api} onOpenLocalSource={onOpenLocalSource} />)

    // When
    await user.click(await screen.findByRole("button", { name: "복원" }))
    await user.click(screen.getByRole("button", { name: "Canonical local note" }))

    // Then
    expect(onOpenLocalSource).toHaveBeenCalledWith(localId)
    expect(screen.queryByRole("link", { name: "Canonical local note" })).not.toBeInTheDocument()
  })

  it("stops active polling after a visible status error", async () => {
    // Given
    const running = researchJobSnapshotSchema.parse({
      ...preview,
      status: "running",
      phase: "searching",
      activeSince: "2026-09-06T00:00:00.000Z",
      startedAt: "2026-09-06T00:00:00.000Z",
    })
    const api: ResearchApi = {
      list: vi.fn(async () => [running]),
      preview: vi.fn(async () => preview),
      status: vi.fn(async () => {
        throw new Error("Status channel closed")
      }),
      start: vi.fn(async () => running),
      cancel: vi.fn(async () => running),
      resume: vi.fn(async () => running),
      saveReport: vi.fn(async () => running),
    }
    const user = userEvent.setup()
    render(<ResearchView research={api} />)
    await user.click(await screen.findByRole("button", { name: "복원" }))

    // When
    expect(await screen.findByText("Status channel closed", {}, { timeout: 1_000 })).toBeVisible()
    await new Promise((resolve) => window.setTimeout(resolve, 650))

    // Then
    expect(api.status).toHaveBeenCalledOnce()
  })

  it("does not overlap status polling while a request is still pending", async () => {
    const running = researchJobSnapshotSchema.parse({
      ...preview,
      status: "running",
      phase: "searching",
      activeSince: "2026-09-06T00:00:00.000Z",
      startedAt: "2026-09-06T00:00:00.000Z",
    })
    const api: ResearchApi = {
      list: vi.fn(async () => [running]),
      preview: vi.fn(async () => preview),
      status: vi.fn(() => new Promise<ResearchJobSnapshot>(() => undefined)),
      start: vi.fn(async () => running),
      cancel: vi.fn(async () => running),
      resume: vi.fn(async () => running),
      saveReport: vi.fn(async () => running),
    }
    const user = userEvent.setup()
    render(<ResearchView research={api} />)
    await user.click(await screen.findByRole("button", { name: "복원" }))

    await waitFor(() => expect(api.status).toHaveBeenCalledOnce())
    await new Promise((resolve) => window.setTimeout(resolve, 650))
    expect(api.status).toHaveBeenCalledOnce()
  })

  it("pauses polling while the research view is inactive", async () => {
    const running = researchJobSnapshotSchema.parse({
      ...preview,
      status: "running",
      phase: "searching",
      activeSince: "2026-09-06T00:00:00.000Z",
      startedAt: "2026-09-06T00:00:00.000Z",
    })
    const api: ResearchApi = {
      list: vi.fn(async () => [running]),
      preview: vi.fn(async () => preview),
      status: vi.fn(async () => running),
      start: vi.fn(async () => running),
      cancel: vi.fn(async () => running),
      resume: vi.fn(async () => running),
      saveReport: vi.fn(async () => running),
    }
    const user = userEvent.setup()
    render(<ResearchView research={api} active={false} />)
    await user.click(await screen.findByRole("button", { name: "복원" }))
    await new Promise((resolve) => window.setTimeout(resolve, 650))
    expect(api.status).not.toHaveBeenCalled()
  })
})

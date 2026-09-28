import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { AgentStep } from "../../src/shared/agentChat"
import { ResearchComposer } from "../../src/web/research/ResearchComposer"
import { AgentStepList } from "../../src/web/research/ResearchSteps"

function composer(overrides: Partial<Parameters<typeof ResearchComposer>[0]> = {}) {
  const props = {
    documents: [],
    attachedIds: [],
    sending: false,
    mode: "quick" as const,
    onModeChange: vi.fn(),
    onAttach: vi.fn(),
    onDetach: vi.fn(),
    onSend: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  render(<ResearchComposer {...props} />)
  return props
}

describe("ResearchComposer", () => {
  it("toggles deep research and sends the typed question", async () => {
    const props = composer()
    const toggle = screen.getByRole("button", { name: "딥리서치" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(toggle)
    expect(props.onModeChange).toHaveBeenCalledWith("deep")

    await userEvent.type(
      screen.getByRole("textbox", { name: "리서치 질문 입력" }),
      "대충 질문{Enter}",
    )
    expect(props.onSend).toHaveBeenCalledWith("대충 질문")
  })

  it("labels the deep send action and swaps it for a stop button while running", async () => {
    const { unmount } = render(
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
      />,
    )
    expect(screen.getByRole("button", { name: "딥리서치" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "딥리서치 시작" })).toBeDisabled()
    unmount()

    const props = composer({ sending: true, mode: "deep" })
    expect(screen.getByRole("button", { name: "딥리서치" })).toBeDisabled()
    await userEvent.click(screen.getByRole("button", { name: "검색 취소" }))
    expect(props.onCancel).toHaveBeenCalledOnce()
  })
})

describe("AgentStepList", () => {
  it("shows the plan interpretation, clipped queries and per-source detail", () => {
    const steps: AgentStep[] = [
      {
        id: "plan",
        kind: "plan",
        status: "done",
        queries: ["parametric memory"],
        detail: "문서를 파라미터에 기억시키는 연구",
      },
      {
        id: "search:1:s0",
        kind: "search",
        status: "done",
        query: "A".repeat(80),
        found: 12,
        detail: "OpenAlex 25",
      },
      { id: "judge:1", kind: "judge", status: "done", found: 5, detail: "후보 30편 중 5편 관련" },
    ]
    render(<AgentStepList steps={steps} />)
    expect(screen.getByText("검색 계획: 문서를 파라미터에 기억시키는 연구")).toBeVisible()
    expect(screen.getByText("parametric memory")).toBeVisible()
    expect(screen.getByText(`"${"A".repeat(60)}…" — 새 논문 12편`)).toBeVisible()
    expect(screen.getByText("OpenAlex 25")).toBeVisible()
    expect(screen.getByText("관련 논문 5편 확인")).toBeVisible()
  })
})

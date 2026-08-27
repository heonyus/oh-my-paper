import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PreparationProgress } from "../../src/renderer/components/PreparationProgress"

describe("local preparation progress", () => {
  it("announces active and completed local-only steps", () => {
    // Given / When
    render(
      <PreparationProgress
        updates={[
          { step: "pdf_check", state: "complete", message: "PDF 확인 완료" },
          { step: "text_extract", state: "active", message: "텍스트 추출 중" },
        ]}
      />,
    )

    // Then
    expect(screen.getByRole("status")).toHaveTextContent("텍스트 추출 중")
    expect(screen.getByText("PDF 확인")).toHaveAttribute("data-state", "complete")
    expect(screen.getByText("텍스트 추출")).toHaveAttribute("data-state", "active")
  })

  it("can be dismissed after preparation completes", async () => {
    const onClose = vi.fn()
    render(
      <PreparationProgress
        updates={[{ step: "ready", state: "complete", message: "보드 준비 완료" }]}
        onClose={onClose}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "준비 상태 닫기" }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LeftRail } from "../../src/renderer/components/LeftRail"

describe("LeftRail", () => {
  it("renders the 5 destinations and switches view modes", () => {
    const onViewModeChange = vi.fn()
    const onSettings = vi.fn()

    render(
      <LeftRail viewMode="reader" onViewModeChange={onViewModeChange} onSettings={onSettings} />,
    )

    expect(screen.getByRole("button", { name: "읽기" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "지식" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "연결" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "비교" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "프로젝트" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "메모리" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "논문 검색" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "지식" }))
    expect(onViewModeChange).toHaveBeenCalledWith("knowledge")

    fireEvent.click(screen.getByRole("button", { name: "연결" }))
    expect(onViewModeChange).toHaveBeenCalledWith("graph")

    fireEvent.click(screen.getByRole("button", { name: "비교" }))
    expect(onViewModeChange).toHaveBeenCalledWith("compare")

    fireEvent.click(screen.getByRole("button", { name: "프로젝트" }))
    expect(onViewModeChange).toHaveBeenCalledWith("project")

    fireEvent.click(screen.getByRole("button", { name: "설정" }))
    expect(onSettings).toHaveBeenCalledOnce()
  })

  it("marks Library as the current home without selecting Reader", () => {
    render(
      <LeftRail
        active="library"
        viewMode="reader"
        onLibrary={vi.fn()}
        onSettings={vi.fn()}
        onViewModeChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "라이브러리" })).toHaveClass("active")
    expect(screen.getByRole("button", { name: "읽기" })).not.toHaveClass("active")
  })

  it("supports fallback legacy mode without onViewModeChange", () => {
    const onLibrary = vi.fn()
    const onDocuments = vi.fn()

    render(
      <LeftRail
        active="library"
        onLibrary={onLibrary}
        onDocuments={onDocuments}
        onSettings={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "라이브러리" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "문서" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "문서" }))
    expect(onDocuments).toHaveBeenCalledOnce()
  })
})

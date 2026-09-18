import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SignIn } from "../../src/web/SignIn"

const mocks = vi.hoisted(() => ({ social: vi.fn() }))

vi.mock("../../src/web/authClient", () => ({
  authClient: { signIn: { social: mocks.social } },
}))

describe("web onboarding", () => {
  beforeEach(() => mocks.social.mockReset())

  it("explains the product and keeps the login action available immediately", () => {
    render(<SignIn />)
    const main = screen.getByRole("main")

    expect(main).not.toHaveAttribute("data-revealed")
    expect(screen.getByAltText("oh-my-paper")).toBeInTheDocument()
    expect(screen.getByText("학술 PDF 리더")).toBeVisible()
    expect(screen.getByText("번역·메모·인용을 원문 위치와 함께 정리합니다.")).toBeVisible()
    expect(screen.getByRole("link", { name: "기능 살펴보기" })).toHaveAttribute(
      "href",
      "#onboarding-story",
    )
    expect(screen.getByRole("heading", { name: "PDF의 페이지 구성을 유지합니다." })).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "현재 페이지를 문단 단위로 번역합니다." }),
    ).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "메모와 인용에 출처 위치를 남깁니다." }),
    ).toBeVisible()
    expect(screen.queryByRole("banner")).not.toBeInTheDocument()
    expect(screen.queryByText("연구 문서를 위한 개인 라이브러리")).not.toBeInTheDocument()

    const firstAction = screen.getAllByRole("button", { name: "Google로 계속" }).at(0)
    if (!firstAction) throw new Error("Primary sign-in action is missing")
    fireEvent.click(firstAction)
    expect(mocks.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/" })
  })

  it("prevents sign-in while the existing session is being checked", () => {
    render(<SignIn checking />)

    for (const action of screen.getAllByRole("button", { name: "계정 확인 중" }))
      expect(action).toBeDisabled()
    expect(mocks.social).not.toHaveBeenCalled()
  })
})

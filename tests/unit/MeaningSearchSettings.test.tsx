import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MeaningSearchSettings } from "../../src/renderer/components/MeaningSearchSettings"
import type { MeaningSearchStatus } from "../../src/shared/meaningSearch"

function withStatus(status: (prepare: boolean) => Promise<MeaningSearchStatus>): void {
  Object.defineProperty(window, "ohmypaper", {
    configurable: true,
    value: { meaningSearchStatus: status },
  })
}

afterEach(() => {
  Object.defineProperty(window, "ohmypaper", { configurable: true, value: undefined })
})

describe("MeaningSearchSettings", () => {
  it("shows the download progress of the note's source-matching model", async () => {
    withStatus(async () => ({ state: "loading", progress: 42 }))
    render(<MeaningSearchSettings />)

    expect(await screen.findByText("받는 중 42%")).toBeVisible()
    expect(screen.getByRole("progressbar", { name: /다운로드 진행률/u })).toHaveValue(42)
  })

  it("offers to fetch the model again after a failed download", async () => {
    const status = vi.fn(
      async (prepare: boolean): Promise<MeaningSearchStatus> =>
        prepare ? { state: "loading" } : { state: "failed" },
    )
    withStatus(status)
    render(<MeaningSearchSettings />)

    await userEvent.click(await screen.findByRole("button", { name: "다시 받기" }))
    expect(status).toHaveBeenCalledWith(true)
    expect(await screen.findByText("받는 중")).toBeVisible()
  })

  it("stays out of the way where the app has no local model", () => {
    Object.defineProperty(window, "ohmypaper", { configurable: true, value: {} })
    const { container } = render(<MeaningSearchSettings />)
    expect(container).toBeEmptyDOMElement()
  })
})

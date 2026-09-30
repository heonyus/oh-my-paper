import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GithubStarAnswer } from "../../src/shared/githubStar"
import { StarInvite } from "../../src/web/star/StarInvite"
import { readStarInviteState, STAR_INVITE_STORAGE_KEY } from "../../src/web/star/starInviteRules"
import { TipsGallery } from "../../src/web/tips/FeatureTips"

const REPO = "https://github.com/heonyus/oh-my-paper"
const TITLE = "oh-my-paper가 도움이 되고 있나요?"
const DAY_MS = 24 * 60 * 60 * 1000

const usedOnThreeDays = {
  documents: [
    { importedAt: "2026-09-01T12:00:00.000Z" },
    { importedAt: "2026-09-04T12:00:00.000Z" },
  ],
  readerNotes: [{ markdown: "내 말로 쓴 문장", updatedAt: "2026-09-08T12:00:00.000Z" }],
}

function wizard(answer: GithubStarAnswer | null): () => Promise<GithubStarAnswer | null> {
  return () => Promise.resolve(answer)
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
  act(() => {
    vi.advanceTimersByTime(3000)
  })
}

describe("StarInvite", () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    })
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    vi.setSystemTime(new Date("2026-09-30T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("appears after real use with a link to GitHub, and 나중에 hides it for 14 days", async () => {
    const { unmount } = render(
      <StarInvite active {...usedOnThreeDays} loadWizardAnswer={wizard(null)} />,
    )
    expect(screen.queryByRole("complementary")).toBeNull()
    await settle()

    expect(screen.getByRole("complementary", { name: TITLE })).toBeVisible()
    const star = screen.getByRole("link", { name: "⭐ 별 달기" })
    expect(star).toHaveAttribute("href", REPO)
    expect(star).toHaveAttribute("target", "_blank")
    expect(star).toHaveAttribute("rel", "noopener noreferrer")

    fireEvent.click(screen.getByRole("button", { name: "나중에" }))
    expect(screen.queryByRole("complementary")).toBeNull()
    expect(Date.parse(readStarInviteState().nextAt ?? "")).toBe(Date.now() + 14 * DAY_MS)
    unmount()

    render(<StarInvite active {...usedOnThreeDays} loadWizardAnswer={wizard(null)} />)
    await settle()
    expect(screen.queryByRole("complementary")).toBeNull()
  })

  it("never returns after 다시 보지 않기", async () => {
    const { unmount } = render(
      <StarInvite active {...usedOnThreeDays} loadWizardAnswer={wizard("skipped")} />,
    )
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "다시 보지 않기" }))
    expect(screen.queryByRole("complementary")).toBeNull()
    expect(readStarInviteState().closed).toBe("never")
    unmount()

    vi.setSystemTime(Date.now() + 60 * DAY_MS)
    render(<StarInvite active {...usedOnThreeDays} loadWizardAnswer={wizard("skipped")} />)
    await settle()
    expect(screen.queryByRole("complementary")).toBeNull()
  })

  it("remembers the click-through on ⭐ 별 달기", async () => {
    render(<StarInvite active {...usedOnThreeDays} loadWizardAnswer={wizard(null)} />)
    await settle()
    fireEvent.click(screen.getByRole("link", { name: "⭐ 별 달기" }))

    expect(screen.queryByRole("complementary")).toBeNull()
    expect(readStarInviteState().closed).toBe("opened")
  })

  it("stays away before real use, while reading, and after the wizard opened GitHub", async () => {
    const light = { documents: [{ importedAt: "2026-09-29T12:00:00.000Z" }], readerNotes: [] }
    const { rerender } = render(<StarInvite active {...light} loadWizardAnswer={wizard(null)} />)
    await settle()
    expect(screen.queryByRole("complementary")).toBeNull()

    rerender(<StarInvite active={false} {...usedOnThreeDays} loadWizardAnswer={wizard(null)} />)
    await settle()
    expect(screen.queryByRole("complementary")).toBeNull()
    expect(window.localStorage.getItem(STAR_INVITE_STORAGE_KEY)).toBeNull()
  })

  it("does not appear when the wizard already opened GitHub", async () => {
    render(<StarInvite active {...usedOnThreeDays} loadWizardAnswer={wizard("opened")} />)
    await settle()
    expect(screen.queryByRole("complementary")).toBeNull()
  })

  it("hides while a dialog or the reader takes over, and comes back in the same session", async () => {
    const { rerender } = render(
      <StarInvite active {...usedOnThreeDays} loadWizardAnswer={wizard(null)} />,
    )
    await settle()
    expect(screen.getByRole("complementary", { name: TITLE })).toBeVisible()

    rerender(<StarInvite active={false} {...usedOnThreeDays} loadWizardAnswer={wizard(null)} />)
    expect(screen.queryByRole("complementary")).toBeNull()
    rerender(<StarInvite active {...usedOnThreeDays} loadWizardAnswer={wizard(null)} />)
    expect(screen.getByRole("complementary", { name: TITLE })).toBeVisible()
  })

  it("keeps a permanent GitHub link in the 사용법 gallery", () => {
    render(<TipsGallery onClose={vi.fn()} />)
    const link = screen.getByRole("link", { name: "⭐ GitHub에서 별 달기" })
    expect(link).toHaveAttribute("href", REPO)
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")

    fireEvent.click(link)
    expect(readStarInviteState().closed).toBe("opened")
  })
})

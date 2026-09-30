// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const prompts = vi.hoisted(() => ({
  select: vi.fn<() => Promise<unknown>>(),
  cancel: Symbol("clack:cancel"),
}))

vi.mock("@clack/prompts", () => ({
  select: prompts.select,
  isCancel: (value: unknown) => value === prompts.cancel,
  log: { success: vi.fn(), info: vi.fn() },
}))
vi.mock("../../src/cli/openBrowser", () => ({ openBrowser: vi.fn() }))

import { canPrompt, type GithubCli, offerGithubStar } from "../../src/cli/onboardingStar"
import { openBrowser } from "../../src/cli/openBrowser"
import { readGithubStarAnswer } from "../../src/server/githubStarStore"

const REPO = "https://github.com/heonyus/oh-my-paper"

function fakeGh(
  loggedIn: boolean,
  starWorks = true,
): GithubCli & { star: ReturnType<typeof vi.fn> } {
  return { loggedIn: () => loggedIn, star: vi.fn(() => starWorks) }
}

const noGh = fakeGh(false)

describe("wizard GitHub star step", () => {
  let dataDir = ""

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ohmypaper-star-"))
    prompts.select.mockReset()
    vi.mocked(openBrowser).mockReset()
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it("stars with the person's gh login when they choose to", async () => {
    const gh = fakeGh(true)
    prompts.select.mockResolvedValue("starred")
    await offerGithubStar(dataDir, true, gh)

    expect(gh.star).toHaveBeenCalledOnce()
    expect(openBrowser).not.toHaveBeenCalled()
    expect(await readGithubStarAnswer(dataDir)).toBe("starred")
  })

  it("never stars when the person skips, even with a gh login", async () => {
    const gh = fakeGh(true)
    prompts.select.mockResolvedValue("skipped")
    await offerGithubStar(dataDir, true, gh)

    expect(gh.star).not.toHaveBeenCalled()
    expect(await readGithubStarAnswer(dataDir)).toBe("skipped")
  })

  it("opens the repository page when starring through gh fails", async () => {
    const gh = fakeGh(true, false)
    prompts.select.mockResolvedValue("starred")
    await offerGithubStar(dataDir, true, gh)

    expect(openBrowser).toHaveBeenCalledExactlyOnceWith(REPO)
    expect(await readGithubStarAnswer(dataDir)).toBe("opened")
  })

  it("offers the direct star only with a gh login", async () => {
    prompts.select.mockResolvedValue("skipped")
    await offerGithubStar(dataDir, true, fakeGh(true))
    const [withGh] = prompts.select.mock.calls[0] as unknown as [{ options: { value: string }[] }]
    expect(withGh.options.map((option) => option.value)).toEqual(["starred", "skipped"])

    const otherDir = await mkdtemp(join(tmpdir(), "ohmypaper-star-"))
    try {
      await offerGithubStar(otherDir, true, noGh)
    } finally {
      await rm(otherDir, { recursive: true, force: true })
    }
    const [withoutGh] = prompts.select.mock.calls[1] as unknown as [
      { options: { value: string }[] },
    ]
    expect(withoutGh.options.map((option) => option.value)).toEqual(["opened", "skipped"])
  })

  it("opens the repository page without a gh login, and never stars itself", async () => {
    prompts.select.mockResolvedValue("opened")
    await offerGithubStar(dataDir, true, noGh)

    expect(prompts.select).toHaveBeenCalledTimes(1)
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith(REPO)
    expect(await readGithubStarAnswer(dataDir)).toBe("opened")
    const stored: unknown = JSON.parse(await readFile(join(dataDir, "github-star.json"), "utf8"))
    expect(stored).toMatchObject({ answer: "opened", answeredAt: expect.any(String) })
  })

  it("does not open anything when the person skips", async () => {
    prompts.select.mockResolvedValue("skipped")
    await offerGithubStar(dataDir, true, noGh)

    expect(openBrowser).not.toHaveBeenCalled()
    expect(await readGithubStarAnswer(dataDir)).toBe("skipped")
  })

  it("treats Ctrl+C as a skip", async () => {
    prompts.select.mockResolvedValue(prompts.cancel)
    await offerGithubStar(dataDir, true, noGh)

    expect(openBrowser).not.toHaveBeenCalled()
    expect(await readGithubStarAnswer(dataDir)).toBe("skipped")
  })

  it("asks only once per data folder, whatever the answer was", async () => {
    prompts.select.mockResolvedValue("skipped")
    await offerGithubStar(dataDir, true, noGh)
    await offerGithubStar(dataDir, true, noGh)

    prompts.select.mockResolvedValue("opened")
    await offerGithubStar(dataDir, true, noGh)

    expect(prompts.select).toHaveBeenCalledTimes(1)
    expect(openBrowser).not.toHaveBeenCalled()
  })

  it("asks again only when the saved answer is unreadable", async () => {
    await writeFile(join(dataDir, "github-star.json"), "{not json")
    prompts.select.mockResolvedValue("skipped")
    await offerGithubStar(dataDir, true, noGh)

    expect(prompts.select).toHaveBeenCalledTimes(1)
    expect(await readGithubStarAnswer(dataDir)).toBe("skipped")
  })

  it("skips silently without a terminal and saves nothing", async () => {
    await offerGithubStar(dataDir, false, noGh)

    expect(prompts.select).not.toHaveBeenCalled()
    expect(openBrowser).not.toHaveBeenCalled()
    expect(await readGithubStarAnswer(dataDir)).toBeNull()
  })

  it("prompts only with a terminal on both ends and outside CI", () => {
    const tty = { isTTY: true }
    expect(canPrompt(tty, tty, {})).toBe(true)
    expect(canPrompt({ isTTY: false }, tty, {})).toBe(false)
    expect(canPrompt(tty, {}, {})).toBe(false)
    expect(canPrompt(tty, tty, { CI: "true" })).toBe(false)
    expect(canPrompt(tty, tty, { CI: "1" })).toBe(false)
    expect(canPrompt(tty, tty, { CI: "false" })).toBe(true)
    expect(canPrompt(tty, tty, { CI: "" })).toBe(true)
  })
})

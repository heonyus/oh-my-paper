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

import { canPrompt, offerGithubStar } from "../../src/cli/onboardingStar"
import { openBrowser } from "../../src/cli/openBrowser"
import { readGithubStarAnswer } from "../../src/server/githubStarStore"

const REPO = "https://github.com/heonyus/oh-my-paper"

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

  it("opens the repository page when the person chooses to star, and never stars itself", async () => {
    prompts.select.mockResolvedValue("opened")
    await offerGithubStar(dataDir, true)

    expect(prompts.select).toHaveBeenCalledTimes(1)
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith(REPO)
    expect(await readGithubStarAnswer(dataDir)).toBe("opened")
    const stored: unknown = JSON.parse(await readFile(join(dataDir, "github-star.json"), "utf8"))
    expect(stored).toMatchObject({ answer: "opened", answeredAt: expect.any(String) })
  })

  it("does not open anything when the person skips", async () => {
    prompts.select.mockResolvedValue("skipped")
    await offerGithubStar(dataDir, true)

    expect(openBrowser).not.toHaveBeenCalled()
    expect(await readGithubStarAnswer(dataDir)).toBe("skipped")
  })

  it("treats Ctrl+C as a skip", async () => {
    prompts.select.mockResolvedValue(prompts.cancel)
    await offerGithubStar(dataDir, true)

    expect(openBrowser).not.toHaveBeenCalled()
    expect(await readGithubStarAnswer(dataDir)).toBe("skipped")
  })

  it("asks only once per data folder, whatever the answer was", async () => {
    prompts.select.mockResolvedValue("skipped")
    await offerGithubStar(dataDir, true)
    await offerGithubStar(dataDir, true)

    prompts.select.mockResolvedValue("opened")
    await offerGithubStar(dataDir, true)

    expect(prompts.select).toHaveBeenCalledTimes(1)
    expect(openBrowser).not.toHaveBeenCalled()
  })

  it("asks again only when the saved answer is unreadable", async () => {
    await writeFile(join(dataDir, "github-star.json"), "{not json")
    prompts.select.mockResolvedValue("skipped")
    await offerGithubStar(dataDir, true)

    expect(prompts.select).toHaveBeenCalledTimes(1)
    expect(await readGithubStarAnswer(dataDir)).toBe("skipped")
  })

  it("skips silently without a terminal and saves nothing", async () => {
    await offerGithubStar(dataDir, false)

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

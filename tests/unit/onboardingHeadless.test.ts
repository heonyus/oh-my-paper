// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const setup = vi.hoisted(() => ({
  prompt: vi.fn(),
  ensureOcrInstall:
    vi.fn<(options?: { readonly start?: () => void }) => Promise<"ready" | "started">>(),
  recordOcrDeclined: vi.fn(),
  fetchMeaningModel: vi.fn(),
  configured: false,
}))

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn() },
  select: setup.prompt,
  confirm: setup.prompt,
  text: setup.prompt,
  password: setup.prompt,
}))
vi.mock("../../src/cli/environment", () => ({
  ensureOcrInstall: setup.ensureOcrInstall,
  recordOcrDeclined: setup.recordOcrDeclined,
  startMeaningModelFetchInBackground: setup.fetchMeaningModel,
}))
vi.mock("../../src/cli/onboarding", () => ({
  readOnboardingState: async () => ({ configured: setup.configured }),
}))

import { runHeadlessSetup } from "../../src/cli/onboardingHeadless"
import type { WebServerConfig } from "../../src/server/config"
import { readGithubStarAnswer } from "../../src/server/githubStarStore"

function configFor(dataDir: string): WebServerConfig {
  return {
    host: "127.0.0.1",
    port: 8788,
    dataDir,
    staticDir: join(dataDir, "dist-web"),
    provider: null,
    model: null,
    apiKeys: { openai: null, openrouter: null, gemini: null, groq: null },
  }
}

describe("setup without questions", () => {
  let dataDir = ""

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ohmypaper-headless-"))
    vi.spyOn(process.stdout, "write").mockReturnValue(true)
    setup.prompt.mockReset()
    setup.ensureOcrInstall.mockReset()
    setup.recordOcrDeclined.mockReset()
    setup.fetchMeaningModel.mockReset()
    setup.configured = false
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(dataDir, { recursive: true, force: true })
  })

  it("starts the engine and the note model in the background without asking anything", async () => {
    setup.ensureOcrInstall.mockResolvedValue("started")
    await runHeadlessSetup(configFor(dataDir), { ocr: true })

    expect(setup.fetchMeaningModel).toHaveBeenCalledOnce()
    expect(setup.ensureOcrInstall).toHaveBeenCalledExactlyOnceWith({})
    expect(setup.recordOcrDeclined).not.toHaveBeenCalled()
    expect(setup.prompt).not.toHaveBeenCalled()
  })

  it("with --no-ocr declines a missing engine the way the wizard's no does", async () => {
    setup.ensureOcrInstall.mockImplementation(async (options) => {
      options?.start?.()
      return "started"
    })
    await runHeadlessSetup(configFor(dataDir), { ocr: false })

    expect(setup.recordOcrDeclined).toHaveBeenCalledOnce()
    expect(setup.prompt).not.toHaveBeenCalled()
  })

  it("leaves an engine that is already there alone, even with --no-ocr", async () => {
    setup.ensureOcrInstall.mockResolvedValue("ready")
    await runHeadlessSetup(configFor(dataDir), { ocr: false })

    expect(setup.recordOcrDeclined).not.toHaveBeenCalled()
  })

  it("never asks for or gives a GitHub star, so the person's own wizard still offers it", async () => {
    setup.ensureOcrInstall.mockResolvedValue("ready")
    setup.configured = true
    await runHeadlessSetup(configFor(dataDir), { ocr: true })

    expect(setup.prompt).not.toHaveBeenCalled()
    expect(await readGithubStarAnswer(dataDir)).toBeNull()
  })
})

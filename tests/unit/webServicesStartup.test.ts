// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { DocumentAnalysisService } from "../../src/electron/documentAnalysisService"
import type { WebServerConfig } from "../../src/server/config"
import { createWebServices } from "../../src/server/services"

afterEach(() => {
  vi.restoreAllMocks()
})

it("starts serving before the analysis queue resumes and survives a failed resume", async () => {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-startup-"))
  const config: WebServerConfig = {
    host: "127.0.0.1",
    port: 8799,
    dataDir: root,
    staticDir: root,
    provider: null,
    model: null,
    apiKeys: { openai: null, openrouter: null, gemini: null, groq: null },
  }
  let finishResume: () => void = () => undefined
  const resume = vi.spyOn(DocumentAnalysisService.prototype, "resumePending").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishResume = resolve
      }),
  )
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

  try {
    // Resolves while resuming is still pending: the server can listen at once.
    const services = await createWebServices(config)
    expect(resume).toHaveBeenCalledOnce()
    finishResume()
    await services.close()

    resume.mockRejectedValueOnce(new Error("library unreadable"))
    const again = await createWebServices(config)
    await again.close()
    expect(warn).toHaveBeenCalledWith(
      "[document-analysis] could not resume the analysis queue",
      expect.any(Error),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

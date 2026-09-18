// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApplicationLocalInference } from "../../../src/electron/applicationLocalInference"

vi.mock("electron", () => ({ dialog: { showOpenDialog: vi.fn() } }))

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("application local inference mount", () => {
  it("starts without a setup file and disposes the optional engine safely", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-local-inference-"))
    roots.push(root)
    const mount = createApplicationLocalInference(root)

    await expect(mount.service.getStatus()).resolves.toMatchObject({
      enabled: false,
      setup: { status: "unavailable", reason: "setup_required" },
    })
    expect(() => {
      mount.dispose()
      mount.dispose()
    }).not.toThrow()
  })
})

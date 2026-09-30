// @vitest-environment node
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ensureOcrInstall,
  recordOcrDeclined,
  startOcrInstallInBackground,
} from "../../src/cli/environment"
import {
  describePaddleInstallProgress,
  lockHolderAlive,
  paddleInstallPaths,
  paddleInstallRunning,
  readPaddleInstallProgress,
} from "../../src/electron/paddleInstallState"

describe("PaddleOCR-VL install state", () => {
  let home = ""

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "ohmypaper-ocr-install-"))
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  async function writeLock(content: string): Promise<void> {
    const { lock } = paddleInstallPaths(home)
    await mkdir(join(home, ".ohmypaper"), { recursive: true })
    await writeFile(lock, content)
  }

  it("keeps the lock, log and progress beside the runtime folders", () => {
    expect(paddleInstallPaths(home)).toEqual({
      lock: join(home, ".ohmypaper", "paddle-vl-install.pid"),
      log: join(home, ".ohmypaper", "paddle-vl-install.log"),
      progress: join(home, ".ohmypaper", "paddle-vl-install.progress.json"),
      declined: join(home, ".ohmypaper", "paddle-vl-install.declined"),
    })
  })

  it("reads the setup's progress and says how much is left", async () => {
    expect(readPaddleInstallProgress(home)).toBeNull()
    expect(describePaddleInstallProgress(null)).toBe("준비 중")

    await mkdir(join(home, ".ohmypaper"), { recursive: true })
    const { progress } = paddleInstallPaths(home)
    await writeFile(progress, JSON.stringify({ percent: 41.6, etaSeconds: 150 }))
    const read = readPaddleInstallProgress(home)
    expect(read).toEqual({ percent: 42, etaSeconds: 150 })
    expect(describePaddleInstallProgress(read)).toBe("42% · 약 3분 남음")

    await writeFile(progress, JSON.stringify({ percent: 97, etaSeconds: 20 }))
    expect(describePaddleInstallProgress(readPaddleInstallProgress(home))).toBe(
      "97% · 1분 안에 끝남",
    )

    await writeFile(progress, JSON.stringify({ percent: 3, etaSeconds: null }))
    expect(describePaddleInstallProgress(readPaddleInstallProgress(home))).toBe("3%")

    await writeFile(progress, "{broken")
    expect(readPaddleInstallProgress(home)).toBeNull()
  })

  it("is not running without a lock", () => {
    expect(paddleInstallRunning(home)).toBe(false)
  })

  it("is running while the process in the lock is alive", async () => {
    await writeLock(`${process.pid}\n`)
    expect(paddleInstallRunning(home)).toBe(true)
  })

  it("treats a lock left by a finished process as stale", async () => {
    const finished = spawnSync(process.execPath, ["-e", ""])
    await writeLock(`${finished.pid}\n`)
    expect(paddleInstallRunning(home)).toBe(false)
  })

  it("ignores a damaged lock", async () => {
    await writeLock("not a pid")
    expect(lockHolderAlive(paddleInstallPaths(home).lock)).toBe(false)
  })

  it("starts the install detached and sends its output to the log", async () => {
    const script = join(home, "fake-setup.mjs")
    await writeFile(script, 'process.stdout.write("fake install done\\n")\n')

    const log = startOcrInstallInBackground({ home, script })

    expect(log).toBe(paddleInstallPaths(home).log)
    await expect
      .poll(async () => readFile(log, "utf8").catch(() => ""), { timeout: 10_000 })
      .toContain("fake install done")
  })

  describe("after an update or on start", () => {
    it("starts the install when the engine is missing", async () => {
      const start = vi.fn()

      await expect(ensureOcrInstall({ home, ready: async () => false, start })).resolves.toBe(
        "started",
      )
      expect(start).toHaveBeenCalledOnce()
    })

    it("leaves a ready engine and a running install alone", async () => {
      const start = vi.fn()

      await expect(ensureOcrInstall({ home, ready: async () => true, start })).resolves.toBe(
        "ready",
      )
      await writeLock(`${process.pid}\n`)
      await expect(ensureOcrInstall({ home, ready: async () => false, start })).resolves.toBe(
        "installing",
      )
      expect(start).not.toHaveBeenCalled()
    })

    it("keeps a no from the wizard until an install is asked for", async () => {
      const start = vi.fn()
      recordOcrDeclined(home)

      await expect(ensureOcrInstall({ home, ready: async () => false, start })).resolves.toBe(
        "declined",
      )
      expect(start).not.toHaveBeenCalled()

      const script = join(home, "fake-setup.mjs")
      await writeFile(script, "")
      startOcrInstallInBackground({ home, script })
      await expect(readFile(paddleInstallPaths(home).declined)).rejects.toThrow()
    })
  })
})

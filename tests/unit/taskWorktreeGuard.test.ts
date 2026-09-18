import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

type CommandResult = {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

const guardScript = join(process.cwd(), "scripts/task-worktree-guard.mjs")

function runCommand(
  command: string,
  argumentsList: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

async function runGit(argumentsList: readonly string[], cwd: string): Promise<CommandResult> {
  return runCommand("git", argumentsList, cwd)
}

async function createRepository(): Promise<string> {
  const repository = await mkdtemp(join(tmpdir(), "hotebook-task-worktree-"))
  await runGit(["init", "--quiet"], repository)
  await runGit(["config", "user.email", "test@example.invalid"], repository)
  await runGit(["config", "user.name", "Task Guard Test"], repository)
  await writeFile(join(repository, "fixture.txt"), "baseline\n", "utf8")
  await runGit(["add", "fixture.txt"], repository)
  await runGit(["commit", "--quiet", "-m", "fixture"], repository)
  return repository
}

async function runGuard(argumentsList: readonly string[], cwd: string): Promise<CommandResult> {
  return runCommand(process.execPath, [guardScript, ...argumentsList], cwd)
}

describe("task worktree guard", () => {
  it("snapshots an allowlisted file and accepts an unchanged check", async () => {
    // Given
    const repository = await createRepository()
    const baseline = join(repository, "baseline.json")

    try {
      // When
      const snapshot = await runGuard(
        ["snapshot", "--allowlist", "fixture.txt", "--out", baseline],
        repository,
      )
      const check = await runGuard(["check", "--baseline", baseline], repository)
      const manifest: unknown = JSON.parse(await readFile(baseline, "utf8"))

      // Then
      expect(snapshot.code).toBe(0)
      expect(check.code).toBe(0)
      expect(manifest).toEqual({
        commit: expect.stringMatching(/^[0-9a-f]{40}$/),
        entries: [
          {
            path: "fixture.txt",
            status: "clean",
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          },
        ],
      })
      expect(JSON.stringify(manifest)).not.toContain("baseline")
    } finally {
      await rm(repository, { recursive: true, force: true })
    }
  })

  it("reports allowlisted drift without restoring the changed file", async () => {
    // Given
    const repository = await createRepository()
    const baseline = join(repository, "baseline.json")
    const fixture = join(repository, "fixture.txt")

    try {
      await runGuard(["snapshot", "--allowlist", "fixture.txt", "--out", baseline], repository)
      await writeFile(fixture, "worker change\n", "utf8")

      // When
      const check = await runGuard(["check", "--baseline", baseline], repository)

      // Then
      expect(check.code).not.toBe(0)
      expect(check.stderr).toContain("drift")
      expect(await readFile(fixture, "utf8")).toBe("worker change\n")
    } finally {
      await rm(repository, { recursive: true, force: true })
    }
  })
})

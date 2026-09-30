// @vitest-environment node
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { syncToUpstream } from "../../src/cli/updateProgress"

const identity = {
  GIT_AUTHOR_NAME: "tester",
  GIT_AUTHOR_EMAIL: "tester@example.test",
  GIT_COMMITTER_NAME: "tester",
  GIT_COMMITTER_EMAIL: "tester@example.test",
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...identity },
  }).trim()
}

/** The published repository, a working copy that pushes to it, and an install cloned the way the installer clones. */
async function repositories(root: string) {
  const remote = join(root, "remote.git")
  const author = join(root, "author")
  const app = join(root, "app")
  git(root, "init", "--bare", "--initial-branch=main", remote)
  git(root, "init", "--initial-branch=main", author)
  git(author, "remote", "add", "origin", remote)
  await writeFile(join(author, "README.md"), "v1\n")
  git(author, "add", ".")
  git(author, "commit", "-m", "first")
  git(author, "push", "origin", "main")
  git(root, "clone", "--depth", "1", "--branch", "main", `file://${remote}`, app)
  return { remote, author, app }
}

/** Replaces the published history with an unrelated one, as a cleaned-up repository would. */
async function replaceHistory(author: string, content: string): Promise<string> {
  git(author, "checkout", "--orphan", "clean")
  await writeFile(join(author, "README.md"), content)
  git(author, "add", ".")
  git(author, "commit", "-m", "cleaned history")
  git(author, "push", "--force", "origin", "clean:main")
  return git(author, "rev-parse", "HEAD")
}

describe("update after the published history changes", () => {
  let root = ""

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ohmypaper-history-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("fast-forwards as before", async () => {
    const { author, app } = await repositories(root)
    await writeFile(join(author, "README.md"), "v2\n")
    git(author, "commit", "-am", "second")
    git(author, "push", "origin", "main")

    const result = await syncToUpstream(app, () => undefined)

    expect(result).toMatchObject({ ok: true, replaced: false })
    expect(git(app, "rev-parse", "HEAD")).toBe(git(author, "rev-parse", "HEAD"))
  })

  it("moves an unedited install to a replaced history", async () => {
    const { author, app } = await repositories(root)
    const cleaned = await replaceHistory(author, "v2 cleaned\n")

    const result = await syncToUpstream(app, () => undefined)

    expect(result).toMatchObject({ ok: true, replaced: true })
    expect(git(app, "rev-parse", "HEAD")).toBe(cleaned)
    await expect(readFile(join(app, "README.md"), "utf8")).resolves.toBe("v2 cleaned\n")
  })

  it("leaves an edited install alone and fails", async () => {
    const { author, app } = await repositories(root)
    const before = git(app, "rev-parse", "HEAD")
    await replaceHistory(author, "v2 cleaned\n")
    await writeFile(join(app, "README.md"), "my edit\n")

    const result = await syncToUpstream(app, () => undefined)

    expect(result).toMatchObject({ ok: false, replaced: false })
    expect(git(app, "rev-parse", "HEAD")).toBe(before)
    await expect(readFile(join(app, "README.md"), "utf8")).resolves.toBe("my edit\n")
  })

  it.skipIf(process.platform === "win32")(
    "installer moves an install to a replaced history too",
    async () => {
      const { author, app } = await repositories(root)
      const cleaned = await replaceHistory(author, "v2 cleaned\n")
      const installer = await readFile("scripts/install.sh", "utf8")
      const syncApp = /^sync_app\(\) \{[\s\S]*?^\}/m.exec(installer)?.[0]
      expect(syncApp).toBeTruthy()

      execFileSync("bash", ["-c", `${syncApp}\nsync_app`], {
        env: { ...process.env, ...identity, APP_DIR: app, BRANCH: "main" },
        stdio: "ignore",
      })

      expect(git(app, "rev-parse", "HEAD")).toBe(cleaned)
    },
  )
})

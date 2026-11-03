// @vitest-environment node
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/** Runs a bash script in a new session, so no terminal is attached, as in an AI agent's shell. */
function runDetached(
  script: string,
  args: readonly string[] = [],
  env: NodeJS.ProcessEnv = {},
): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", script, "install.sh", ...args], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OH_MY_PAPER_LANG: "en", ...env },
    })
    let out = ""
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.once("error", reject)
    child.once("close", (code) => resolve({ code, out }))
  })
}

describe.skipIf(process.platform === "win32")("installer", () => {
  it("finds no terminal to answer the wizard in when none is attached", async () => {
    const installer = await readFile("scripts/install.sh", "utf8")
    const hasTerminal = /^has_terminal\(\) .*$/m.exec(installer)?.[0]
    expect(hasTerminal).toBeTruthy()

    const { out } = await runDetached(
      `${hasTerminal}\nif has_terminal; then echo terminal; else echo none; fi`,
    )

    expect(out.trim()).toBe("none")
  })

  it("hands over to the Windows installer in Git Bash, with the same options", async () => {
    const installer = await readFile("scripts/install.sh", "utf8")
    const bin = await mkdtemp(join(tmpdir(), "ohmypaper-msys-"))
    // Git Bash's uname, and a powershell.exe that says what it was asked to run.
    await writeFile(join(bin, "uname"), "#!/bin/sh\necho MINGW64_NT-10.0-26100\n", { mode: 0o755 })
    await writeFile(
      join(bin, "powershell.exe"),
      '#!/bin/sh\necho "url=$OH_MY_PAPER_INSTALL_URL yes=$OH_MY_PAPER_YES no_ocr=$OH_MY_PAPER_NO_OCR"\necho "args=$*"\n',
      { mode: 0o755 },
    )
    try {
      const { code, out } = await runDetached(installer, ["--yes", "--no-ocr"], {
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        OH_MY_PAPER_BRANCH: "main",
      })

      expect(code).toBe(0)
      expect(out).toContain(
        "url=https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.ps1 yes=1 no_ocr=1",
      )
      expect(out).toContain(
        "args=-NoProfile -ExecutionPolicy Bypass -Command irm $env:OH_MY_PAPER_INSTALL_URL | iex",
      )
      expect(out).not.toContain("Installing oh-my-paper")
    } finally {
      await rm(bin, { recursive: true, force: true })
    }
  })

  it("stops before doing anything on an unknown option", async () => {
    const installer = await readFile("scripts/install.sh", "utf8")

    const { code, out } = await runDetached(installer, ["--yse"])

    expect(code).toBe(2)
    expect(out).toContain("Unknown option: --yse")
    expect(out).not.toContain("Installing oh-my-paper")
  })
})

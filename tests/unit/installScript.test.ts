// @vitest-environment node
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

/** Runs a bash script in a new session, so no terminal is attached, as in an AI agent's shell. */
function runDetached(
  script: string,
  args: readonly string[] = [],
): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", script, "install.sh", ...args], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OH_MY_PAPER_LANG: "en" },
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

  it("stops before doing anything on an unknown option", async () => {
    const installer = await readFile("scripts/install.sh", "utf8")

    const { code, out } = await runDetached(installer, ["--yse"])

    expect(code).toBe(2)
    expect(out).toContain("Unknown option: --yse")
    expect(out).not.toContain("Installing oh-my-paper")
  })
})

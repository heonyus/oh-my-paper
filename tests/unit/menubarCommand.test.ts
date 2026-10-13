// @vitest-environment node
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@clack/prompts", () => ({ log: { success: vi.fn(), warn: vi.fn() } }))

import { log } from "@clack/prompts"
import { type MenubarSystem, menubarCommand } from "../../src/cli/menubar"
import { readWebServerConfig } from "../../src/server/config"

const config = readWebServerConfig({ OH_MY_PAPER_WEB_PORT: "8790" })
const LABEL = "com.honey.oh-my-paper.menubar"

describe("oh-my-paper menubar", () => {
  let root = ""
  let appRoot = ""
  let home = ""
  let calls: string[] = []

  function system(answers: Partial<Record<string, boolean[]>> = {}): MenubarSystem {
    return {
      platform: "darwin",
      home,
      uid: 501,
      run: (command, args) => {
        const name =
          command === "launchctl" ? `launchctl ${args[0]}` : (command.split("/").at(-1) ?? "")
        calls.push([name, ...args.slice(command === "launchctl" ? 1 : 0)].join(" "))
        return { ok: answers[name]?.shift() ?? true, output: `${name} said no` }
      },
      waitForPort: async () => true,
      pause: async () => undefined,
    }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ohmypaper-menubar-"))
    appRoot = join(root, "app")
    home = join(root, "home")
    await mkdir(join(appRoot, "menubar"), { recursive: true })
    await writeFile(join(appRoot, "menubar", "main.swift"), "// companion")
    calls = []
    vi.mocked(log.success).mockReset()
    process.exitCode = undefined
  })

  afterEach(async () => {
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  })

  it("builds the companion, writes its agent for this app and port, and hands it to launchd", async () => {
    await menubarCommand(config, appRoot, undefined, system())

    const binary = join(appRoot, "menubar", "bin", "oh-my-paper-menubar")
    const plist = join(home, "Library", "LaunchAgents", `${LABEL}.plist`)
    expect(calls).toEqual([
      `swiftc -O -o ${binary} ${join(appRoot, "menubar", "main.swift")}`,
      `oh-my-paper-menubar --repo ${appRoot} --port 8790 --write-launch-agent`,
      `launchctl bootout gui/501/${LABEL}`,
      `launchctl bootstrap gui/501 ${plist}`,
    ])
    expect(log.success).toHaveBeenCalledOnce()
    expect(process.exitCode).toBeUndefined()
  })

  it("keeps a companion that is newer than its source", async () => {
    const binary = join(appRoot, "menubar", "bin", "oh-my-paper-menubar")
    await mkdir(join(appRoot, "menubar", "bin"))
    await writeFile(binary, "")
    await utimes(join(appRoot, "menubar", "main.swift"), new Date(1_000), new Date(1_000))

    await menubarCommand(config, appRoot, undefined, system())

    expect(calls.some((call) => call.startsWith("swiftc"))).toBe(false)
  })

  it("waits for launchd to let go of the agent it just stopped", async () => {
    await menubarCommand(
      config,
      appRoot,
      undefined,
      system({ "launchctl bootstrap": [false, false, true] }),
    )

    expect(calls.filter((call) => call.startsWith("launchctl bootstrap"))).toHaveLength(3)
    expect(process.exitCode).toBeUndefined()
  })

  it("stops with the compiler's words when the build fails", async () => {
    const written = vi.spyOn(process.stderr, "write").mockReturnValue(true)

    await menubarCommand(config, appRoot, undefined, system({ swiftc: [false] }))

    expect(written.mock.calls.join("")).toContain("swiftc said no")
    written.mockRestore()
    expect(calls).toHaveLength(1)
    expect(process.exitCode).toBe(1)
  })

  it("off stops the agent and forgets it", async () => {
    const plist = join(home, "Library", "LaunchAgents", `${LABEL}.plist`)
    await mkdir(join(home, "Library", "LaunchAgents"), { recursive: true })
    await writeFile(plist, "")

    await menubarCommand(config, appRoot, "off", system())

    expect(calls).toEqual([`launchctl bootout gui/501/${LABEL}`])
    expect(existsSync(plist)).toBe(false)
  })

  it("refuses anywhere but macOS", async () => {
    const written = vi.spyOn(process.stderr, "write").mockReturnValue(true)

    await menubarCommand(config, appRoot, undefined, { ...system(), platform: "linux" })

    written.mockRestore()
    expect(calls).toEqual([])
    expect(process.exitCode).toBe(1)
  })
})

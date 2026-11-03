// @vitest-environment node
import { existsSync, writeFileSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, win32 } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@clack/prompts", () => ({ log: { success: vi.fn(), warn: vi.fn() } }))

import { log } from "@clack/prompts"
import { findCsharpCompiler, type MenubarSystem, menubarCommand } from "../../src/cli/menubar"
import { readWebServerConfig } from "../../src/server/config"

const config = readWebServerConfig({ OH_MY_PAPER_WEB_PORT: "8790" })
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
const CSC = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"

describe("oh-my-paper menubar on Windows", () => {
  let root = ""
  let appRoot = ""
  let calls: string[] = []
  let launched: string[] = []

  function system(
    answers: Partial<Record<string, boolean[]>> = {},
    overrides: Partial<MenubarSystem> = {},
  ): MenubarSystem {
    return {
      platform: "win32",
      home: join(root, "home"),
      uid: 0,
      run: (command, args) => {
        const name = command.split(/[\\/]/).at(-1) ?? command
        calls.push([name, ...args].join(" "))
        // The compiler writes the program it was asked for.
        const out = args.find((arg) => arg.startsWith("/out:"))
        const ok = answers[name]?.shift() ?? true
        if (out && ok) writeFileSync(out.slice(5), "program")
        return { ok, output: `${name} said no` }
      },
      waitForPort: async () => true,
      pause: async () => undefined,
      launch: (command, args) => {
        launched.push([command.split(/[\\/]/).at(-1), ...args].join(" "))
        return true
      },
      compiler: () => CSC,
      node: "C:\\Program Files\\nodejs\\node.exe",
      localAppData: join(root, "local"),
      ...overrides,
    }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ohmypaper-tray-"))
    appRoot = join(root, "app")
    await mkdir(join(appRoot, "menubar", "windows"), { recursive: true })
    await writeFile(join(appRoot, "menubar", "windows", "OhMyPaperTray.cs"), "// companion")
    calls = []
    launched = []
    vi.mocked(log.success).mockReset()
    vi.mocked(log.warn).mockReset()
    process.exitCode = undefined
  })

  afterEach(async () => {
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  })

  it("builds the companion, stops an earlier one, records the sign-in start and starts it", async () => {
    const binary = join(appRoot, "menubar", "bin", "oh-my-paper-tray.exe")
    const fresh = join(appRoot, "menubar", "bin", "oh-my-paper-tray.new.exe")
    const source = join(appRoot, "menubar", "windows", "OhMyPaperTray.cs")

    await menubarCommand(config, appRoot, undefined, system())

    const options = `--repo ${appRoot} --port 8790 --node C:\\Program Files\\nodejs\\node.exe`
    expect(calls).toEqual([
      `csc.exe /nologo /target:winexe /optimize+ /codepage:65001 /out:${fresh} /reference:System.Windows.Forms.dll /reference:System.Drawing.dll ${source}`,
      "taskkill /IM oh-my-paper-tray.exe /T /F",
      `oh-my-paper-tray.exe ${options} --write-login-item`,
    ])
    expect(launched).toEqual([`oh-my-paper-tray.exe ${options}`])
    expect(await readFile(binary, "utf8")).toBe("program")
    expect(existsSync(fresh)).toBe(false)
    expect(log.success).toHaveBeenCalledOnce()
    expect(process.exitCode).toBeUndefined()
  })

  it("keeps a companion that is newer than its source", async () => {
    const binary = join(appRoot, "menubar", "bin", "oh-my-paper-tray.exe")
    await mkdir(join(appRoot, "menubar", "bin"))
    await writeFile(binary, "")
    await utimes(
      join(appRoot, "menubar", "windows", "OhMyPaperTray.cs"),
      new Date(1_000),
      new Date(1_000),
    )

    await menubarCommand(config, appRoot, undefined, system())

    expect(calls.some((call) => call.startsWith("csc.exe"))).toBe(false)
    expect(launched).toHaveLength(1)
  })

  it("stops with the compiler's words when the build fails, leaving a running companion be", async () => {
    const written = vi.spyOn(process.stderr, "write").mockReturnValue(true)

    await menubarCommand(config, appRoot, undefined, system({ "csc.exe": [false] }))

    expect(written.mock.calls.join("")).toContain("csc.exe said no")
    written.mockRestore()
    expect(calls).toHaveLength(1)
    expect(launched).toEqual([])
    expect(process.exitCode).toBe(1)
  })

  it("says what to turn on when Windows has no C# compiler", async () => {
    const written = vi.spyOn(process.stderr, "write").mockReturnValue(true)

    await menubarCommand(config, appRoot, undefined, system({}, { compiler: () => null }))

    expect(written.mock.calls.join("")).toContain(".NET Framework")
    written.mockRestore()
    expect(calls).toEqual([])
    expect(process.exitCode).toBe(1)
  })

  it("names the companion's log when the server is slow to answer", async () => {
    await menubarCommand(config, appRoot, undefined, system({}, { waitForPort: async () => false }))

    expect(String(vi.mocked(log.warn).mock.calls[0]?.[0])).toContain(
      join(root, "local", "oh-my-paper", "Logs", "tray.log"),
    )
  })

  it("off stops the companion with its server and forgets the sign-in start", async () => {
    await menubarCommand(config, appRoot, "off", system())

    expect(calls).toEqual([
      "taskkill /IM oh-my-paper-tray.exe /T /F",
      `reg delete ${RUN_KEY} /v oh-my-paper /f`,
    ])
    expect(launched).toEqual([])
    expect(log.success).toHaveBeenCalledOnce()
  })
})

describe("the C# compiler", () => {
  it("is the 64-bit .NET Framework 4 one when there is one, else the 32-bit one", () => {
    const env = { SystemRoot: "C:\\Windows" }
    const x64 = win32.join("C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe")
    const x86 = win32.join("C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")

    expect(findCsharpCompiler(env, (path) => path === x64 || path === x86)).toBe(x64)
    expect(findCsharpCompiler(env, (path) => path === x86)).toBe(x86)
    expect(findCsharpCompiler(env, () => false)).toBeNull()
  })
})

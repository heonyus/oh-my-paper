// @vitest-environment node
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { tsxCommand } from "../../src/cli/environment"
import { portUnavailableMessage } from "../../src/server/portUnavailable"

describe("background TypeScript", () => {
  it("runs in this one node with tsx's loader, never through a shim or tsx's own CLI", () => {
    const [command, args] = tsxCommand("scripts/fetch-meaning-model.ts", process.cwd())

    expect(command).toBe(process.execPath)
    expect(args[0]).toBe("--import")
    // A URL: Windows would read a bare C:\ path given to --import as a scheme.
    expect(args[1]).toMatch(/^file:\/\//)
    expect(existsSync(fileURLToPath(args[1] ?? ""))).toBe(true)
    expect(args.join(" ")).not.toMatch(/\.bin|cli\.mjs/)
    expect(args[2]).toBe("scripts/fetch-meaning-model.ts")
  })
})

describe("a port the server cannot have", () => {
  it("says it is in use, or that Windows may reserve it, and how to choose another", () => {
    expect(portUnavailableMessage("EADDRINUSE", "127.0.0.1", 8788, "darwin")).toContain(
      "already in use",
    )
    const windows = portUnavailableMessage("EACCES", "127.0.0.1", 8788, "win32") ?? ""
    expect(windows).toContain("excludedportrange")
    expect(windows).toContain("OH_MY_PAPER_WEB_PORT")
    expect(portUnavailableMessage("EACCES", "127.0.0.1", 8788, "darwin")).not.toContain("netsh")
    expect(portUnavailableMessage("ECONNRESET", "127.0.0.1", 8788)).toBeNull()
  })
})

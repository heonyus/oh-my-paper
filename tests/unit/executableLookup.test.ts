// @vitest-environment node

import { describe, expect, it } from "vitest"
import { findClaudeExecutable } from "../../src/electron/claudeCliEnvironment"
import { findOnPath, pathDirectories } from "../../src/electron/executableLookup"

function existing(...paths: string[]): (path: string) => boolean {
  const files = new Set(paths)
  return (path) => files.has(path)
}

describe("executable lookup", () => {
  it("finds a command on a POSIX PATH without running which", () => {
    const found = findOnPath("uv", {
      platform: "darwin",
      env: { PATH: "/usr/bin:/Users/reader/.local/bin" },
      exists: existing("/Users/reader/.local/bin/uv"),
    })

    expect(found).toBe("/Users/reader/.local/bin/uv")
  })

  it("splits a Windows PATH on semicolons and looks for the .exe", () => {
    const env = { PATH: 'C:\\Windows\\System32;"C:\\Users\\reader\\.local\\bin";' }

    expect(pathDirectories({ platform: "win32", env })).toEqual([
      "C:\\Windows\\System32",
      "C:\\Users\\reader\\.local\\bin",
    ])
    expect(
      findOnPath("uv", {
        platform: "win32",
        env,
        exists: existing(
          "C:\\Users\\reader\\.local\\bin\\uv",
          "C:\\Users\\reader\\.local\\bin\\uv.exe",
        ),
      }),
    ).toBe("C:\\Users\\reader\\.local\\bin\\uv.exe")
  })

  it("runs the binary behind an npm claude.cmd shim on Windows", () => {
    const npm = "C:\\Users\\reader\\AppData\\Roaming\\npm"
    const binary = `${npm}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`

    const found = findClaudeExecutable(
      undefined,
      { PATH: `C:\\Windows;${npm}` },
      {
        platform: "win32",
        home: "C:\\Users\\reader",
        exists: existing(`${npm}\\claude`, `${npm}\\claude.cmd`, binary),
      },
    )

    expect(found).toBe(binary)
  })

  it("falls back to the native installer location on Windows", () => {
    const native = "C:\\Users\\reader\\.local\\bin\\claude.exe"

    expect(
      findClaudeExecutable(
        undefined,
        { PATH: "C:\\Windows" },
        { platform: "win32", home: "C:\\Users\\reader", exists: existing(native) },
      ),
    ).toBe(native)
    expect(
      findClaudeExecutable(
        undefined,
        { PATH: "C:\\Windows" },
        { platform: "win32", home: "C:\\Users\\reader", exists: existing() },
      ),
    ).toBeNull()
  })
})

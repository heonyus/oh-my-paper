// @vitest-environment node
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const installer = readFileSync("scripts/install.ps1", "utf8")
const posixInstaller = readFileSync("scripts/install.sh", "utf8")

/** What PowerShell's [regex]::Unescape makes of the installer's \u escapes. */
function decodeEscapes(text: string): string {
  return text.replace(/\\u([0-9A-Fa-f]{4})/g, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  )
}

/** Every `M 'Korean' 'English'` pair in the Windows installer, decoded. */
function windowsPairs(): Array<{ readonly ko: string; readonly en: string }> {
  return [...installer.matchAll(/\bM '([^']*)' '([^']*)'/g)].map((match) => ({
    ko: decodeEscapes(match[1] ?? ""),
    en: decodeEscapes(match[2] ?? ""),
  }))
}

/** Every `m 'Korean' 'English'` pair in install.sh. */
function posixPairs(): Map<string, string> {
  const pairs = new Map<string, string>()
  for (const match of posixInstaller.matchAll(/\bm '([^']*)' '([^']*)'/g))
    pairs.set(match[2] ?? "", match[1] ?? "")
  for (const match of posixInstaller.matchAll(/\bm "([^"]*)" "([^"]*)"/g))
    pairs.set(match[2] ?? "", match[1] ?? "")
  return pairs
}

/** The escaped form to paste into install.ps1 for a Korean line. */
function escaped(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0
      return code < 0x80 ? char : `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`
    })
    .join("")
}

describe("Windows installer", () => {
  it("stays ASCII, so Windows PowerShell 5.1 parses it under any code page", () => {
    const offending = installer
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => [...line].some((char) => (char.codePointAt(0) ?? 0) > 0x7f))
    expect(offending).toEqual([])
  })

  it("says what install.sh says, in both languages", () => {
    const posix = posixPairs()
    const pairs = windowsPairs()
    expect(pairs.length).toBeGreaterThan(20)
    const shared = pairs.filter(({ en }) => posix.has(en))
    expect(shared.length).toBeGreaterThan(15)
    for (const { ko, en } of shared) {
      const expected = posix.get(en) ?? ""
      expect(ko, `the Korean for "${en}" should be ${escaped(expected)}`).toBe(expected)
    }
  })

  it("has Korean wording for every line", () => {
    for (const { ko, en } of windowsPairs()) {
      expect(ko, `"${en}" has no Korean`).toMatch(/[가-힣]/)
    }
  })

  it("takes the same options as install.sh, and their environment-variable forms", () => {
    expect(installer).toContain("--yes")
    expect(installer).toContain("--no-ocr")
    expect(installer).toContain("OH_MY_PAPER_YES")
    expect(installer).toContain("OH_MY_PAPER_NO_OCR")
    for (const variable of [
      "OH_MY_PAPER_HOME",
      "OH_MY_PAPER_BIN_DIR",
      "OH_MY_PAPER_REPO",
      "OH_MY_PAPER_BRANCH",
      "OH_MY_PAPER_NO_ONBOARD",
    ]) {
      expect(posixInstaller).toContain(variable)
      expect(installer).toContain(variable)
    }
  })

  it("runs the same build steps as install.sh", () => {
    expect(installer).toContain("ci --no-audit --no-fund --loglevel=http --foreground-scripts")
    expect(installer).toContain("run build:web")
    expect(installer).toContain("onboard --yes --no-ocr")
    expect(installer).toContain("release-locked-files.mjs")
  })
})

describe("Windows launcher", () => {
  const launcher = readFileSync("bin/oh-my-paper.cmd", "utf8")

  it("checks out with CRLF line endings, which cmd.exe reads reliably", () => {
    expect(launcher.split("\r\n").length).toBeGreaterThan(5)
    expect(launcher.replace(/\r\n/g, "")).not.toContain("\n")
  })

  it("runs the CLI through tsx's own entry point, which exists", () => {
    expect(launcher).toContain("node_modules\\tsx\\dist\\cli.mjs")
    expect(launcher).toContain("src\\cli\\main.ts")
    expect(existsSync("node_modules/tsx/dist/cli.mjs")).toBe(true)
    const tsx = JSON.parse(readFileSync("node_modules/tsx/package.json", "utf8")) as {
      readonly bin: string | Readonly<Record<string, string>>
    }
    const bin = typeof tsx.bin === "string" ? tsx.bin : tsx.bin["tsx"]
    expect(bin?.replace(/^\.\//, "")).toBe("dist/cli.mjs")
  })

  it("passes every argument on and keeps the CLI's exit status", () => {
    expect(launcher).toContain("%*")
    expect(launcher).toMatch(/exit \/b %OH_MY_PAPER_STATUS%/)
  })
})

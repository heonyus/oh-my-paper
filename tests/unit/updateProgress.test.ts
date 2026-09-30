// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  buildSummary,
  describeUpdateLine,
  fitLine,
  gitSummary,
  isNpmFetchLine,
  npmSummary,
  runStreaming,
} from "../../src/cli/updateProgress"

describe("update progress", () => {
  it("names the package npm downloads instead of its registry URL", () => {
    expect(
      describeUpdateLine(
        "npm http fetch GET 200 https://registry.npmjs.org/@clack/prompts/-/prompts-1.8.1.tgz 31ms (cache hit)",
      ),
    ).toBe("prompts-1.8.1 · 캐시")
    expect(
      describeUpdateLine(
        "npm http fetch GET 200 https://registry.npmjs.org/vite/-/vite-7.1.2.tgz 412ms",
      ),
    ).toBe("vite-7.1.2 받는 중")
    expect(
      describeUpdateLine(
        "npm http cache @types/node@https://registry.npmjs.org/@types/node/-/node-24.3.0.tgz 0ms (cache hit)",
      ),
    ).toBe("node-24.3.0 · 캐시")
    expect(
      isNpmFetchLine("npm http fetch GET 200 https://registry.npmjs.org/a/-/a-1.tgz 1ms"),
    ).toBe(true)
  })

  it("leaves the Codex CLI download out of the progress line", () => {
    expect(
      describeUpdateLine(
        "npm http fetch GET 200 https://registry.npmjs.org/@openai/codex/-/codex-0.159.2-darwin-arm64.tgz 5234ms (cache miss)",
      ),
    ).toBeNull()
    expect(
      describeUpdateLine(
        "npm http cache @openai/codex@https://registry.npmjs.org/@openai/codex/-/codex-0.159.2.tgz 0ms (cache hit)",
      ),
    ).toBeNull()
  })

  it("passes other lines through without color codes and drops blank ones", () => {
    expect(describeUpdateLine("\u001b[32m✓\u001b[39m 1234 modules transformed.")).toBe(
      "✓ 1234 modules transformed.",
    )
    expect(describeUpdateLine("   ")).toBeNull()
  })

  it("summarizes each step in one line", () => {
    expect(npmSummary(["npm http fetch …", "added 812 packages in 41s"])).toBe("패키지 812개 · 41s")
    expect(buildSummary(["✓ 1234 modules transformed.", "✓ built in 3.94s"])).toBe(
      "모듈 1234개 · 3.94s",
    )
    expect(buildSummary(["no timing here"])).toBeNull()
    expect(gitSummary("3ed7cc4aaaa", "2e1683fbbbb", 3)).toBe("3ed7cc4 → 2e1683f · 커밋 3개")
    expect(gitSummary("abc", "abc", 0)).toBe("이미 최신")
  })

  it("keeps a line within the terminal width", () => {
    expect(fitLine("a".repeat(200), 60)).toHaveLength(52)
    expect(fitLine("short", 60)).toBe("short")
  })

  it("streams lines from both outputs, splitting progress redraws", async () => {
    const seen: string[] = []
    const result = await runStreaming(
      process.execPath,
      [
        "-e",
        'process.stdout.write("one\\rtwo\\n"); process.stderr.write("three\\n"); process.exit(2)',
      ],
      { cwd: process.cwd(), onLine: (line) => seen.push(line) },
    )
    expect(result.ok).toBe(false)
    expect(seen).toEqual(expect.arrayContaining(["one", "two", "three"]))
  })
})

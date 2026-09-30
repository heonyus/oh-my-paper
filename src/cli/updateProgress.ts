import { spawn, spawnSync } from "node:child_process"
import { t } from "./messages"

/** Plain text of one output line: no color codes, no surrounding space. */
export function plainLine(line: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escape sequences.
  return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim()
}

// npm 11 logs downloads as `npm http fetch GET 200 <url> 12ms (cache miss)` and cache reads as
// `npm http cache <name>@<url> 0ms (cache hit)`.
const NPM_FETCH = /^npm http fetch \w+ (\d{3}) (\S+) \d+ms(?: \((.+)\))?/
const NPM_CACHE = /^npm http cache \S+?@(https?:\/\/\S+) \d+ms/

function tarballName(url: string): string {
  return decodeURIComponent(url.split("/").at(-1) ?? url).replace(/\.tgz$/, "")
}

/**
 * The Codex CLI the ChatGPT sign-in runs on. It is by far the largest download, so its name
 * lingered in the progress line and read as if a separate program were being installed.
 */
const CODEX_PACKAGE = /@openai(?:\/|%2f)codex/i

/**
 * What the dim progress log shows for a line of `npm ci --loglevel=http`: a package name for each
 * download or cache read instead of its registry URL, and nothing for the Codex CLI. Other lines
 * pass through.
 */
export function describeUpdateLine(line: string): string | null {
  const text = plainLine(line)
  if (!text || CODEX_PACKAGE.test(text)) return null
  const cached = NPM_CACHE.exec(text)
  if (cached) return t("progress.cached", { name: tarballName(cached[1] ?? "") })
  const fetch = NPM_FETCH.exec(text)
  if (!fetch) return text
  const [, status, url = "", note] = fetch
  if (status !== "200") return `${tarballName(url)} (${status})`
  return note?.includes("cache hit")
    ? t("progress.cached", { name: tarballName(url) })
    : t("progress.downloading", { name: tarballName(url) })
}

export function isNpmFetchLine(line: string): boolean {
  const text = plainLine(line)
  return NPM_FETCH.test(text) || NPM_CACHE.test(text)
}

/** `패키지 812개 · 41s` from npm's closing line. */
export function npmSummary(lines: readonly string[]): string | null {
  for (const line of [...lines].reverse()) {
    const match = /added (\d+) packages?.* in ([\d.]+m?s)/.exec(plainLine(line))
    if (match) return t("progress.packages", { count: match[1] ?? "", time: match[2] ?? "" })
  }
  return null
}

/** `모듈 1234개 · 3.94s` from Vite's output. */
export function buildSummary(lines: readonly string[]): string | null {
  const text = lines.map(plainLine)
  const modules = text.map((line) => /(\d+) modules transformed/.exec(line)?.[1]).find(Boolean)
  const time = text.map((line) => /built in ([\d.]+m?s)/.exec(line)?.[1]).find(Boolean)
  if (!time) return null
  return modules ? t("progress.modules", { count: modules, time: time ?? "" }) : time
}

/** `3ed7cc4 → 2e1683f · 커밋 3개`, or `이미 최신` when nothing changed. */
export function gitSummary(before: string, after: string, commits: number): string {
  if (before === after) return t("progress.upToDate")
  return t("progress.commits", { from: before.slice(0, 7), to: after.slice(0, 7), count: commits })
}

/** Cuts a line to the terminal width so the rolling log never wraps. */
export function fitLine(line: string, columns: number): string {
  const room = Math.max(20, columns - 8)
  return line.length > room ? `${line.slice(0, room - 1)}…` : line
}

/**
 * Runs a command and hands every output line (stdout and stderr, split on `\r` too so progress
 * redraws arrive as lines) to `onLine`. Resolves with the exit status and all lines.
 */
export function runStreaming(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly onLine: (line: string) => void },
): Promise<{ readonly ok: boolean; readonly lines: readonly string[] }> {
  return new Promise((resolve) => {
    const lines: string[] = []
    // npm is a .cmd script on Windows, which only a shell can start; the arguments are fixed.
    const child =
      process.platform === "win32" && command === "npm"
        ? spawn([command, ...args].join(" "), { cwd: options.cwd, shell: true })
        : spawn(command, args, { cwd: options.cwd })
    for (const stream of [child.stdout, child.stderr]) {
      let pending = ""
      stream.setEncoding("utf8")
      stream.on("data", (chunk: string) => {
        const parts = (pending + chunk).split(/\r\n|\r|\n/)
        pending = parts.pop() ?? ""
        for (const part of parts) {
          lines.push(part)
          options.onLine(part)
        }
      })
      stream.on("end", () => {
        if (!pending) return
        lines.push(pending)
        options.onLine(pending)
      })
    }
    child.on("error", (error) => {
      lines.push(error.message)
      resolve({ ok: false, lines })
    })
    child.on("close", (code) => resolve({ ok: code === 0, lines }))
  })
}

export type StepResult = { readonly ok: boolean; readonly lines: readonly string[] }

function gitIn(cwd: string, args: readonly string[]): string {
  return spawnSync("git", args, { cwd, encoding: "utf8" }).stdout?.trim() ?? ""
}

/**
 * Brings the checkout in `cwd` up to its upstream: a fast-forward, as `git pull --ff-only` did.
 * When the published history was replaced (the repository was cleaned up and pushed anew), a
 * fast-forward is impossible; if nothing in the checkout was edited, it moves to the new history
 * instead, and `replaced` says so.
 */
export async function syncToUpstream(
  cwd: string,
  onLine: (line: string) => void,
): Promise<StepResult & { readonly replaced: boolean }> {
  const run = (args: readonly string[]) => runStreaming("git", args, { cwd, onLine })
  const fetched = await run(["fetch", "--progress", "origin"])
  if (!fetched.ok) return { ...fetched, replaced: false }
  const upstream = gitIn(cwd, ["rev-parse", "--abbrev-ref", "@{upstream}"]) || "origin/main"
  const forward = await run(["merge", "--ff-only", upstream])
  if (forward.ok) return { ok: true, lines: [...fetched.lines, ...forward.lines], replaced: false }
  const edited = gitIn(cwd, ["status", "--porcelain", "--untracked-files=no"]) !== ""
  if (edited) return { ...forward, replaced: false }
  const reset = await run(["reset", "--hard", upstream])
  return { ok: reset.ok, lines: [...forward.lines, ...reset.lines], replaced: reset.ok }
}

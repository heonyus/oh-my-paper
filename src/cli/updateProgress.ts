import { spawn } from "node:child_process"

/** Plain text of one output line: no color codes, no surrounding space. */
export function plainLine(line: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escape sequences.
  return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim()
}

const NPM_FETCH = /^npm http fetch \w+ (\d{3}) (\S+) \d+ms(?: \((.+)\))?/

/**
 * What the dim progress log shows for a line of `npm ci --loglevel=http`: a package name for each
 * download instead of its registry URL. Other lines pass through.
 */
export function describeUpdateLine(line: string): string | null {
  const text = plainLine(line)
  if (!text) return null
  const fetch = NPM_FETCH.exec(text)
  if (!fetch) return text
  const [, status, url = "", note] = fetch
  const tarball = decodeURIComponent(url.split("/").at(-1) ?? url).replace(/\.tgz$/, "")
  if (status !== "200") return `${tarball} (${status})`
  return note?.includes("cache") ? `${tarball} · 캐시` : `${tarball} 받는 중`
}

export function isNpmFetchLine(line: string): boolean {
  return NPM_FETCH.test(plainLine(line))
}

/** `패키지 812개 · 41s` from npm's closing line. */
export function npmSummary(lines: readonly string[]): string | null {
  for (const line of [...lines].reverse()) {
    const match = /added (\d+) packages?.* in ([\d.]+m?s)/.exec(plainLine(line))
    if (match) return `패키지 ${match[1]}개 · ${match[2]}`
  }
  return null
}

/** `모듈 1234개 · 3.94s` from Vite's output. */
export function buildSummary(lines: readonly string[]): string | null {
  const text = lines.map(plainLine)
  const modules = text.map((line) => /(\d+) modules transformed/.exec(line)?.[1]).find(Boolean)
  const time = text.map((line) => /built in ([\d.]+m?s)/.exec(line)?.[1]).find(Boolean)
  if (!time) return null
  return modules ? `모듈 ${modules}개 · ${time}` : time
}

/** `3ed7cc4 → 2e1683f · 커밋 3개`, or `이미 최신` when nothing changed. */
export function gitSummary(before: string, after: string, commits: number): string {
  if (before === after) return "이미 최신"
  return `${before.slice(0, 7)} → ${after.slice(0, 7)} · 커밋 ${commits}개`
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

// @vitest-environment node
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/** Every module the entry loads before it runs, following relative imports that are not types. */
function staticImports(entry: string): Map<string, string[]> {
  const packages = new Map<string, string[]>()
  const seen = new Set<string>()
  const pending = [resolve(entry)]
  while (pending.length > 0) {
    const file = pending.pop() ?? ""
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(
      /^\s*(import|export)\s(?!type\s)[^;]*?from\s+"([^"]+)"/gm,
    )) {
      const specifier = match[2] ?? ""
      if (specifier.startsWith(".")) {
        const base = resolve(dirname(file), specifier)
        const found = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base].find((candidate) =>
          existsSync(candidate),
        )
        if (found) pending.push(found)
      } else if (!specifier.startsWith("node:")) {
        packages.set(specifier, [...(packages.get(specifier) ?? []), file])
      }
    }
  }
  return packages
}

describe("the CLI and the web server", () => {
  it("never load Electron, whose first load after an update downloads its 100 MB binary", () => {
    for (const entry of ["src/cli/main.ts", "src/server/main.ts"]) {
      const electron = staticImports(entry).get("electron") ?? []
      expect(electron, `${entry} reaches electron through ${electron.join(", ")}`).toEqual([])
    }
  })
})

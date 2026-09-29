import { readFileSync } from "node:fs"

let cached: string | null = null

export function packageVersion(): string {
  if (cached) return cached
  try {
    const raw: unknown = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    )
    cached =
      typeof raw === "object" && raw !== null && "version" in raw && typeof raw.version === "string"
        ? raw.version
        : "0.0.0"
  } catch {
    cached = "0.0.0"
  }
  return cached
}

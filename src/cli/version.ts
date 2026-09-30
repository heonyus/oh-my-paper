import { readFileSync } from "node:fs"

let cached: string | null = null

/** The version in package.json right now, read again on every call (after `update` pulls). */
export function readPackageVersion(): string {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    )
    return typeof raw === "object" &&
      raw !== null &&
      "version" in raw &&
      typeof raw.version === "string"
      ? raw.version
      : "0.0.0"
  } catch {
    return "0.0.0"
  }
}

export function packageVersion(): string {
  cached ??= readPackageVersion()
  return cached
}

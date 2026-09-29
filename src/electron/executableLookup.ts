import { existsSync } from "node:fs"
import { posix, win32 } from "node:path"

export type ExecutableLookupOptions = {
  readonly env?: NodeJS.ProcessEnv | undefined
  readonly platform?: NodeJS.Platform | undefined
  readonly exists?: ((path: string) => boolean) | undefined
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key]
}

export function platformPath(platform: NodeJS.Platform): typeof posix {
  return platform === "win32" ? win32 : posix
}

/** The directories on PATH, with the quotes Windows allows around an entry removed. */
export function pathDirectories(options: ExecutableLookupOptions = {}): string[] {
  const { delimiter } = platformPath(options.platform ?? process.platform)
  return (envValue(options.env ?? process.env, "PATH") ?? "")
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"(.*)"$/u, "$1"))
    .filter(Boolean)
}

/**
 * The file a bare command name runs, found on PATH without a shell (`which` does not exist
 * on Windows). Windows commands are looked up as `.exe`, the form `spawn` can start directly.
 */
export function findOnPath(command: string, options: ExecutableLookupOptions = {}): string | null {
  const platform = options.platform ?? process.platform
  const exists = options.exists ?? existsSync
  const name = platform === "win32" ? `${command}.exe` : command
  for (const directory of pathDirectories(options)) {
    const candidate = platformPath(platform).join(directory, name)
    if (exists(candidate)) return candidate
  }
  return null
}

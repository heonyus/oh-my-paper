import { rename } from "node:fs/promises"

/** Pauses between attempts on Windows, about 1.6 s in all. */
const WINDOWS_RETRY_DELAYS_MS: readonly number[] = [10, 20, 50, 100, 200, 400, 800]

function transientWindowsLock(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EBUSY" || error.code === "EACCES")
  )
}

export type ReplaceFileOptions = {
  readonly platform?: NodeJS.Platform
  readonly renameFile?: (from: string, to: string) => Promise<void>
}

/**
 * Moves a fully written temporary file over its target. On Windows a virus scanner, the search
 * indexer or a reader that has the target open locks it briefly, and the rename fails with EPERM,
 * EBUSY or EACCES although it succeeds a moment later, so those failures are retried there.
 */
export async function replaceFile(
  temporary: string,
  target: string,
  options: ReplaceFileOptions = {},
): Promise<void> {
  const renameFile = options.renameFile ?? rename
  const delays = (options.platform ?? process.platform) === "win32" ? WINDOWS_RETRY_DELAYS_MS : []
  for (const delay of delays) {
    try {
      await renameFile(temporary, target)
      return
    } catch (error) {
      if (!transientWindowsLock(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  await renameFile(temporary, target)
}

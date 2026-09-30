import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Where a PaddleOCR-VL install records itself. `scripts/setup-paddle-vl-runtime.mjs` holds the
 * lock (its pid) beside the runtime folders while it runs; the wizard's background start writes
 * the log.
 */
export function paddleInstallPaths(home: string): { readonly lock: string; readonly log: string } {
  const root = join(home, ".ohmypaper")
  return { lock: join(root, "paddle-vl-install.pid"), log: join(root, "paddle-vl-install.log") }
}

/** Whether the process named in a lock file is still alive. */
export function lockHolderAlive(lock: string): boolean {
  let pid: number
  try {
    pid = Number.parseInt(readFileSync(lock, "utf8").trim(), 10)
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}

/** A setup is downloading or installing the OCR runtime right now. */
export function paddleInstallRunning(home: string): boolean {
  return lockHolderAlive(paddleInstallPaths(home).lock)
}

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { formatOcrInstallProgress } from "../shared/documentOcr"

/**
 * Where a PaddleOCR-VL install records itself. `scripts/setup-paddle-vl-runtime.mjs` holds the
 * lock (its pid) beside the runtime folders while it runs; the wizard's background start writes
 * the log.
 */
export function paddleInstallPaths(home: string): {
  readonly lock: string
  readonly log: string
  readonly progress: string
  /** Present once the reader said no to the engine in the wizard; an install removes it. */
  readonly declined: string
} {
  const root = join(home, ".ohmypaper")
  return {
    lock: join(root, "paddle-vl-install.pid"),
    log: join(root, "paddle-vl-install.log"),
    progress: join(root, "paddle-vl-install.progress.json"),
    declined: join(root, "paddle-vl-install.declined"),
  }
}

export type PaddleInstallProgress = {
  /** 0–99; ready is the readiness marker, not 100. */
  readonly percent: number
  /** Estimated seconds left, or null before there is enough to estimate from. */
  readonly etaSeconds: number | null
}

/** The running setup's latest progress, or null when there is none or it cannot be read. */
export function readPaddleInstallProgress(home: string): PaddleInstallProgress | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(paddleInstallPaths(home).progress, "utf8"))
  } catch {
    return null
  }
  if (typeof raw !== "object" || raw === null || !("percent" in raw)) return null
  const { percent } = raw
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null
  const eta = "etaSeconds" in raw ? raw.etaSeconds : null
  return {
    percent: Math.max(0, Math.min(99, Math.round(percent))),
    etaSeconds:
      typeof eta === "number" && Number.isFinite(eta) && eta >= 0 ? Math.round(eta) : null,
  }
}

/** `42% · 약 3분 남음`, the same wording for doctor and 설정. */
export function describePaddleInstallProgress(progress: PaddleInstallProgress | null): string {
  return formatOcrInstallProgress(progress)
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

import { existsSync } from "node:fs"

const TASKPOLICY = "/usr/sbin/taskpolicy"

/**
 * Wraps a background engine command so macOS runs it at utility QoS, leaving the performance
 * cores to the browser, the server and AI requests while pages are analysed. taskpolicy execs
 * the command, so the pid, pipes, signals and exit code stay the command's own.
 */
export function backgroundCommand(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  hasTaskpolicy: () => boolean = () => existsSync(TASKPOLICY),
): readonly [string, string[]] {
  if (platform !== "darwin" || !hasTaskpolicy()) return [command, [...args]]
  return [TASKPOLICY, ["-c", "utility", command, ...args]]
}

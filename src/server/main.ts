import { readWebServerConfig } from "./config"
import { PORT_UNAVAILABLE_EXIT_CODE, portUnavailableMessage } from "./portUnavailable"
import { createLocalWebServer } from "./server"
import { createWebServices } from "./services"

const MODEL_WARMUP_DELAY_MS = 5_000

/**
 * Windows ends a process a few seconds after its console window closes, so a shutdown that
 * started that way has to finish sooner than one started by Ctrl+C.
 */
const SHUTDOWN_DEADLINE_MS = 10_000
const CONSOLE_CLOSE_DEADLINE_MS = 4_000

async function main() {
  const config = readWebServerConfig()
  const services = await createWebServices(config)
  const server = createLocalWebServer(config, services)

  server.once("error", (error: NodeJS.ErrnoException) => {
    const message = portUnavailableMessage(error.code, config.host, config.port)
    if (!message) throw error
    process.stderr.write(`${message}\n`)
    process.exit(PORT_UNAVAILABLE_EXIT_CODE)
  })
  server.listen(config.port, config.host, () => {
    process.stdout.write(
      `oh-my-paper web server listening on http://${config.host}:${config.port}\n`,
    )
  })
  // The note's local source-matching model is fetched in the background once the app is up, so
  // the note rarely has to wait for it. A failed fetch is retried from 설정 or the note.
  const modelWarmup = setTimeout(() => {
    void services.meaningSearch.prepare().catch(() => undefined)
  }, MODEL_WARMUP_DELAY_MS)

  // A second Ctrl+C, or a signal during shutdown, waits for the first one rather than closing
  // the store twice; a deadline ends a shutdown that hangs.
  let closing: Promise<void> | null = null
  const shutdown = (deadlineMs = SHUTDOWN_DEADLINE_MS): Promise<void> => {
    if (closing) return closing
    setTimeout(() => process.exit(1), deadlineMs).unref()
    // The console may already be gone (a closed window, the tray's pipes), so writes can fail.
    for (const stream of [process.stdout, process.stderr]) stream.on("error", () => undefined)
    closing = (async () => {
      clearTimeout(modelWarmup)
      server.close()
      await services.close()
      process.exit(0)
    })()
    return closing
  }
  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())
  if (process.platform === "win32") {
    // Closing the console window arrives as SIGHUP, and Ctrl+Break as SIGBREAK. Windows sends
    // nothing else a process could act on; only on macOS would a SIGHUP listener defeat nohup.
    process.on("SIGHUP", () => void shutdown(CONSOLE_CLOSE_DEADLINE_MS))
    process.on("SIGBREAK", () => void shutdown())
  }
  // The Windows tray companion stops the server by closing its standard input, since Windows
  // has no signal for it. Opt-in: a process without a console gets an input that has already
  // ended, and the terminal uses standard input for prompts.
  if (process.env["OH_MY_PAPER_STOP_ON_STDIN_EOF"] === "1") {
    process.stdin.on("end", () => void shutdown())
    process.stdin.on("close", () => void shutdown())
    process.stdin.resume()
  }
}

void main().catch((error) => {
  process.stderr.write(
    `Fatal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exit(1)
})

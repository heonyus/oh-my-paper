import { readWebServerConfig } from "./config"
import { createLocalWebServer } from "./server"
import { createWebServices } from "./services"

const MODEL_WARMUP_DELAY_MS = 5_000

async function main() {
  const config = readWebServerConfig()
  const services = await createWebServices(config)
  const server = createLocalWebServer(config, services)

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

  const shutdown = async () => {
    clearTimeout(modelWarmup)
    server.close()
    await services.close()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

void main().catch((error) => {
  process.stderr.write(
    `Fatal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exit(1)
})

import { readWebServerConfig } from "./config"
import { createLocalWebServer } from "./server"
import { createWebServices } from "./services"

async function main() {
  const config = readWebServerConfig()
  const services = await createWebServices(config)
  const server = createLocalWebServer(config, services)

  server.listen(config.port, config.host, () => {
    process.stdout.write(
      `oh-my-paper web server listening on http://${config.host}:${config.port}\n`,
    )
  })

  const shutdown = async () => {
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

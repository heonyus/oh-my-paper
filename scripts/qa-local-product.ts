import { launchSimulatedAuthenticatedApplication } from "../tests/support/electron/launchSimulatedAuthenticatedApplication"

async function main(): Promise<void> {
  const qa = await launchSimulatedAuthenticatedApplication()
  let closing = false

  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    await qa.close()
  }

  process.once("SIGINT", () => void close())
  process.once("SIGTERM", () => void close())
  process.stdin.once("end", () => void close())
  process.stdin.resume()

  console.log(`Synthetic-only Electron QA is running (${qa.authMode}). Press Ctrl-C to close.`)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exitCode = 1
})

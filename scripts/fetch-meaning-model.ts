// Fetches the note's local source-matching model into the app's data folder, detached from the
// setup wizard, so the note never waits on its first download.
import { join } from "node:path"
import { webDataDir } from "../src/server/config"
import { loadEmbeddingGemma } from "../src/server/meaningSearchService"

async function main(): Promise<void> {
  const started = Date.now()
  let reported = -1
  await loadEmbeddingGemma(join(webDataDir(), "models"), (loaded, total) => {
    const percent = total > 0 ? Math.floor((loaded / total) * 100) : 0
    if (percent >= reported + 10) {
      reported = percent
      process.stdout.write(`${percent}%\n`)
    }
  })
  process.stdout.write(`ready in ${Math.round((Date.now() - started) / 1000)}s\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

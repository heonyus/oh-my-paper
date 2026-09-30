import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { replaceFile } from "../electron/fileReplace"

const FILE_NAME = "welcome.json"

const storedSchema = z.object({ seenAt: z.string().datetime() })

/**
 * The first-run welcome is kept per data folder, so a fresh folder (a new install, or one the
 * person cleared) shows it again while a browser's own storage stays out of it.
 */
export async function readWelcomeSeen(dataDir: string): Promise<boolean> {
  try {
    return storedSchema.safeParse(JSON.parse(await readFile(join(dataDir, FILE_NAME), "utf8")))
      .success
  } catch {
    // Missing or damaged: the welcome may show once more.
    return false
  }
}

export async function saveWelcomeSeen(dataDir: string, now: Date = new Date()): Promise<void> {
  const target = join(dataDir, FILE_NAME)
  const temporary = `${target}.tmp`
  await mkdir(dataDir, { recursive: true })
  const stored = storedSchema.parse({ seenAt: now.toISOString() })
  await writeFile(temporary, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 })
  await replaceFile(temporary, target)
}

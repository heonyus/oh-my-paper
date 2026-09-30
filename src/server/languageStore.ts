import { readFileSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { replaceFile } from "../electron/fileReplace"
import { type LanguagePreference, type Locale, localeSchema } from "../shared/i18n/locale"

const FILE_NAME = "language.json"

const storedSchema = z.object({ language: localeSchema })

/**
 * The language picked in the terminal or in the app's settings, kept in the data folder so both
 * speak it. Nothing saved means automatic. Read synchronously, since the terminal needs it before
 * its first line.
 */
export function readSavedLanguage(dataDir: string): Locale | null {
  try {
    const parsed = storedSchema.safeParse(
      JSON.parse(readFileSync(join(dataDir, FILE_NAME), "utf8")),
    )
    return parsed.success ? parsed.data.language : null
  } catch {
    // Missing or damaged: the language is detected again.
    return null
  }
}

/** Keeps `preference`; `auto` forgets the choice so the language is detected again. */
export async function saveLanguage(dataDir: string, preference: LanguagePreference): Promise<void> {
  const target = join(dataDir, FILE_NAME)
  if (preference === "auto") {
    await rm(target, { force: true })
    return
  }
  const temporary = `${target}.tmp`
  await mkdir(dataDir, { recursive: true })
  const stored = storedSchema.parse({ language: preference })
  await writeFile(temporary, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 })
  await replaceFile(temporary, target)
}

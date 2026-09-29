import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { replaceFile } from "../electron/fileReplace"
import { type GithubStarAnswer, githubStarAnswerSchema } from "../shared/githubStar"

const FILE_NAME = "github-star.json"

const storedAnswerSchema = z.object({
  answer: githubStarAnswerSchema,
  answeredAt: z.string().datetime(),
})

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

/** The wizard's saved answer in the data folder, or null when it has not asked yet. */
export async function readGithubStarAnswer(dataDir: string): Promise<GithubStarAnswer | null> {
  let text: string
  try {
    text = await readFile(join(dataDir, FILE_NAME), "utf8")
  } catch (error) {
    if (missingFile(error)) return null
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    // A damaged file only means the wizard may ask once more.
    return null
  }
  const stored = storedAnswerSchema.safeParse(value)
  return stored.success ? stored.data.answer : null
}

export async function saveGithubStarAnswer(
  dataDir: string,
  answer: GithubStarAnswer,
  now: Date = new Date(),
): Promise<void> {
  const target = join(dataDir, FILE_NAME)
  const temporary = `${target}.tmp`
  await mkdir(dataDir, { recursive: true })
  const stored = storedAnswerSchema.parse({ answer, answeredAt: now.toISOString() })
  await writeFile(temporary, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 })
  await replaceFile(temporary, target)
}

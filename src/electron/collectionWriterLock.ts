import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { replaceDurably } from "./collectionJournal"

const writerOwnerSchema = z.object({
  token: z.string().uuid(),
  processId: z.number().int().positive(),
  startedAt: z.string().datetime(),
})

export class CollectionWriterLockError extends Error {
  readonly name = "CollectionWriterLockError"

  constructor(
    readonly kind: "writer_locked" | "writer_lock_changed",
    cause?: unknown,
  ) {
    super(cause instanceof Error ? `${kind}: ${cause.message}` : kind)
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

async function processIsAlive(processId: number): Promise<boolean> {
  try {
    process.kill(processId, 0)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false
    if (error instanceof Error && "code" in error && error.code === "EPERM") return true
    throw error
  }
}

export class CollectionWriterLock {
  private released = false

  private constructor(
    readonly root: string,
    readonly token: string,
  ) {}

  static async acquire(root: string, now: Date): Promise<CollectionWriterLock> {
    const lockDirectory = join(root, ".scourgify", "writer.lock")
    const token = randomUUID()
    await mkdir(join(root, ".scourgify"), { recursive: true })
    try {
      await mkdir(lockDirectory)
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
      let owner: z.infer<typeof writerOwnerSchema>
      try {
        owner = writerOwnerSchema.parse(
          JSON.parse(await readFile(join(lockDirectory, "owner.json"), "utf8")),
        )
      } catch (ownerError) {
        if (
          ownerError instanceof z.ZodError ||
          ownerError instanceof SyntaxError ||
          isMissing(ownerError)
        ) {
          throw new CollectionWriterLockError("writer_locked", ownerError)
        }
        throw ownerError
      }
      if (await processIsAlive(owner.processId)) {
        throw new CollectionWriterLockError("writer_locked")
      }
      await rm(lockDirectory, { recursive: true })
      await mkdir(lockDirectory)
    }
    await replaceDurably(
      join(lockDirectory, "owner.json"),
      Buffer.from(JSON.stringify({ token, processId: process.pid, startedAt: now.toISOString() })),
    )
    return new CollectionWriterLock(root, token)
  }

  async release(): Promise<void> {
    if (this.released) return
    const lockDirectory = join(this.root, ".scourgify", "writer.lock")
    const owner = writerOwnerSchema.parse(
      JSON.parse(await readFile(join(lockDirectory, "owner.json"), "utf8")),
    )
    if (owner.token !== this.token) throw new CollectionWriterLockError("writer_lock_changed")
    await rm(lockDirectory, { recursive: true })
    this.released = true
  }
}

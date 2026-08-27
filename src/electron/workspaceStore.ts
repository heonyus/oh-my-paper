import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Workspace } from "../shared/schemas"
import { boardCardSchema, sourceAnchorSchema, workspaceSchema } from "../shared/schemas"

const legacySourceAnchorSchema = sourceAnchorSchema.omit({ fragments: true }).strict()
const legacyBoardCardSchema = boardCardSchema.extend({ anchor: legacySourceAnchorSchema })
const legacyWorkspaceSchema = workspaceSchema.extend({ cards: legacyBoardCardSchema.array() })

export function defaultWorkspace(): Workspace {
  return {
    documents: [],
    cards: [],
    sidebarOpen: true,
    viewport: { x: 88, y: 36, zoom: 0.72 },
    activeDocumentId: null,
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function parsePersistedWorkspace(value: unknown): Workspace {
  const current = workspaceSchema.safeParse(value)
  if (current.success) return current.data
  const legacy = legacyWorkspaceSchema.parse(value)
  return workspaceSchema.parse({
    ...legacy,
    cards: legacy.cards.map((card) => ({
      ...card,
      anchor: {
        ...card.anchor,
        fragments: [{ x: card.anchor.x, y: card.anchor.y, width: 1, height: 1 }],
      },
    })),
  })
}

export class WorkspaceStore {
  readonly workspaceFile: string
  readonly documentsDirectory: string
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(readonly root: string) {
    this.workspaceFile = join(root, "workspace.json")
    this.documentsDirectory = join(root, "documents")
  }

  async read(): Promise<Workspace> {
    try {
      const serialized = await readFile(this.workspaceFile, "utf8")
      return parsePersistedWorkspace(JSON.parse(serialized))
    } catch (error) {
      if (isMissingFile(error)) return defaultWorkspace()
      throw error
    }
  }

  async save(workspace: Workspace): Promise<void> {
    const parsed = workspaceSchema.parse(workspace)
    const operation = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        const temporaryFile = `${this.workspaceFile}.tmp`
        await mkdir(this.root, { recursive: true })
        await writeFile(temporaryFile, JSON.stringify(parsed), { encoding: "utf8", mode: 0o600 })
        await rename(temporaryFile, this.workspaceFile)
      })
    this.saveQueue = operation
    await operation
  }
}

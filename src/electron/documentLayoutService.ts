import { execFile } from "node:child_process"
import { access, mkdir, readFile, rename, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import {
  type DocumentLayoutResult,
  documentLayoutResultSchema,
  documentLayoutSchema,
} from "../shared/documentLayout"
import type { DocumentId } from "../shared/schemas"
import { resolveDocumentPath } from "./documentService"
import type { WorkspaceStore } from "./workspaceStore"

const executeFile = promisify(execFile)

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export function layoutRuntimePython(
  home: string,
  platform: NodeJS.Platform,
  configured?: string,
): string {
  if (configured) return configured
  const root = join(home, ".scourgify", "layout-runtime")
  return platform === "win32" ? join(root, "Scripts", "python.exe") : join(root, "bin", "python")
}

export function layoutScriptPath(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
): string {
  return packaged
    ? join(resourcesPath, "layout", "pp_structure_layout.py")
    : join(appPath, "src", "layout", "pp_structure_layout.py")
}

export type DocumentLayoutServiceOptions = {
  readonly appPath: string
  readonly resourcesPath: string
  readonly packaged: boolean
  readonly platform?: NodeJS.Platform
  readonly home?: string
  readonly python?: string | undefined
}

export class DocumentLayoutService {
  readonly #options: DocumentLayoutServiceOptions
  readonly #active = new Map<DocumentId, Promise<DocumentLayoutResult>>()

  constructor(options: DocumentLayoutServiceOptions) {
    this.#options = options
  }

  analyze(id: DocumentId, store: WorkspaceStore): Promise<DocumentLayoutResult> {
    const active = this.#active.get(id)
    if (active) return active
    const operation = this.#analyze(id, store).finally(() => this.#active.delete(id))
    this.#active.set(id, operation)
    return operation
  }

  async #analyze(id: DocumentId, store: WorkspaceStore): Promise<DocumentLayoutResult> {
    const workspace = await store.read()
    const document = workspace.documents.find((candidate) => candidate.id === id)
    if (!document) return { status: "unavailable", reason: "analysis_failed" }
    const cacheDirectory = join(store.root, "layout")
    const cacheFile = join(cacheDirectory, `${id}.json`)
    try {
      const cached = documentLayoutSchema.parse(JSON.parse(await readFile(cacheFile, "utf8")))
      if (cached.sourceHash === document.hash)
        return documentLayoutResultSchema.parse({ status: "ready", layout: cached })
      await rm(cacheFile, { force: true })
    } catch (error) {
      if (!isMissingFile(error)) await rm(cacheFile, { force: true })
    }

    const python = layoutRuntimePython(
      this.#options.home ?? homedir(),
      this.#options.platform ?? process.platform,
      this.#options.python,
    )
    const script = layoutScriptPath(
      this.#options.appPath,
      this.#options.resourcesPath,
      this.#options.packaged,
    )
    try {
      await Promise.all([access(python), access(script)])
    } catch (error) {
      if (isMissingFile(error)) return { status: "unavailable", reason: "runtime_missing" }
      throw error
    }

    const temporaryFile = `${cacheFile}.tmp`
    try {
      await mkdir(cacheDirectory, { recursive: true })
      const pdfPath = await resolveDocumentPath(id, store)
      await executeFile(python, [script, pdfPath, temporaryFile], {
        env: { ...process.env, PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True" },
        timeout: 600_000,
        maxBuffer: 16 * 1024 * 1024,
      })
      const layout = documentLayoutSchema.parse(JSON.parse(await readFile(temporaryFile, "utf8")))
      const currentWorkspace = await store.read()
      const currentDocument = currentWorkspace.documents.find((candidate) => candidate.id === id)
      if (!currentDocument || layout.sourceHash !== currentDocument.hash) {
        await rm(temporaryFile, { force: true })
        return { status: "unavailable", reason: "analysis_failed" }
      }
      await rename(temporaryFile, cacheFile)
      return documentLayoutResultSchema.parse({ status: "ready", layout })
    } catch (error) {
      await rm(temporaryFile, { force: true })
      if (error instanceof Error) return { status: "unavailable", reason: "analysis_failed" }
      throw error
    }
  }
}

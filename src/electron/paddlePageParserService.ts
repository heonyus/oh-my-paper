import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { z } from "zod"
import {
  type DocumentOcrProviderStatus,
  documentOcrProviderStatusSchema,
} from "../shared/documentOcr"
import {
  type DocumentPageParseProgress,
  type DocumentPageParseResult,
  documentPageParseResultSchema,
  normalizeParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../shared/documentPageModel"
import type { DocumentId } from "../shared/schemas"
import { resolveDocumentPath } from "./documentService"
import { buildOfflineSubprocessEnv } from "./offlineSubprocessEnvironment"
import {
  ApplePaddleVlmServer,
  type PaddleVlmServer,
  paddleVlmModelDirectory,
  paddleVlmRuntimePython,
} from "./paddleVlmServer"
import type { WorkspaceStore } from "./workspaceStore"

const executeFile = promisify(execFile)
const parserConfigVersion = "page-v2"

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export function paddlePageParserRuntimePython(
  home: string,
  platform: NodeJS.Platform,
  configured?: string,
): string {
  if (configured) return configured
  const root = join(home, ".ohmypaper", "paddle-vl-runtime")
  return platform === "win32" ? join(root, "Scripts", "python.exe") : join(root, "bin", "python")
}

export function paddlePageParserScriptPath(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
): string {
  return packaged
    ? join(resourcesPath, "layout", "paddle_vl_page_parser.py")
    : join(appPath, "src", "layout", "paddle_vl_page_parser.py")
}

export type PaddlePageParserServiceOptions = {
  readonly appPath: string
  readonly resourcesPath: string
  readonly packaged: boolean
  readonly home?: string
  readonly platform?: NodeJS.Platform
  readonly python?: string | undefined
  readonly readinessMarker?: string | undefined
  readonly vlmServer?: PaddleVlmServer | undefined
}

type PaddlePageParseInput = {
  readonly documentId: DocumentId
  readonly pageNumber: number
  readonly store: WorkspaceStore
  readonly onProgress?: ((progress: DocumentPageParseProgress) => void) | undefined
}

export class PaddlePageParserService {
  readonly #active = new Map<string, Promise<DocumentPageParseResult>>()
  readonly #vlmServer: PaddleVlmServer
  readonly #usesManagedVlm: boolean
  #tail: Promise<void> = Promise.resolve()

  constructor(readonly options: PaddlePageParserServiceOptions) {
    this.#usesManagedVlm = options.vlmServer === undefined
    this.#vlmServer =
      options.vlmServer ?? new ApplePaddleVlmServer(options.home ? { home: options.home } : {})
  }

  async status(): Promise<DocumentOcrProviderStatus> {
    const home = this.options.home ?? homedir()
    const platform = this.options.platform ?? process.platform
    const files = [
      paddlePageParserRuntimePython(home, platform, this.options.python),
      paddlePageParserScriptPath(
        this.options.appPath,
        this.options.resourcesPath,
        this.options.packaged,
      ),
      this.options.readinessMarker ??
        join(home, ".ohmypaper", "paddle-vl-runtime", ".ready-v1.6-layout-v2"),
    ]
    if (this.#usesManagedVlm && platform === "darwin" && process.arch === "arm64") {
      files.push(
        paddleVlmRuntimePython(home),
        paddleVlmModelDirectory(home),
        join(home, ".ohmypaper", "paddle-vl-mlx-runtime", ".ready-mlx-v1.6"),
      )
    }
    let configured = true
    try {
      await Promise.all(files.map((file) => access(file)))
    } catch (error) {
      if (!isMissingFile(error)) throw error
      configured = false
    }
    return documentOcrProviderStatusSchema.parse({
      configured,
      provider: "paddle",
      model: "PaddleOCR-VL-1.6",
    })
  }

  parse(input: PaddlePageParseInput): Promise<DocumentPageParseResult> {
    const key = `${input.documentId}:${input.pageNumber}`
    const active = this.#active.get(key)
    if (active) return active
    const operation = this.#tail
      .then(() => this.#parse(input))
      .finally(() => this.#active.delete(key))
    this.#tail = operation.then(
      () => undefined,
      () => undefined,
    )
    this.#active.set(key, operation)
    return operation
  }

  dispose(): void {
    this.#vlmServer.stop()
  }

  async #parse(input: PaddlePageParseInput): Promise<DocumentPageParseResult> {
    const { documentId, pageNumber, store } = input
    const workspace = await store.read()
    const document = workspace.documents.find((candidate) => candidate.id === documentId)
    if (!document) return { status: "unavailable", reason: "unknown_document" }
    if (pageNumber > document.pageCount) return { status: "unavailable", reason: "invalid_page" }
    const cacheFile = join(
      store.root,
      "parsed-pages",
      document.hash,
      `paddleocr-vl-1.6-${parserConfigVersion}`,
      `page-${pageNumber}.json`,
    )
    try {
      const cached = normalizeParsedDocumentPage(
        parsedDocumentPageSchema.parse(JSON.parse(await readFile(cacheFile, "utf8"))),
      )
      if (cached.sourceHash === document.hash && cached.pageNumber === pageNumber)
        return documentPageParseResultSchema.parse({ status: "ready", page: cached })
    } catch (error) {
      if (!(isMissingFile(error) || error instanceof z.ZodError || error instanceof SyntaxError))
        throw error
      await rm(cacheFile, { force: true })
    }

    const home = this.options.home ?? homedir()
    const python = paddlePageParserRuntimePython(
      home,
      this.options.platform ?? process.platform,
      this.options.python,
    )
    const script = paddlePageParserScriptPath(
      this.options.appPath,
      this.options.resourcesPath,
      this.options.packaged,
    )
    const marker =
      this.options.readinessMarker ??
      join(home, ".ohmypaper", "paddle-vl-runtime", ".ready-v1.6-layout-v2")
    try {
      await Promise.all([access(python), access(script), access(marker)])
    } catch (error) {
      if (isMissingFile(error)) return { status: "unavailable", reason: "runtime_missing" }
      throw error
    }

    const temporaryFile = `${cacheFile}.${randomUUID()}.tmp`
    try {
      input.onProgress?.({ id: documentId, pageNumber, stage: "engine-starting" })
      const vlm = await this.#vlmServer.start()
      await mkdir(dirname(cacheFile), { recursive: true })
      const pdfPath = await resolveDocumentPath(documentId, store)
      input.onProgress?.({ id: documentId, pageNumber, stage: "page-rendering" })
      const baseArguments = [script, pdfPath, document.hash, String(pageNumber), temporaryFile]
      const parserArguments = vlm
        ? [
            ...baseArguments,
            "--vlm-server-url",
            vlm.serverUrl,
            "--vlm-model",
            vlm.model,
            "--vlm-api-key",
            vlm.apiKey,
          ]
        : baseArguments
      input.onProgress?.({ id: documentId, pageNumber, stage: "document-analyzing" })
      await executeFile(python, parserArguments, {
        env: buildOfflineSubprocessEnv({
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
          PADDLE_PDX_CACHE_HOME: join(home, ".paddlex"),
          HF_HOME: join(home, ".cache", "huggingface"),
        }),
        timeout: 180_000,
        maxBuffer: 16 * 1024 * 1024,
      })
      input.onProgress?.({ id: documentId, pageNumber, stage: "finalizing" })
      const page = normalizeParsedDocumentPage(
        parsedDocumentPageSchema.parse(JSON.parse(await readFile(temporaryFile, "utf8"))),
      )
      if (page.sourceHash !== document.hash || page.pageNumber !== pageNumber) {
        await rm(temporaryFile, { force: true })
        return { status: "unavailable", reason: "invalid_output" }
      }
      await writeFile(temporaryFile, JSON.stringify(page), "utf8")
      await rename(temporaryFile, cacheFile)
      return documentPageParseResultSchema.parse({ status: "ready", page })
    } catch (error) {
      await rm(temporaryFile, { force: true })
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return { status: "unavailable", reason: "invalid_output" }
      if (error instanceof Error) return { status: "unavailable", reason: "execution_failed" }
      throw error
    }
  }
}

import { execFile } from "node:child_process"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { z } from "zod"
import {
  type LocalEnrichmentRequest,
  type LocalEnrichmentResult,
  localEnrichmentRequestSchema,
  localEnrichmentResultSchema,
} from "../shared/documentLocalEnrichment"
import type { DocumentId } from "../shared/schemas"
import { buildOfflineSubprocessEnv } from "./offlineSubprocessEnvironment"

const executeFile = promisify(execFile)

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export function localEnrichmentRuntimePython(
  home: string,
  platform: NodeJS.Platform,
  configured?: string,
): string {
  if (configured) return configured
  const root = join(home, ".ohmypaper", "layout-runtime")
  return platform === "win32" ? join(root, "Scripts", "python.exe") : join(root, "bin", "python")
}

export function localEnrichmentScriptPath(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
): string {
  return packaged
    ? join(resourcesPath, "layout", "pp_structure_enrichment.py")
    : join(appPath, "src", "layout", "pp_structure_enrichment.py")
}

export type LocalEnrichmentAdapterOptions = {
  readonly appPath: string
  readonly resourcesPath: string
  readonly packaged: boolean
  readonly platform?: NodeJS.Platform
  readonly home?: string
  readonly python?: string | undefined
}

export class LocalEnrichmentAdapter {
  readonly #options: LocalEnrichmentAdapterOptions
  readonly #active = new Map<DocumentId, Promise<LocalEnrichmentResult>>()

  constructor(options: LocalEnrichmentAdapterOptions) {
    this.#options = options
  }

  enrich(id: DocumentId, request: LocalEnrichmentRequest): Promise<LocalEnrichmentResult> {
    const active = this.#active.get(id)
    if (active) return active
    const operation = this.#run(request).finally(() => this.#active.delete(id))
    this.#active.set(id, operation)
    return operation
  }

  async #run(rawRequest: LocalEnrichmentRequest): Promise<LocalEnrichmentResult> {
    const request = localEnrichmentRequestSchema.parse(rawRequest)
    const python = localEnrichmentRuntimePython(
      this.#options.home ?? homedir(),
      this.#options.platform ?? process.platform,
      this.#options.python,
    )
    const script = localEnrichmentScriptPath(
      this.#options.appPath,
      this.#options.resourcesPath,
      this.#options.packaged,
    )
    try {
      await Promise.all([access(python), access(script)])
    } catch (error) {
      if (isMissingFile(error)) return unavailable(request, "runtime_missing")
      throw error
    }

    const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-local-enrichment-"))
    const inputPath = join(temporaryRoot, "request.json")
    const outputPath = join(temporaryRoot, "result.json")
    try {
      await writeFile(inputPath, JSON.stringify(request), "utf8")
      await executeFile(python, [script, inputPath, outputPath], {
        env: buildOfflineSubprocessEnv({
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
          PADDLE_PDX_CACHE_HOME: join(this.#options.home ?? homedir(), ".paddlex"),
          HF_HOME: join(this.#options.home ?? homedir(), ".cache", "huggingface"),
        }),
        timeout: 180_000,
        maxBuffer: 16 * 1024 * 1024,
      })
      const parsed = localEnrichmentResultSchema.parse(
        JSON.parse(await readFile(outputPath, "utf8")),
      )
      return parsed.sourceHash === request.sourceHash
        ? parsed
        : unavailable(request, "invalid_output")
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return unavailable(request, "invalid_output")
      }
      if (error instanceof Error) return unavailable(request, "execution_failed")
      throw error
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }
}

function unavailable(
  request: LocalEnrichmentRequest,
  detail: "runtime_missing" | "model_unavailable" | "invalid_output" | "execution_failed",
): LocalEnrichmentResult {
  return {
    schemaVersion: "1.0.0",
    status: "unavailable",
    sourceHash: request.sourceHash,
    reason: "local_enrichment_unavailable",
    detail,
    requestedTargetCount: request.targets.length,
  }
}

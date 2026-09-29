import { randomUUID } from "node:crypto"
import { mkdir, open, readFile, rm } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { z } from "zod"
import {
  composeSemanticDocumentAst,
  type SemanticCompositionInput,
  type SemanticCompositionResult,
  type SemanticDocumentAst,
  semanticDocumentAstSchema,
} from "../renderer/lib/semanticDocumentAst"
import { astFingerprintSchema } from "../shared/documentAstIpc"
import type { DocumentLayout, DocumentLayoutResult } from "../shared/documentLayout"
import type { DocumentId } from "../shared/schemas"
import { sha256Schema } from "../shared/schemas"
import { createAstFingerprint, DocumentAstStore } from "./documentAstStore"
import { replaceFile } from "./fileReplace"
import type { WorkspaceStore } from "./workspaceStore"

const sidecarSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  fingerprint: astFingerprintSchema,
  semantic: semanticDocumentAstSchema,
})

const sourceExtractorVersion = "pdfjs-6-source-1"
const sourceConfigVersion = "source-only-v1"

function isCompleteSemanticAst(ast: SemanticDocumentAst): boolean {
  const nodeIds = new Set(ast.nodes.map((node) => node.id))
  if (nodeIds.size !== ast.nodes.length) return false
  const relationIds = new Set<string>()
  for (const edge of ast.edges) {
    const relationId = `${edge.from}|${edge.to}|${edge.kind}`
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) return false
    if (relationIds.has(relationId)) return false
    relationIds.add(relationId)
  }
  return true
}

export function semanticAstSidecarPath(
  root: string,
  sourceHash: string,
  fingerprint: string,
): string {
  const hash = sha256Schema.parse(sourceHash)
  const identity = astFingerprintSchema.parse(fingerprint)
  return join(root, "document-ast", hash, `${basename(`${identity}.json`, ".json")}.semantic.json`)
}

export class SemanticDocumentAstStoreError extends Error {
  readonly name = "SemanticDocumentAstStoreError"

  constructor(
    readonly kind: "write_failed",
    cause?: unknown,
  ) {
    super(cause instanceof Error ? `${kind}: ${cause.message}` : kind)
  }
}

export class SemanticDocumentAstStore {
  constructor(readonly root: string) {}

  async read(sourceHash: string, fingerprint: string): Promise<SemanticDocumentAst | null> {
    const path = semanticAstSidecarPath(this.root, sourceHash, fingerprint)
    try {
      const value = sidecarSchema.parse(JSON.parse(await readFile(path, "utf8")))
      return value.semantic.sourceHash === sourceHash &&
        value.fingerprint === fingerprint &&
        isCompleteSemanticAst(value.semantic)
        ? value.semantic
        : null
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
      if (error instanceof z.ZodError || error instanceof SyntaxError) return null
      throw error
    }
  }

  async write(ast: SemanticDocumentAst, fingerprint: string): Promise<void> {
    const semantic = semanticDocumentAstSchema.parse(ast)
    const identity = astFingerprintSchema.parse(fingerprint)
    const path = semanticAstSidecarPath(this.root, semantic.sourceHash, identity)
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      await mkdir(dirname(path), { recursive: true })
      handle = await open(temporaryPath, "wx", 0o600)
      await handle.writeFile(
        JSON.stringify({ schemaVersion: "1.0.0", fingerprint: identity, semantic }),
        "utf8",
      )
      await handle.sync()
      await handle.close()
      handle = undefined
      await replaceFile(temporaryPath, path)
    } catch (error) {
      if (handle) await handle.close()
      await rm(temporaryPath, { force: true })
      if (error instanceof Error) throw new SemanticDocumentAstStoreError("write_failed", error)
      throw error
    }
  }
}

export async function composeAndCacheSemanticDocumentAst(input: {
  readonly composition: SemanticCompositionInput
  readonly fingerprint: string
  readonly root: string
}): Promise<SemanticCompositionResult & { readonly cached: boolean }> {
  const store = new SemanticDocumentAstStore(input.root)
  const cached = await store.read(input.composition.source.sourceHash, input.fingerprint)
  if (cached) return { status: cached.status, ast: cached, cached: true }
  const result = composeSemanticDocumentAst(input.composition)
  await store.write(result.ast, input.fingerprint)
  return { ...result, cached: false }
}

export async function composeSemanticDocumentForDocument(input: {
  readonly documentId: DocumentId
  readonly store: WorkspaceStore
  readonly layout?: DocumentLayout
}): Promise<SemanticCompositionResult | null> {
  const workspace = await input.store.read()
  const document = workspace.documents.find((candidate) => candidate.id === input.documentId)
  if (!document) return null
  const fingerprint = createAstFingerprint({
    sourceHash: document.hash,
    extractorVersion: sourceExtractorVersion,
    configVersion: sourceConfigVersion,
  })
  const source = await new DocumentAstStore(input.store.root).read(document.hash, fingerprint)
  if (!source) return null
  const composition = input.layout ? { source, layout: input.layout } : { source }
  return await composeAndCacheSemanticDocumentAst({
    composition,
    fingerprint,
    root: input.store.root,
  })
}

function assertNever(value: never): never {
  throw new Error(`unexpected layout result: ${JSON.stringify(value)}`)
}

export async function composeSemanticDocumentAfterLayout(input: {
  readonly documentId: DocumentId
  readonly store: WorkspaceStore
  readonly layoutResult: DocumentLayoutResult
}): Promise<boolean> {
  switch (input.layoutResult.status) {
    case "ready": {
      const result = await composeSemanticDocumentForDocument({
        documentId: input.documentId,
        store: input.store,
        layout: input.layoutResult.layout,
      })
      return result?.status === "ready"
    }
    case "unavailable": {
      const result = await composeSemanticDocumentForDocument({
        documentId: input.documentId,
        store: input.store,
      })
      return result?.status === "ready"
    }
    default:
      return assertNever(input.layoutResult)
  }
}

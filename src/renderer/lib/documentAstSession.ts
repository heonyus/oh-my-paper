import type { SourceDocumentAst } from "../../shared/documentAst"
import type { DocumentAstRequest, DocumentAstResult } from "../../shared/documentAstIpc"

type AstLoader = (request: DocumentAstRequest) => Promise<DocumentAstResult>

function sessionKey(request: DocumentAstRequest): string | null {
  if (request.sourceHash && request.fingerprint)
    return `${request.sourceHash}:${request.fingerprint}`
  return `document:${request.id}`
}

export class DocumentAstSession {
  readonly #load: AstLoader
  readonly #cache = new Map<string, Promise<SourceDocumentAst | null>>()
  #generation = 0

  constructor(loader: AstLoader) {
    this.#load = loader
  }

  beginGeneration(): number {
    this.#generation += 1
    return this.#generation
  }

  load(
    request: DocumentAstRequest,
    generation = this.#generation,
  ): Promise<SourceDocumentAst | null> {
    const key = sessionKey(request)
    if (!key) return Promise.resolve(null)
    const cached = this.#cache.get(key)
    if (cached) return cached
    const operation = this.#load(request).then((result) => {
      if (generation !== this.#generation) return null
      if (result.status === "ready" || result.status === "degraded") return result.ast
      return null
    })
    const cachedOperation = operation.then(
      (ast) => {
        if (!ast) this.#cache.delete(key)
        return ast
      },
      (error: unknown) => {
        this.#cache.delete(key)
        throw error
      },
    )
    this.#cache.set(key, cachedOperation)
    return cachedOperation
  }

  clear(): void {
    this.#cache.clear()
  }
}

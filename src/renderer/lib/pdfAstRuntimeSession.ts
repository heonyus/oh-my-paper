import type { SourceDocumentAst } from "../../shared/documentAst"
import type { DocumentId, DocumentRecord } from "../../shared/schemas"
import {
  bindAstItemsToRenderedPage,
  clearActiveDocumentAst,
  setActiveDocumentAst,
} from "./documentAstRuntime"
import { DocumentAstSession } from "./documentAstSession"
import { clearDocumentLayoutPages } from "./documentLayoutRuntime"

export class PdfAstRuntimeSession {
  readonly #documentId: DocumentId
  readonly #sourceHash: DocumentRecord["hash"]
  readonly #session = new DocumentAstSession(window.ohmypaper.readDocumentAst)
  readonly #generation: number

  constructor(document: Pick<DocumentRecord, "id" | "hash">) {
    this.#documentId = document.id
    this.#sourceHash = document.hash
    this.#generation = this.#session.beginGeneration()
  }

  async load(): Promise<SourceDocumentAst | null> {
    const ast = await this.#session.load(
      { id: this.#documentId, sourceHash: this.#sourceHash },
      this.#generation,
    )
    if (ast) setActiveDocumentAst(this.#documentId, ast)
    return ast
  }

  bind(pageNumber: number): void {
    bindAstItemsToRenderedPage(this.#documentId, pageNumber)
  }

  dispose(): void {
    this.#session.beginGeneration()
    this.#session.clear()
    clearActiveDocumentAst(this.#documentId)
    clearDocumentLayoutPages(this.#documentId)
  }
}

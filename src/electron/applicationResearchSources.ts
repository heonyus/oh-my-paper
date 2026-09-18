import { createHash } from "node:crypto"
import type { ResearchSource } from "../shared/researchSourceSchemas"
import { researchSourceSchema } from "../shared/researchSourceSchemas"
import { readCanonicalNoteBody } from "./collectionFrontmatter"
import type { CollectionService } from "./collectionService"
import type { DocumentAstService } from "./documentAstService"
import type { ResearchRuntime } from "./researchJobRuntime"
import type { WorkspaceStore } from "./workspaceStore"

// ponytail: first 20k characters only; page labels keep excerpt scope explicit.
const excerptLimit = 20_000

export function createLocalResearchReader(
  store: WorkspaceStore,
  collection: CollectionService,
  astService: Pick<DocumentAstService, "request">,
): ResearchRuntime["readLocalSource"] {
  return async (id, signal): Promise<ResearchSource> => {
    signal.throwIfAborted()
    const node = collection.getNode(id)
    if (!node) throw new Error("선택한 자료가 더 이상 존재하지 않습니다.")
    let content = node.body.slice(0, excerptLimit)
    if (node.kind === "note") {
      const indexed = collection.index.get(id)
      if (!indexed) throw new Error("선택한 노트의 원본 파일을 찾지 못했습니다.")
      const note = await collection.files.readNote(indexed.relativePath)
      content = readCanonicalNoteBody(note.bytes).slice(0, excerptLimit)
    } else if (node.kind === "paper") {
      content = ""
      const workspace = await store.read()
      const document = workspace.documents.find((candidate) =>
        collection.repository
          .findDocumentVersionsByHash(candidate.hash)
          .some((version) => version.paperNodeId === id),
      )
      if (document) {
        const result = await astService.request({ id: document.id, sourceHash: document.hash })
        if (result.status === "ready" || result.status === "degraded") {
          const pages = new Map(result.ast.pages.map((page) => [page.id, page.page]))
          let previousPage: number | undefined
          for (const item of result.ast.items) {
            if (content.length >= excerptLimit) break
            const page = pages.get(item.pageId)
            const heading = page !== previousPage ? `\n\n[p. ${page}]\n` : " "
            content += `${heading}${item.text}`.slice(0, excerptLimit - content.length)
            previousPage = page
          }
        }
      }
    }
    signal.throwIfAborted()
    const url = `scourgify://node/${id}`
    const common = {
      id,
      title: node.title.slice(0, 2_000),
      url,
      finalUrl: url,
      page: null,
      snippet: null,
      origin: "local",
    }
    if (!content.trim())
      return researchSourceSchema.parse({
        ...common,
        access: "metadata_only",
        contentType: null,
        byteLength: 0,
        contentHash: null,
        content: null,
        fetchedAt: null,
      })
    return researchSourceSchema.parse({
      ...common,
      access: "local_excerpt",
      contentType: "text/markdown",
      byteLength: Buffer.byteLength(content),
      contentHash: createHash("sha256").update(content).digest("hex"),
      content,
      fetchedAt: new Date().toISOString(),
    })
  }
}

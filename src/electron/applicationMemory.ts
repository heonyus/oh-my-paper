import { createHash } from "node:crypto"
import { ipcMain } from "electron"
import type { CollectionService } from "./collectionService"
import type { MemorySourceRevisionReader } from "./memoryIpcSourceValidation"
import { initializeMemoryRepository } from "./memoryRepository"
import { createMemoryCollectionChangeInvalidator, registerMemoryIpc } from "./registerMemoryIpc"

export function registerCollectionMemory(collection: CollectionService): () => void {
  const knowledge = collection.repository
  const memory = initializeMemoryRepository(knowledge.db)
  const reader: MemorySourceRevisionReader = {
    readNodeRevision: (id) => {
      const node = knowledge.getNode(id)
      if (!node) return null
      return node.kind === "note"
        ? (collection.index.get(id)?.revision ?? null)
        : createHash("sha256").update(JSON.stringify(node)).digest("hex")
    },
    readPdfEvidence: (anchorId, versionId) => {
      const anchor = knowledge.getEvidenceAnchor(anchorId)
      const version = knowledge.getDocumentVersion(versionId)
      if (!anchor || !version || anchor.documentVersionId !== version.id) return null
      return { sourceRevision: version.hash, quote: anchor.quote, page: anchor.page }
    },
  }
  const removeIpc = registerMemoryIpc(ipcMain, memory, {
    collectionScope: { kind: "collection", key: collection.files.manifest.collectionId },
    sourceRevisionReader: reader,
  })
  const unsubscribe = collection.subscribe(
    createMemoryCollectionChangeInvalidator(memory, reader.readNodeRevision),
  )
  return () => {
    unsubscribe()
    removeIpc()
  }
}

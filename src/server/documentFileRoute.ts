import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import { pipeline } from "node:stream/promises"
import type { WorkspaceStore } from "../electron/workspaceStore"
import { documentIdSchema } from "../shared/schemas"

type DocumentFileServices = {
  readonly store: Pick<WorkspaceStore, "findDocument" | "documentsDirectory">
}

const DOCUMENT_FILE_PATH = /^\/api\/documents\/([^/]+)\/file$/

function sendError(response: ServerResponse, status: number, error: string): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify({ error }))
}

/** Whether an If-None-Match header already names this entity tag. */
function matchesEntityTag(header: string | undefined, tag: string): boolean {
  if (!header) return false
  return header
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .some((candidate) => candidate === "*" || candidate === tag)
}

async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

/**
 * Streams one stored PDF by document id. The file name is the content hash, so the hash is
 * the entity tag and the browser revalidates instead of downloading an unchanged paper again.
 */
export function createDocumentFileRoute(services: DocumentFileServices) {
  return {
    handle: async (
      pathname: string,
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<boolean> => {
      const match = DOCUMENT_FILE_PATH.exec(pathname)
      if (!match || (request.method !== "GET" && request.method !== "HEAD")) return false
      const id = documentIdSchema.safeParse(match[1])
      if (!id.success) {
        sendError(response, 400, "invalid_document_id")
        return true
      }
      const document = await services.store.findDocument(id.data)
      if (!document) {
        sendError(response, 404, "document_not_found")
        return true
      }
      const path = join(services.store.documentsDirectory, `${document.hash}.pdf`)
      const size = await fileSize(path)
      if (size === null) {
        sendError(response, 404, "document_file_missing")
        return true
      }
      const tag = `"${document.hash}"`
      const headers = {
        "cache-control": "private, no-cache",
        etag: tag,
        "x-content-type-options": "nosniff",
      }
      if (matchesEntityTag(request.headers["if-none-match"], tag)) {
        response.writeHead(304, headers)
        response.end()
        return true
      }
      response.writeHead(200, {
        ...headers,
        "content-type": "application/pdf",
        "content-length": size,
      })
      if (request.method === "HEAD") {
        response.end()
        return true
      }
      // A reader that closes mid-transfer only ends this response.
      await pipeline(createReadStream(path), response).catch(() => response.destroy())
      return true
    },
  }
}

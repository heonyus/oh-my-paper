import { createHash } from "node:crypto"
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import { imageFormat } from "../electron/collectionAssets"
import { MAX_ASSET_BYTES } from "../shared/collectionIpc"

type NoteAssetServices = {
  /** The app's data folder; reader notes live in its `reader-notes/`, images in its `assets/`. */
  readonly store: { readonly root: string }
}

const ASSET_FILE = /^\/api\/note-assets\/([a-f0-9]{64}\.(?:png|jpg|webp))$/u
const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(value))
}

async function readBoundedBody(request: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const part = typeof chunk === "string" ? Buffer.from(chunk) : chunk
    size += part.length
    if (size > MAX_ASSET_BYTES) return null
    chunks.push(part)
  }
  return Buffer.concat(chunks)
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Images in reader notes. Each is kept once in `assets/` under its content hash, and the note
 * refers to it as `../assets/<hash>.<ext>`, so the Markdown file still shows it outside the app.
 */
export function createNoteAssetRoute(services: NoteAssetServices) {
  const directory = (): string => join(services.store.root, "assets")
  return {
    handle: async (
      pathname: string,
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<boolean> => {
      if (pathname === "/api/note-assets" && request.method === "POST") {
        const bytes = await readBoundedBody(request)
        if (!bytes || bytes.length === 0) {
          sendJson(response, 413, { error: "이미지는 25MB 이하로 선택해 주세요." })
          return true
        }
        let extension: keyof typeof CONTENT_TYPES
        try {
          extension = imageFormat(bytes)
        } catch (error) {
          sendJson(response, 415, { error: error instanceof Error ? error.message : "invalid" })
          return true
        }
        const name = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`
        const target = join(directory(), name)
        if (!(await exists(target))) {
          await mkdir(directory(), { recursive: true })
          const temporary = `${target}.${process.pid}.tmp`
          await writeFile(temporary, bytes, { mode: 0o600 })
          await rename(temporary, target)
        }
        sendJson(response, 200, { relativePath: `assets/${name}` })
        return true
      }
      const match = ASSET_FILE.exec(pathname)
      if (!match?.[1] || request.method !== "GET") return false
      const name = match[1]
      try {
        const bytes = await readFile(join(directory(), name))
        const extension = imageFormat(bytes)
        response.writeHead(200, {
          "content-type": CONTENT_TYPES[extension],
          "x-content-type-options": "nosniff",
          // The name is the content hash, so the file never changes.
          "cache-control": "private, max-age=31536000, immutable",
        })
        response.end(bytes)
      } catch {
        sendJson(response, 404, { error: "note_asset_not_found" })
      }
      return true
    },
  }
}

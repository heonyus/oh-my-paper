import { readFile, stat } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extname, join } from "node:path"
import type { z } from "zod"
import { jevDecisionRequestSchema } from "../shared/aiDecision"
import { aiJobCancelRequestSchema, aiJobStartRequestSchema, aiRequestSchema } from "../shared/aiIpc"
import {
  discoverySavedMetadataResultSchema,
  discoverySaveInputSchema,
  discoverySaveResultSchema,
} from "../shared/discoveryIpc"
import { documentAstRequestSchema, documentAstResultSchema } from "../shared/documentAstIpc"
import { documentPageParseRequestSchema } from "../shared/documentPageModel"
import { citationLookupRequestSchema, providerConfigSchema } from "../shared/ipc"
import {
  pageTranslationCacheReadRequestSchema,
  pageTranslationCacheWriteRequestSchema,
} from "../shared/pageTranslationCache"
import { documentIdSchema, workspaceSchema } from "../shared/schemas"
import {
  scholarlySearchRequestSchema,
  scholarlySearchResultSchema,
} from "../shared/scholarlySearchSchemas"
import type { WebServerConfig } from "./config"
import { streamParsedPage } from "./pageParseStream"
import type { WebServices } from "./services"
import { importPdfBytes, readDocumentBase64, readWorkspace } from "./services"

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(data))
}

function sendError(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { error })
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson<T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const buf = await readBody(req)
  const parsed = JSON.parse(buf.toString("utf8"))
  return schema.parse(parsed)
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string,
): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false
  const urlPath = req.url ? new URL(req.url, "http://127.0.0.1").pathname : "/"
  const safePath = urlPath === "/" ? "/index.html" : urlPath
  const filePath = join(staticDir, safePath)
  try {
    const s = await stat(filePath)
    if (!s.isFile()) return false
    const mime = mimeTypes[extname(filePath)] ?? "application/octet-stream"
    const content = await readFile(filePath)
    res.writeHead(200, { "content-type": mime })
    res.end(content)
    return true
  } catch {
    return false
  }
}

export function createLocalWebServer(config: WebServerConfig, services: WebServices) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      const pathname = url.pathname
      const requestOrigin = req.headers.origin
      const localOrigin = `http://${req.headers.host ?? `${config.host}:${config.port}`}`

      if (requestOrigin && requestOrigin !== localOrigin) {
        sendError(res, 403, "cross_origin_request_rejected")
        return
      }

      res.setHeader("access-control-allow-origin", localOrigin)
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS")
      res.setHeader("access-control-allow-headers", "content-type, authorization")

      if (req.method === "OPTIONS") {
        res.writeHead(204)
        res.end()
        return
      }

      if (!pathname.startsWith("/api/")) {
        const served = await serveStatic(req, res, config.staticDir)
        if (served) return
        if (req.method === "GET") {
          try {
            const indexPath = join(config.staticDir, "index.html")
            const content = await readFile(indexPath)
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
            res.end(content)
            return
          } catch {}
        }
      }

      if (pathname === "/api/workspace" && req.method === "GET") {
        const ws = await readWorkspace(services)
        sendJson(res, 200, ws)
        return
      }

      if (pathname === "/api/workspace" && req.method === "POST") {
        const body = await readJson(req, workspaceSchema)
        const saved = await services.store.save(body)
        sendJson(res, 200, saved)
        return
      }

      if (pathname === "/api/documents" && req.method === "POST") {
        const name = url.searchParams.get("name") ?? "document.pdf"
        const bytes = await readBody(req)
        const result = await importPdfBytes(new Uint8Array(bytes), name, services)
        sendJson(res, 200, result)
        return
      }

      if (
        pathname.startsWith("/api/documents/") &&
        pathname.endsWith("/base64") &&
        req.method === "GET"
      ) {
        const parts = pathname.split("/")
        const id = documentIdSchema.parse(parts[3])
        const base64 = await readDocumentBase64(id, services)
        sendJson(res, 200, base64)
        return
      }

      if (pathname.startsWith("/api/rpc/") && req.method === "POST") {
        const method = pathname.replace("/api/rpc/", "")
        switch (method) {
          case "decideAi": {
            const input = await readJson(req, jevDecisionRequestSchema)
            const decisions = services.decisionService()
            if (!decisions) {
              sendError(res, 503, "Jev needs an OpenRouter key on this server")
              return
            }
            const controller = new AbortController()
            const cancel = () => controller.abort()
            res.on("close", cancel)
            try {
              const result = await decisions.decide(input, controller.signal)
              if (!res.destroyed) sendJson(res, 200, result)
            } finally {
              res.off("close", cancel)
            }
            return
          }
          case "providerStatus": {
            sendJson(res, 200, services.ai.status())
            return
          }
          case "saveProviderConfig": {
            const input = await readJson(req, providerConfigSchema)
            await services.saveProviderConfig(input)
            sendJson(res, 200, services.ai.status())
            return
          }
          case "documentOcrStatus": {
            sendJson(res, 200, await services.ocrStatus())
            return
          }
          case "parseDocumentPage": {
            const input = await readJson(req, documentPageParseRequestSchema)
            const result = await services.pages.parse({
              documentId: input.id,
              pageNumber: input.pageNumber,
              forceOcr: input.forceOcr ?? false,
            })
            sendJson(res, 200, result)
            return
          }
          case "parseDocumentPageStream": {
            const input = await readJson(req, documentPageParseRequestSchema)
            await streamParsedPage(res, input, services.pages)
            return
          }
          case "readPageTranslationCache": {
            const input = await readJson(req, pageTranslationCacheReadRequestSchema)
            const result = await services.translationCache.read(input)
            sendJson(res, 200, result)
            return
          }
          case "writePageTranslationCache": {
            const input = await readJson(req, pageTranslationCacheWriteRequestSchema)
            await services.translationCache.write(input)
            sendJson(res, 200, { ok: true })
            return
          }
          case "clearPageTranslationCache": {
            const input = await readJson(req, pageTranslationCacheReadRequestSchema)
            await services.translationCache.clear(input)
            sendJson(res, 200, { ok: true })
            return
          }
          case "runAi": {
            const input = await readJson(req, aiRequestSchema)
            const result = await services.ai.run(input)
            sendJson(res, 200, result)
            return
          }
          case "startAiJob": {
            const input = await readJson(req, aiJobStartRequestSchema)
            const stream = services.startAiJob(input)
            res.writeHead(200, {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-store",
              connection: "keep-alive",
            })
            const cancel = () => services.cancelAiJob(input.jobId)
            res.on("close", cancel)
            try {
              for await (const chunk of stream) {
                if (res.destroyed) break
                res.write(chunk)
              }
              if (!res.destroyed) res.end()
            } finally {
              res.off("close", cancel)
              cancel()
            }
            return
          }
          case "cancelAiJob": {
            const input = await readJson(req, aiJobCancelRequestSchema)
            services.cancelAiJob(input.jobId)
            sendJson(res, 200, { ok: true })
            return
          }
          case "lookupCitation": {
            const input = await readJson(req, citationLookupRequestSchema)
            const result = await services.lookupCitation(input)
            sendJson(res, 200, result)
            return
          }
          case "readDocumentAst": {
            const input = await readJson(req, documentAstRequestSchema)
            const result = documentAstResultSchema.parse(await services.ast.request(input))
            sendJson(res, 200, result)
            return
          }
          case "scholarlySearch": {
            const input = await readJson(req, scholarlySearchRequestSchema)
            const result = scholarlySearchResultSchema.parse(await services.searchScholarly(input))
            sendJson(res, 200, result)
            return
          }
          case "discoverySaveMetadata": {
            const input = await readJson(req, discoverySaveInputSchema)
            const result = discoverySaveResultSchema.parse(
              await services.saveScholarlyMetadata(input),
            )
            sendJson(res, 200, result)
            return
          }
          case "discoveryListSavedMetadata": {
            const result = discoverySavedMetadataResultSchema.parse(
              services.listSavedScholarlyMetadata(),
            )
            sendJson(res, 200, result)
            return
          }
          default: {
            sendError(res, 404, `unknown_rpc_method_${method}`)
            return
          }
        }
      }

      sendError(res, 404, "not_found")
    } catch (error) {
      const message = error instanceof Error ? error.message : "internal_server_error"
      if (res.headersSent) res.destroy()
      else sendError(res, 500, message)
    }
  })
}

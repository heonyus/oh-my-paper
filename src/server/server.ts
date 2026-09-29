import { readFile, stat } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extname, join } from "node:path"
import type { z } from "zod"
import {
  agentAskRequestSchema,
  agentAskResultSchema,
  agentStreamEventSchema,
} from "../shared/agentChat"
import { jevDecisionRequestSchema } from "../shared/aiDecision"
import { aiJobCancelRequestSchema, aiJobStartRequestSchema, aiRequestSchema } from "../shared/aiIpc"
import {
  discoverySavedMetadataResultSchema,
  discoverySaveInputSchema,
  discoverySaveResultSchema,
} from "../shared/discoveryIpc"
import {
  documentAnalysisRequestSchema,
  documentAnalysisSnapshotSchema,
} from "../shared/documentAnalysis"
import { documentAstRequestSchema, documentAstResultSchema } from "../shared/documentAstIpc"
import { documentPageParseRequestSchema } from "../shared/documentPageModel"
import {
  citationLookupRequestSchema,
  documentImportUrlRequestSchema,
  providerConfigSchema,
} from "../shared/ipc"
import {
  meaningSearchRequestSchema,
  meaningSearchStatusRequestSchema,
} from "../shared/meaningSearch"
import {
  pageTranslationCacheReadRequestSchema,
  pageTranslationCacheWriteRequestSchema,
} from "../shared/pageTranslationCache"
import { RemotePdfError, type RemotePdfErrorKind } from "../shared/remotePdf"
import { documentIdSchema, workspaceSchema } from "../shared/schemas"
import {
  scholarlySearchRequestSchema,
  scholarlySearchResultSchema,
  scholarlySearchStreamEventSchema,
} from "../shared/scholarlySearchSchemas"
import { createClaudeRoutes } from "./claudeRoutes"
import type { WebServerConfig } from "./config"
import { streamParsedPage } from "./pageParseStream"
import type { WebServices } from "./services"
import { importPdfBytes, importPdfFromUrl, readDocumentBase64, readWorkspace } from "./services"
import { createSubscriptionRoutes } from "./subscriptionRoutes"

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(data))
}

function sendError(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { error })
}

function remotePdfErrorStatus(kind: RemotePdfErrorKind): number {
  switch (kind) {
    case "invalid_url":
      return 400
    case "no_pdf_link":
      return 404
    case "too_large":
      return 413
    case "not_pdf":
      return 422
    case "unreachable":
      return 502
  }
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
  const subscriptionRoutes = createSubscriptionRoutes(services)
  const claudeRoutes = createClaudeRoutes(services)
  const server = createServer(async (req, res) => {
    try {
      const hostname = new URL(`http://${req.headers.host ?? config.host}`).hostname
      if (hostname !== "127.0.0.1" && hostname !== "localhost") {
        sendError(res, 403, "local_request_required")
        return
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      const pathname = url.pathname
      const requestOrigin = req.headers.origin
      const localOrigin = `http://${req.headers.host ?? `${config.host}:${config.port}`}`
      // Browser extensions run in the user's session and may upload PDFs the
      // server cannot fetch itself (e.g. sites behind a browser challenge).
      const extensionUpload =
        req.method === "POST" &&
        pathname === "/api/documents" &&
        typeof requestOrigin === "string" &&
        /^(chrome|moz|safari-web)-extension:\/\//.test(requestOrigin)

      const topLevelNavigation =
        req.method === "GET" &&
        req.headers["sec-fetch-mode"] === "navigate" &&
        !pathname.startsWith("/api/")

      if (
        !extensionUpload &&
        !topLevelNavigation &&
        ((requestOrigin && requestOrigin !== localOrigin) ||
          req.headers["sec-fetch-site"] === "cross-site")
      ) {
        sendError(res, 403, "cross_origin_request_rejected")
        return
      }

      res.setHeader("x-frame-options", "DENY")
      res.setHeader("access-control-allow-origin", localOrigin)
      res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS")
      res.setHeader("access-control-allow-headers", "content-type, authorization")

      if (req.method === "OPTIONS") {
        res.writeHead(204)
        res.end()
        return
      }

      if (await subscriptionRoutes.handle(pathname, req, res)) return
      if (await claudeRoutes.handle(pathname, req, res)) return

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

      if (pathname === "/api/events/document-analysis" && req.method === "GET") {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          connection: "keep-alive",
        })
        const send = (snapshot: ReturnType<typeof services.analysis.snapshot>): void => {
          if (!res.destroyed)
            res.write(`data: ${JSON.stringify(documentAnalysisSnapshotSchema.parse(snapshot))}\n\n`)
        }
        send(services.analysis.snapshot())
        const unsubscribe = services.analysis.subscribe(send)
        res.on("close", unsubscribe)
        return
      }

      if (pathname === "/api/documents" && req.method === "POST") {
        const name = url.searchParams.get("name") ?? "document.pdf"
        const bytes = await readBody(req)
        const result = await importPdfBytes(new Uint8Array(bytes), name, services)
        sendJson(res, 200, result)
        return
      }

      if (pathname === "/api/documents/url" && req.method === "POST") {
        const { url: remoteUrl } = await readJson(req, documentImportUrlRequestSchema)
        const result = await importPdfFromUrl(remoteUrl, services)
        sendJson(res, 200, result)
        return
      }

      if (pathname.startsWith("/api/documents/") && req.method === "DELETE") {
        const parts = pathname.split("/")
        const id = documentIdSchema.safeParse(parts[3])
        if (parts.length !== 4 || !id.success) {
          sendError(res, 400, "invalid_document_id")
          return
        }
        if (!(await services.deleteDocument(id.data))) {
          sendError(res, 404, "document_not_found")
          return
        }
        sendJson(res, 200, { ok: true })
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
          case "meaningSearchStatus": {
            const input = await readJson(req, meaningSearchStatusRequestSchema)
            if (input.prepare) void services.meaningSearch.prepare().catch(() => undefined)
            sendJson(res, 200, { state: services.meaningSearch.state() })
            return
          }
          case "rankByMeaning": {
            const input = await readJson(req, meaningSearchRequestSchema)
            sendJson(res, 200, await services.meaningSearch.rank(input))
            return
          }
          case "providerStatus": {
            sendJson(res, 200, await services.providerStatus())
            return
          }
          case "saveProviderConfig": {
            const input = await readJson(req, providerConfigSchema)
            await services.saveProviderConfig(input)
            sendJson(res, 200, await services.providerStatus())
            return
          }
          case "documentOcrStatus": {
            sendJson(res, 200, await services.ocrStatus())
            return
          }
          case "documentAnalysisStatus": {
            sendJson(res, 200, services.analysis.snapshot())
            return
          }
          case "retryDocumentAnalysis": {
            const input = await readJson(req, documentAnalysisRequestSchema)
            await services.analysis.reschedule(input.id)
            sendJson(res, 200, services.analysis.snapshot())
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
          case "agentAsk": {
            const input = await readJson(req, agentAskRequestSchema)
            const result = agentAskResultSchema.parse(await services.agentAsk(input))
            sendJson(res, 200, result)
            return
          }
          case "agentAskStream": {
            const input = await readJson(req, agentAskRequestSchema)
            res.writeHead(200, {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-store",
              connection: "keep-alive",
            })
            const send = (event: unknown): void => {
              if (!res.destroyed)
                res.write(`data: ${JSON.stringify(agentStreamEventSchema.parse(event))}\n\n`)
            }
            const controller = new AbortController()
            const abort = (): void => controller.abort()
            res.on("close", abort)
            try {
              const result = await services.agentAsk(
                input,
                (step) => send({ type: "step", step }),
                controller.signal,
              )
              send({ type: "result", result })
            } catch (error) {
              send({
                type: "error",
                error: error instanceof Error ? error.message.slice(0, 500) : "agent_ask_failed",
              })
            } finally {
              res.off("close", abort)
            }
            if (!res.destroyed) res.end()
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
          case "scholarlySearchStream": {
            const input = await readJson(req, scholarlySearchRequestSchema)
            res.writeHead(200, {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-store",
              connection: "keep-alive",
            })
            const send = (event: unknown): void => {
              if (!res.destroyed)
                res.write(
                  `data: ${JSON.stringify(scholarlySearchStreamEventSchema.parse(event))}\n\n`,
                )
            }
            const controller = new AbortController()
            const abort = (): void => controller.abort()
            res.on("close", abort)
            try {
              const result = await services.searchScholarly(input, {
                signal: controller.signal,
                onStep: (step) => send({ type: "step", step }),
              })
              send({ type: "result", result })
            } catch (error) {
              send({
                type: "error",
                error:
                  error instanceof Error ? error.message.slice(0, 500) : "scholarly_search_failed",
              })
            } finally {
              res.off("close", abort)
            }
            if (!res.destroyed) res.end()
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
      else if (error instanceof RemotePdfError) {
        sendError(res, remotePdfErrorStatus(error.kind), message)
      } else sendError(res, 500, message)
    }
  })
  server.on("close", subscriptionRoutes.dispose)
  return server
}

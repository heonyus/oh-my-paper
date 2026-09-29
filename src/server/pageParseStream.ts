import type { ServerResponse } from "node:http"
import type { DocumentPageParser } from "../electron/documentPageParser"
import {
  type DocumentPageParseProgress,
  type DocumentPageParseRequest,
  documentPageParseProgressSchema,
  documentPageParseRequestSchema,
  documentPageParseResultSchema,
} from "../shared/documentPageModel"
import {
  encodePageParseStreamEvent,
  PAGE_PARSE_STREAM_MAX_BUFFER_CHARS,
  type PageParseStreamEvent,
} from "../shared/pageParseStream"

export type PageParser = Pick<DocumentPageParser, "parse">

export class PageParseStreamError extends Error {
  readonly name = "PageParseStreamError"

  constructor(readonly kind: "event_too_large" | "progress_mismatch") {
    super(kind)
  }
}

async function writeEvent(res: ServerResponse, event: PageParseStreamEvent): Promise<void> {
  const encoded = encodePageParseStreamEvent(event)
  if (encoded.length > PAGE_PARSE_STREAM_MAX_BUFFER_CHARS) {
    throw new PageParseStreamError("event_too_large")
  }
  if (res.destroyed) return
  if (res.write(encoded)) return
  await new Promise<void>((resolve) => {
    const onDrain = () => {
      res.off("close", onClose)
      resolve()
    }
    const onClose = () => {
      res.off("drain", onDrain)
      resolve()
    }
    res.once("drain", onDrain)
    res.once("close", onClose)
  })
}

function errorMessage(error: unknown): string {
  if (error instanceof PageParseStreamError) return error.kind
  if (error instanceof Error) return error.message.slice(0, 500) || "page_parse_failed"
  return "page_parse_failed"
}

export async function streamParsedPage(
  res: ServerResponse,
  input: DocumentPageParseRequest,
  parser: PageParser,
): Promise<void> {
  const request = documentPageParseRequestSchema.parse(input)
  const controller = new AbortController()
  const onClose = () => controller.abort()
  let pendingWrite = Promise.resolve()
  const send = (event: PageParseStreamEvent): Promise<void> => writeEvent(res, event)
  const onProgress = (value: DocumentPageParseProgress): void => {
    const progress = documentPageParseProgressSchema.parse(value)
    if (progress.id !== request.id || progress.pageNumber !== request.pageNumber) {
      throw new PageParseStreamError("progress_mismatch")
    }
    pendingWrite = pendingWrite.then(() => send({ type: "progress", progress }))
    pendingWrite.catch(() => controller.abort())
  }
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  })
  res.once("close", onClose)
  try {
    const result = await parser.parse({
      documentId: request.id,
      pageNumber: request.pageNumber,
      forceOcr: request.forceOcr ?? false,
      preparedOnly: request.preparedOnly ?? false,
      awaitStructure: request.awaitStructure ?? false,
      onProgress,
      signal: controller.signal,
    })
    await pendingWrite
    if (controller.signal.aborted || res.destroyed) return
    await send({ type: "result", result: documentPageParseResultSchema.parse(result) })
    if (!res.destroyed) res.end()
  } catch (error) {
    if (controller.signal.aborted || res.destroyed) return
    await pendingWrite
    await send({ type: "error", error: errorMessage(error) })
    if (!res.destroyed) res.end()
  } finally {
    res.off("close", onClose)
    controller.abort()
  }
}

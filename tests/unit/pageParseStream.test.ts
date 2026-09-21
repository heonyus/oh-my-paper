import { createServer, type Server } from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { type PageParser, streamParsedPage } from "../../src/server/pageParseStream"
import type {
  DocumentPageParseProgress,
  DocumentPageParseResult,
} from "../../src/shared/documentPageModel"
import { documentIdSchema } from "../../src/shared/schemas"
import { createLocalPageParser, type LocalPageParserError } from "../../src/web/localPageParser"

const request = {
  id: documentIdSchema.parse("aabbccddeeff0011"),
  pageNumber: 2,
  forceOcr: true,
}
const result: DocumentPageParseResult = { status: "unavailable", reason: "runtime_missing" }

const servers: Server[] = []

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("server did not bind")
  return `http://127.0.0.1:${address.port}/api/rpc/parseDocumentPageStream`
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

describe("page parse progress stream", () => {
  it("streams real HTTP progress and returns the validated result", async () => {
    // Given
    const progress: DocumentPageParseProgress = {
      ...request,
      stage: "page-rendering",
    }
    const parser: PageParser = {
      parse: async (input) => {
        expect(input.signal?.aborted).toBe(false)
        input.onProgress?.(progress)
        return result
      },
    }
    const server = createServer((_, response) => {
      void streamParsedPage(response, request, parser)
    })
    servers.push(server)
    const endpoint = await listen(server)
    const stages: string[] = []
    const local = createLocalPageParser({
      endpoint,
      fetch: (input, init) => globalThis.fetch(input, { ...init, signal: null }),
    })
    const unsubscribe = local.onProgress((value) => stages.push(value.stage))

    // When
    const parsed = await local.parse(request)
    unsubscribe()

    // Then
    expect(parsed).toEqual(result)
    expect(stages).toEqual(["page-rendering"])
  })

  it("fails when the stream ends without a result event", async () => {
    // Given
    const local = createLocalPageParser({
      endpoint: "http://127.0.0.1/unused",
      fetch: async () => new Response('data: {"type":"progress"}\n\n'),
    })

    // When
    const operation = local.parse(request)

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LocalPageParserError",
      kind: "invalid_stream",
    } satisfies Partial<LocalPageParserError>)
  })

  it("reports EOF without a result after valid progress as a missing result", async () => {
    // Given
    const progress: DocumentPageParseProgress = { ...request, stage: "finalizing" }
    const event = `data: ${JSON.stringify({ type: "progress", progress })}\n\n`
    const local = createLocalPageParser({
      endpoint: "http://127.0.0.1/unused",
      fetch: async () => new Response(event),
    })

    // When
    const operation = local.parse(request)

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LocalPageParserError",
      kind: "missing_result",
    } satisfies Partial<LocalPageParserError>)
  })
})

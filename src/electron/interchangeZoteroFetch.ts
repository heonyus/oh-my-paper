import { z } from "zod"
import { type ZoteroItemData, zoteroApiResponseItemSchema } from "../shared/interchangeSchemas"
import type { ZoteroFetchResult } from "../shared/interchangeTypes"

const ALLOWED_ZOTERO_HOST = "localhost:23119"
const ALLOWED_PATH_REGEX = /^\/api\/(users\/[0-9a-zA-Z_-]+|groups\/[0-9a-zA-Z_-]+)\/items(\/top)?$/
const MAX_PAGE_LIMIT = 50
const DEFAULT_TIMEOUT_MS = 5000
const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2MB
const MAX_TOTAL_RESULTS = 100_000

export interface ZoteroFetchOptions {
  readonly resourcePath?: string
  readonly limit?: number
  readonly start?: number
  readonly timeoutMs?: number
  readonly customFetch?: typeof fetch
}

export function validateZoteroUrl(urlString: string): URL {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new Error("Invalid URL")
  }

  if (url.protocol !== "http:") {
    throw new Error(`Forbidden protocol: ${url.protocol}`)
  }

  if (url.host !== ALLOWED_ZOTERO_HOST) {
    throw new Error(
      `SSRF protection: host ${url.host} is not allowed. Only ${ALLOWED_ZOTERO_HOST} is permitted.`,
    )
  }

  if (url.username || url.password) {
    throw new Error("Credentials injection in URL is forbidden")
  }

  if (url.search) {
    throw new Error("Query parameters in Zotero URL are forbidden")
  }

  if (url.hash) {
    throw new Error("URL fragment injection is forbidden")
  }

  if (url.pathname.includes("..")) {
    throw new Error("Path traversal in resource path is forbidden")
  }

  if (!ALLOWED_PATH_REGEX.test(url.pathname)) {
    throw new Error(`Forbidden resource path: ${url.pathname}`)
  }

  return url
}

async function readBoundedBody(
  res: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  if (res.body === null || typeof res.body.getReader !== "function") {
    throw new Error("Zotero response body stream is unavailable")
  }

  const reader = res.body.getReader()
  {
    const decoder = new TextDecoder("utf-8")
    let totalBytes = 0
    let text = ""
    try {
      while (true) {
        if (signal.aborted) {
          throw new Error("Zotero fetch aborted due to timeout")
        }
        const { done, value } = await readChunk(reader, signal)
        if (done) break
        if (value) {
          totalBytes += value.byteLength
          if (totalBytes > maxBytes) {
            await reader.cancel()
            throw new Error(`Zotero response exceeded maximum size limit of ${maxBytes} bytes`)
          }
          text += decoder.decode(value, { stream: true })
        }
      }
      text += decoder.decode()
      return text
    } finally {
      reader.releaseLock()
    }
  }
}

function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(new Error("Zotero fetch aborted due to timeout"))

  return new Promise((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener("abort", onAbort)
    const onAbort = (): void => {
      cleanup()
      reject(new Error("Zotero fetch aborted due to timeout"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
    reader.read().then(
      (result) => {
        cleanup()
        resolve(result)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
  })
}

export async function fetchLocalZoteroItems(
  options: ZoteroFetchOptions = {},
): Promise<ZoteroFetchResult> {
  const rawPath = options.resourcePath ?? "/api/users/0/items/top"
  if (rawPath.includes("?") || rawPath.includes("#")) {
    throw new Error("Query parameters and fragments in resourcePath are forbidden")
  }

  const rawLimit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.floor(options.limit)
      : 25
  const limit = Math.max(1, Math.min(rawLimit, MAX_PAGE_LIMIT))

  const rawStart =
    typeof options.start === "number" && Number.isFinite(options.start)
      ? Math.floor(options.start)
      : 0
  const start = Math.max(0, Math.min(rawStart, 100_000))

  const rawTimeout =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)
      ? Math.floor(options.timeoutMs)
      : DEFAULT_TIMEOUT_MS
  const timeoutMs = Math.max(100, Math.min(rawTimeout, 60_000))

  const validUrl = validateZoteroUrl(`http://${ALLOWED_ZOTERO_HOST}${rawPath}`)
  validUrl.searchParams.set("limit", String(limit))
  validUrl.searchParams.set("start", String(start))

  const fetchFn = options.customFetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  let rawText = ""
  try {
    res = await fetchFn(validUrl.toString(), {
      method: "GET",
      headers: {
        "Zotero-API-Version": "3",
        Accept: "application/json",
      },
      redirect: "error",
      signal: controller.signal,
    })

    if (res.status >= 300 && res.status < 400) {
      throw new Error(`Zotero fetch redirected with status ${res.status}: redirects are forbidden`)
    }

    if (!res.ok) {
      throw new Error(`Zotero local API error: ${res.status} ${res.statusText}`)
    }

    const contentLengthHeader = res.headers.get("content-length")
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null
    if (
      contentLength !== null &&
      Number.isFinite(contentLength) &&
      contentLength > MAX_BODY_BYTES
    ) {
      throw new Error(`Zotero response exceeded maximum size limit of ${MAX_BODY_BYTES} bytes`)
    }

    rawText = await readBoundedBody(res, MAX_BODY_BYTES, controller.signal)
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("Zotero local fetch timed out")
    }
    throw new Error(`Zotero local fetch failed: ${String(err)}`)
  } finally {
    clearTimeout(timer)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch (err) {
    throw new Error(`Zotero response is not valid JSON: ${String(err)}`)
  }

  const arraySchema = z.array(z.unknown())
  const parseArray = arraySchema.safeParse(parsed)
  if (!parseArray.success) {
    throw new Error("Zotero response is not an array")
  }

  const items: ZoteroItemData[] = []
  const validationErrors: { index: number; error: string }[] = []
  let invalidCount = 0

  for (let i = 0; i < parseArray.data.length; i++) {
    const rawItem = parseArray.data[i]
    const validatedItem = zoteroApiResponseItemSchema.safeParse(rawItem)
    if (validatedItem.success) {
      items.push(validatedItem.data.data)
    } else {
      invalidCount++
      validationErrors.push({
        index: i,
        error: validatedItem.error.message,
      })
    }
  }

  const totalResultsHeader = res.headers.get("Total-Results")
  const parsedTotalResults = totalResultsHeader ? Number.parseInt(totalResultsHeader, 10) : null
  const totalResults =
    parsedTotalResults !== null &&
    Number.isInteger(parsedTotalResults) &&
    parsedTotalResults >= 0 &&
    parsedTotalResults <= MAX_TOTAL_RESULTS
      ? parsedTotalResults
      : null

  return {
    items,
    totalResults: Number.isNaN(totalResults) ? null : totalResults,
    validCount: items.length,
    invalidCount,
    validationErrors,
  }
}

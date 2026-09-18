import type { ZodType } from "zod"

import { ApiError, type ErrorCode } from "./errors"

const MAX_BODY_BYTES = 16 * 1_024

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(400, "invalid_request", "Content-Type must be application/json")
  }
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0")
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ApiError(413, "body_too_large", "Request body exceeds 16384 bytes")
  }
  if (!request.body) throw new ApiError(400, "invalid_request", "JSON body is required")

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let body = ""
  let bytesRead = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytesRead += chunk.value.byteLength
    if (bytesRead > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new ApiError(413, "body_too_large", "Request body exceeds 16384 bytes")
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  body += decoder.decode()

  let value: unknown
  try {
    value = JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(400, "invalid_request", "Request body must be valid JSON")
    }
    throw error
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, "invalid_request", "Request body is invalid")
  return parsed.data
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? ""
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization)
  const token = match?.[1]
  if (!token) throw new ApiError(401, "invalid_access", "Access credential is missing or invalid")
  return token
}

export function clientKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unavailable"
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export function apiError(error: ApiError): Response {
  return json({ error: { code: error.code, message: error.message } }, error.status)
}

export function routeError(status: number, code: ErrorCode, message: string): Response {
  return apiError(new ApiError(status, code, message))
}

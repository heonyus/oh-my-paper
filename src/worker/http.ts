import { z } from "zod"

export class HttpError extends Error {
  readonly name = "HttpError"

  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

export function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: { "cache-control": "no-store", ...init?.headers },
  })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.code }, { status: error.status })
  return json({ error: "internal_error" }, { status: 500 })
}

export const pageNumberSchema = z.coerce.number().int().positive()

export function routeSegments(request: Request): readonly string[] {
  return new URL(request.url).pathname.split("/").filter(Boolean)
}

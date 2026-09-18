import { z } from "zod"

const failureSchema = z.object({ error: z.string().max(500) })

export class LocalApiError extends Error {
  readonly name = "LocalApiError"

  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

export async function readLocalResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json()
  if (!response.ok) {
    const failure = failureSchema.safeParse(body)
    throw new LocalApiError(
      response.status,
      failure.success ? failure.data.error : "request_failed",
    )
  }
  return schema.parse(body)
}

export async function localRpc<T>(
  method: string,
  input: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`/api/rpc/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(180_000),
  })
  return readLocalResponse(response, schema)
}

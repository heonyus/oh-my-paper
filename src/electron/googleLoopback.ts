import { createServer } from "node:http"
import { z } from "zod"

const callbackSchema = z
  .object({
    code: z.string().min(1).max(4_096).nullable(),
    error: z.string().min(1).max(200).nullable(),
    state: z.string().min(1).max(200),
  })
  .strict()

export class GoogleLoopbackError extends Error {
  readonly name = "GoogleLoopbackError"
  constructor(readonly kind: "cancelled" | "invalid_callback" | "timeout") {
    super(kind)
  }
}

export type GoogleLoopback = {
  readonly redirectUri: string
  readonly result: Promise<string>
  readonly cancel: () => void
}

export async function startGoogleLoopback(
  expectedState: string,
  timeoutMs: number,
): Promise<GoogleLoopback> {
  let resolveResult: ((code: string) => void) | null = null
  let rejectResult: ((error: GoogleLoopbackError) => void) | null = null
  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  let settled = false
  let redirectUri = ""
  let timer: ReturnType<typeof setTimeout> | null = null

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", redirectUri)
    if (request.method !== "GET" || url.pathname !== "/oauth2/callback") {
      respond(response, 404, "로그인 요청을 찾을 수 없습니다.")
      return
    }
    const parsed = callbackSchema.safeParse({
      code: url.searchParams.get("code"),
      error: url.searchParams.get("error"),
      state: url.searchParams.get("state"),
    })
    if (!parsed.success || parsed.data.state !== expectedState) {
      respond(response, 400, "로그인 요청이 일치하지 않습니다. 앱으로 돌아가 다시 시도하세요.")
      return
    }
    if (parsed.data.error || !parsed.data.code) {
      respond(response, 400, "로그인이 취소되었습니다. 이 창을 닫아도 됩니다.")
      settleReject(new GoogleLoopbackError("cancelled"))
      return
    }
    respond(response, 200, "로그인이 확인되었습니다. 이 창을 닫고 Scourgify로 돌아가세요.")
    settleResolve(parsed.data.code)
  })

  function finish(): void {
    if (timer) clearTimeout(timer)
    timer = null
    server.close()
  }

  function settleResolve(code: string): void {
    if (settled) return
    settled = true
    finish()
    resolveResult?.(code)
  }

  function settleReject(error: GoogleLoopbackError): void {
    if (settled) return
    settled = true
    finish()
    rejectResult?.(error)
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    server.once("error", onError)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new GoogleLoopbackError("invalid_callback")
  }
  redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`
  timer = setTimeout(() => settleReject(new GoogleLoopbackError("timeout")), timeoutMs)
  server.once("error", () => settleReject(new GoogleLoopbackError("invalid_callback")))
  return {
    redirectUri,
    result,
    cancel: () => settleReject(new GoogleLoopbackError("cancelled")),
  }
}

function respond(
  response: import("node:http").ServerResponse,
  status: number,
  message: string,
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  })
  response.end(
    `<!doctype html><meta charset="utf-8"><title>Scourgify 로그인</title><p>${message}</p>`,
  )
}

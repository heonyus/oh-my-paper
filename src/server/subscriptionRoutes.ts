import type { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod"
import { codexLoginCancelRequestSchema, codexLoginStartRequestSchema } from "../shared/codexIpc"
import {
  type CodexLoginCompletedEvent,
  codexAccountStatusSchema,
  codexLoginCompletedEventSchema,
  codexLoginStartResultSchema,
} from "../shared/codexTypes"
import { aiModeRequestSchema, providerStatusSchema } from "../shared/ipc"
import type { WebServices } from "./services"

const emptyRequestSchema = z.object({}).strict()

async function readInput<T>(request: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new Error("JSON 요청이 필요합니다")
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 16_384) throw new Error("로그인 설정 요청이 너무 큽니다")
    chunks.push(bytes)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  return schema.parse(value)
}

function reply(response: ServerResponse, value: unknown): void {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(JSON.stringify(value))
}

type SubscriptionRouteServices = Pick<WebServices, "saveAiMode" | "providerStatus"> & {
  readonly subscription: Pick<
    WebServices["subscription"],
    "getStatus" | "startLogin" | "cancelLogin" | "logout" | "onLoginCompleted"
  >
}

export function createSubscriptionRoutes(services: SubscriptionRouteServices) {
  const listeners = new Set<ServerResponse>()
  let lastEvent: CodexLoginCompletedEvent | null = null
  const unsubscribe = services.subscription.onLoginCompleted((event) => {
    lastEvent = codexLoginCompletedEventSchema.parse(event)
    for (const listener of listeners) {
      if (!listener.destroyed) listener.write(`data: ${JSON.stringify(lastEvent)}\n\n`)
    }
  })

  return {
    dispose: (): void => {
      unsubscribe()
      for (const listener of listeners) listener.end()
      listeners.clear()
    },
    handle: async (
      pathname: string,
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<boolean> => {
      if (pathname === "/api/events/codex-login" && request.method === "GET") {
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          connection: "keep-alive",
        })
        response.write(": connected\n\n")
        if (lastEvent) response.write(`data: ${JSON.stringify(lastEvent)}\n\n`)
        listeners.add(response)
        response.on("close", () => listeners.delete(response))
        return true
      }
      if (request.method !== "POST") return false
      switch (pathname) {
        case "/api/rpc/codexGetStatus": {
          await readInput(request, emptyRequestSchema)
          const status = codexAccountStatusSchema.parse(await services.subscription.getStatus())
          reply(response, { ...status, executablePath: undefined })
          return true
        }
        case "/api/rpc/codexStartLogin": {
          const input = await readInput(request, codexLoginStartRequestSchema)
          lastEvent = null
          const result = await services.subscription.startLogin(input.type)
          reply(response, codexLoginStartResultSchema.parse(result))
          return true
        }
        case "/api/rpc/codexCancelLogin": {
          const input = await readInput(request, codexLoginCancelRequestSchema)
          await services.subscription.cancelLogin(input.loginId)
          lastEvent = null
          reply(response, { ok: true })
          return true
        }
        case "/api/rpc/codexLogout": {
          await readInput(request, emptyRequestSchema)
          await services.subscription.logout()
          lastEvent = null
          reply(response, { ok: true })
          return true
        }
        case "/api/rpc/saveAiMode": {
          const input = await readInput(request, aiModeRequestSchema)
          await services.saveAiMode(input)
          reply(response, providerStatusSchema.parse(await services.providerStatus()))
          return true
        }
        default:
          return false
      }
    },
  }
}

import type { IncomingMessage, ServerResponse } from "node:http"
import { claudeAccountStatusSchema } from "../shared/claudeTypes"
import type { WebServices } from "./services"
import { emptyRequestSchema, readInput, reply } from "./subscriptionRoutes"

type ClaudeRouteServices = {
  readonly claude: Pick<WebServices["claude"], "getStatus" | "startLogin" | "cancelLogin">
}

export function createClaudeRoutes(services: ClaudeRouteServices) {
  return {
    handle: async (
      pathname: string,
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<boolean> => {
      if (request.method !== "POST") return false
      switch (pathname) {
        case "/api/rpc/claudeGetStatus": {
          await readInput(request, emptyRequestSchema)
          reply(
            response,
            claudeAccountStatusSchema.parse(await services.claude.getStatus({ fresh: true })),
          )
          return true
        }
        case "/api/rpc/claudeStartLogin": {
          await readInput(request, emptyRequestSchema)
          reply(response, claudeAccountStatusSchema.parse(await services.claude.startLogin()))
          return true
        }
        case "/api/rpc/claudeCancelLogin": {
          await readInput(request, emptyRequestSchema)
          reply(response, claudeAccountStatusSchema.parse(await services.claude.cancelLogin()))
          return true
        }
        default:
          return false
      }
    },
  }
}

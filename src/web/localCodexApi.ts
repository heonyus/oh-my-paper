import { z } from "zod"
import {
  codexAccountStatusSchema,
  codexLoginCompletedEventSchema,
  codexLoginStartResultSchema,
  codexModelListSchema,
} from "../shared/codexTypes"
import type { OhMyPaperApi } from "../shared/ipc"
import { localRpc } from "./localTransport"

const okSchema = z.object({ ok: z.literal(true) })

export function createLocalCodexApi(): OhMyPaperApi["codex"] {
  return {
    getStatus: () => localRpc("codexGetStatus", {}, codexAccountStatusSchema),
    listModels: () => localRpc("codexListModels", {}, codexModelListSchema),
    startLogin: (type = "chatgpt") =>
      localRpc("codexStartLogin", { type }, codexLoginStartResultSchema),
    cancelLogin: async (loginId) => {
      await localRpc("codexCancelLogin", { loginId }, okSchema)
    },
    logout: async () => {
      await localRpc("codexLogout", {}, okSchema)
    },
    onLoginCompleted: (listener) => {
      const events = new EventSource("/api/events/codex-login")
      events.onmessage = (event: MessageEvent<string>) => {
        try {
          const value: unknown = JSON.parse(event.data)
          listener(codexLoginCompletedEventSchema.parse(value))
        } catch (error) {
          if (!(error instanceof SyntaxError) && !(error instanceof z.ZodError)) throw error
          listener({ success: false, error: "로그인 상태 응답을 읽지 못했습니다. 새로고침하세요." })
        }
      }
      return () => events.close()
    },
  }
}

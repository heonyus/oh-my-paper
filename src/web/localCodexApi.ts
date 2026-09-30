import { z } from "zod"
import { browserLocale } from "../renderer/lib/locale"
import { subscriptionMessages } from "../renderer/messages/subscription"
import {
  codexAccountStatusSchema,
  codexLoginCompletedEventSchema,
  codexLoginStartResultSchema,
  codexModelListSchema,
} from "../shared/codexTypes"
import { isLocale, type Locale, translator } from "../shared/i18n/locale"
import type { OhMyPaperApi } from "../shared/ipc"
import { localRpc } from "./localTransport"

const okSchema = z.object({ ok: z.literal(true) })

/** The app's language as the page last declared it; this runs outside React's locale context. */
function pageLocale(): Locale {
  const lang = document.documentElement.lang
  return isLocale(lang) ? lang : browserLocale()
}

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
          const t = translator(subscriptionMessages, pageLocale())
          listener({ success: false, error: t("sub.chatgpt.loginUnreadable") })
        }
      }
      return () => events.close()
    },
  }
}

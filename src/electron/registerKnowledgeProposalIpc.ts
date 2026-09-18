import { ipcMain } from "electron"
import {
  knowledgeActionChannels,
  proposalResultSchema,
  proposalScopeSchema,
} from "../shared/knowledgeActions"
import type { AiModeStore } from "./aiModeStore"
import type { CodexSubscriptionAdapter } from "./codexSubscriptionAdapter"
import { commitProposals, proposalContext } from "./knowledgeProposals"
import type { KnowledgeRepository } from "./knowledgeRepository"
import type { ProviderService } from "./providerService"

export function registerKnowledgeProposalIpc(
  repo: KnowledgeRepository,
  provider: ProviderService,
  subscription: CodexSubscriptionAdapter,
  modes: AiModeStore,
): () => void {
  const pending = new Map<number, AbortController>()
  ipcMain.handle(knowledgeActionChannels.propose, async (event, value: unknown) => {
    if (pending.has(event.sender.id)) throw new Error("이미 제안을 생성하고 있습니다.")
    const { nodeIds } = proposalScopeSchema.parse(value)
    const scope = proposalContext(repo, nodeIds)
    const controller = new AbortController()
    pending.set(event.sender.id, controller)
    const abort = () => controller.abort()
    const timeout = setTimeout(abort, 120_000)
    event.sender.once("destroyed", abort)
    try {
      const mode = await modes.load()
      const result =
        mode === "chatgpt"
          ? {
              text: await subscription.runCompletion({
                prompt: scope.prompt,
                signal: controller.signal,
              }),
              model: "ChatGPT subscription / Codex default",
            }
          : await provider.completePrompt(scope.prompt, controller.signal)
      if (controller.signal.aborted)
        throw new Error("제안 생성을 취소했습니다. 저장하지 않았습니다.")
      return proposalResultSchema.parse(commitProposals(repo, scope, result.text, result.model))
    } finally {
      clearTimeout(timeout)
      event.sender.removeListener("destroyed", abort)
      pending.delete(event.sender.id)
    }
  })
  ipcMain.handle(knowledgeActionChannels.cancel, (event) => {
    pending.get(event.sender.id)?.abort()
  })
  return () => {
    for (const controller of pending.values()) controller.abort()
    ipcMain.removeHandler(knowledgeActionChannels.propose)
    ipcMain.removeHandler(knowledgeActionChannels.cancel)
  }
}

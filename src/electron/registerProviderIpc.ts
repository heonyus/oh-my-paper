import { ipcMain } from "electron"
import { CODEX_DEFAULT_MODEL } from "../shared/codexTypes"
import {
  aiJobCancelRequestSchema,
  aiJobEventSchema,
  aiJobStartRequestSchema,
  aiJobStartResultSchema,
  aiModeRequestSchema,
  aiRequestSchema,
  aiResultSchema,
  aiStreamDeltaSchema,
  aiStreamRequestSchema,
  apiKeySchema,
  providerConfigSchema,
  providerStatusSchema,
} from "../shared/ipc"
import { ipcChannels } from "../shared/ipcChannels"
import { AiJobRegistry, publicAiJobEvent } from "./aiJobRegistry"
import { AiModeConfigurationError, type AiModeStore } from "./aiModeStore"
import type { CodexSubscriptionAdapter } from "./codexSubscriptionAdapter"
import type { ProviderService } from "./providerService"
import { subscriptionPrompt } from "./subscriptionPrompt"

type ProviderIpcSender = {
  readonly isDestroyed: () => boolean
  readonly send: (channel: string, value: unknown) => void
}

export type ProviderIpcEvent = { readonly sender: ProviderIpcSender }

type ProviderIpcHandler = (event: ProviderIpcEvent, value: unknown) => Promise<unknown> | unknown

export type ProviderIpcMain = {
  readonly handle: (channel: string, listener: ProviderIpcHandler) => void
  readonly removeHandler: (channel: string) => void
}

type ProviderRuntime = Pick<
  ProviderService,
  "saveKey" | "saveConfig" | "status" | "run" | "runStream"
>
type CodexRuntime = Pick<
  CodexSubscriptionAdapter,
  "getStatus" | "assertAuthenticated" | "runCompletion"
>
type AiModeRuntime = Pick<AiModeStore, "load" | "save" | "loadSettings">

export function registerProviderIpc(
  provider: ProviderRuntime,
  codexAdapter: CodexRuntime,
  aiModes: AiModeRuntime,
  ipc: ProviderIpcMain = ipcMain,
): { readonly dispose: () => void } {
  const aiJobSenders = new Set<ProviderIpcSender>()
  const aiJobs = new AiJobRegistry((event) => {
    const value = aiJobEventSchema.parse(publicAiJobEvent(event))
    for (const sender of aiJobSenders) {
      if (!sender.isDestroyed()) {
        sender.send(ipcChannels.aiJobEvent, value)
      }
    }
  })

  ipc.handle(ipcChannels.providerSaveKey, async (_event, value: unknown) => {
    await provider.saveKey(apiKeySchema.parse(value))
  })

  ipc.handle(ipcChannels.providerSaveConfig, async (_event, value: unknown) => {
    await provider.saveConfig(providerConfigSchema.parse(value))
  })

  ipc.handle(ipcChannels.providerSaveMode, async (_event, value: unknown) => {
    const parsed = aiModeRequestSchema.parse(value)
    if (parsed.mode === "claude") {
      throw new AiModeConfigurationError("Claude 구독 모드는 브라우저 앱에서만 사용할 수 있습니다")
    }
    await aiModes.save(parsed)
  })

  ipc.handle(ipcChannels.providerStatus, async () => {
    const settings = await aiModes.loadSettings()
    if (settings.mode === "chatgpt") {
      const codexStatus = await codexAdapter.getStatus()
      return providerStatusSchema.parse({
        configured: codexStatus.authenticated,
        provider: "openai",
        model: settings.codexModel ?? CODEX_DEFAULT_MODEL,
        mode: settings.mode,
        codexModel: settings.codexModel ?? CODEX_DEFAULT_MODEL,
        codexReasoningEffort: settings.codexReasoningEffort ?? "medium",
      })
    }
    return providerStatusSchema.parse({
      ...(await provider.status()),
      mode: settings.mode,
      codexModel: settings.codexModel,
      codexReasoningEffort: settings.codexReasoningEffort,
    })
  })

  ipc.handle(ipcChannels.aiRun, async (_event, value: unknown) => {
    const request = aiRequestSchema.parse(value)
    const settings = await aiModes.loadSettings()
    if (settings.mode === "chatgpt") {
      await codexAdapter.assertAuthenticated()
      const prompt = subscriptionPrompt(request)
      const text = await codexAdapter.runCompletion({
        prompt,
        imageDataUrl: request.imageDataUrl,
        model: settings.codexModel ?? CODEX_DEFAULT_MODEL,
        reasoningEffort: settings.codexReasoningEffort ?? "medium",
      })
      return aiResultSchema.parse({ text, model: settings.codexModel ?? CODEX_DEFAULT_MODEL })
    }
    return aiResultSchema.parse(await provider.run(request))
  })

  ipc.handle(ipcChannels.aiStream, async (event, value: unknown) => {
    const streamRequest = aiStreamRequestSchema.parse(value)
    const settings = await aiModes.loadSettings()
    if (settings.mode === "chatgpt") {
      await codexAdapter.assertAuthenticated()
      const prompt = subscriptionPrompt(streamRequest.request)
      const text = await codexAdapter.runCompletion({
        prompt,
        imageDataUrl: streamRequest.request.imageDataUrl,
        model: settings.codexModel ?? CODEX_DEFAULT_MODEL,
        reasoningEffort: settings.codexReasoningEffort ?? "medium",
        onDelta: (delta) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(
              ipcChannels.aiStreamDelta,
              aiStreamDeltaSchema.parse({ id: streamRequest.id, delta }),
            )
          }
        },
      })
      return aiResultSchema.parse({ text, model: settings.codexModel ?? CODEX_DEFAULT_MODEL })
    }
    return aiResultSchema.parse(
      await provider.runStream(streamRequest.request, (delta) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(
            ipcChannels.aiStreamDelta,
            aiStreamDeltaSchema.parse({ id: streamRequest.id, delta }),
          )
        }
      }),
    )
  })

  ipc.handle(ipcChannels.aiJobStart, async (event, value: unknown) => {
    const request = aiJobStartRequestSchema.parse(value)
    const settings = await aiModes.loadSettings()
    if (settings.mode === "chatgpt") await codexAdapter.assertAuthenticated()
    aiJobSenders.add(event.sender)
    aiJobs.start({
      id: request.jobId,
      role: request.role,
      run: async (signal, onDelta) => {
        if (settings.mode === "chatgpt") {
          await codexAdapter.assertAuthenticated()
          const prompt = subscriptionPrompt(request.request)
          const text = await codexAdapter.runCompletion({
            prompt,
            imageDataUrl: request.request.imageDataUrl,
            model: settings.codexModel ?? CODEX_DEFAULT_MODEL,
            reasoningEffort: settings.codexReasoningEffort ?? "medium",
            onDelta,
            signal,
          })
          return {
            text,
            model: settings.codexModel ?? CODEX_DEFAULT_MODEL,
            inputTokens: null,
            outputTokens: null,
            estimatedCostUsd: null,
          }
        }
        const completion = await provider.runStream(request.request, onDelta, signal)
        return {
          text: completion.text,
          model: completion.model,
          inputTokens: null,
          outputTokens: null,
          estimatedCostUsd: null,
        }
      },
    })
    return aiJobStartResultSchema.parse({ jobId: request.jobId })
  })

  ipc.handle(ipcChannels.aiJobCancel, (_event, value: unknown) => {
    const request = aiJobCancelRequestSchema.parse(value)
    aiJobs.cancel(request.jobId)
  })

  return {
    dispose: () => {
      ipc.removeHandler(ipcChannels.providerSaveKey)
      ipc.removeHandler(ipcChannels.providerSaveConfig)
      ipc.removeHandler(ipcChannels.providerSaveMode)
      ipc.removeHandler(ipcChannels.providerStatus)
      ipc.removeHandler(ipcChannels.aiRun)
      ipc.removeHandler(ipcChannels.aiStream)
      ipc.removeHandler(ipcChannels.aiJobStart)
      ipc.removeHandler(ipcChannels.aiJobCancel)
    },
  }
}

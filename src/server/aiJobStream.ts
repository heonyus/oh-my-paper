import {
  AiJobRegistry,
  type ProviderCompletionResult,
  publicAiJobEvent,
} from "../electron/aiJobRegistry"
import type { AiJobStartRequest } from "../shared/aiIpc"
import type { AiJobEvent, AiJobId } from "../shared/documentAiJobs"
import type { WebAiService } from "./aiService"

type StreamService = Pick<WebAiService, "stream">

export function createLocalAiJobBroker(
  ai: StreamService,
  emit: (event: AiJobEvent) => void,
): {
  readonly start: (request: AiJobStartRequest) => Promise<{ readonly jobId: AiJobId }>
  readonly cancel: (jobId: AiJobId) => Promise<void>
  readonly dispose: () => void
} {
  const registry = new AiJobRegistry((registryEvent) => {
    emit(publicAiJobEvent(registryEvent))
  })

  return {
    async start(request): Promise<{ readonly jobId: AiJobId }> {
      registry.start({
        id: request.jobId,
        role: request.role,
        run: (signal, onDelta): Promise<ProviderCompletionResult> =>
          ai.stream(request.request, onDelta, signal).then((completion) => ({
            text: completion.text,
            model: completion.model,
            inputTokens: null,
            outputTokens: null,
            estimatedCostUsd: null,
          })),
      })
      return { jobId: request.jobId }
    },
    async cancel(jobId): Promise<void> {
      registry.cancel(jobId)
    },
    dispose(): void {
      registry.dispose()
    },
  }
}

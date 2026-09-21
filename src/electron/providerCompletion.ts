import type OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import type { ResponseFormatJSONSchema } from "openai/resources/shared"

type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "function_call" | null

type CompletionParameters = {
  readonly max_tokens?: number
  readonly max_completion_tokens?: number
  readonly reasoning_effort?: "minimal" | "low"
  readonly temperature?: 0
  readonly response_format?: ResponseFormatJSONSchema
}

type CompletionInput = {
  readonly model: string
  readonly messages: readonly ChatCompletionMessageParam[]
  readonly parameters: CompletionParameters
  readonly signal?: AbortSignal
}

type StreamCompletionInput = CompletionInput & {
  readonly onDelta: (delta: string) => void
}

type CompletedText = {
  readonly text: string
  readonly model: string
}

const completionRoundLimit = 3
const continuationInstruction =
  "Continue exactly where the previous response stopped. Do not repeat earlier text. Finish the current sentence and all remaining required sections."

export class IncompleteCompletionError extends Error {
  readonly name = "IncompleteCompletionError"

  constructor(readonly finishReason: FinishReason) {
    super(finishReason ?? "missing_finish_reason")
  }
}

export class CompletionAbortedError extends Error {
  readonly name = "AbortError"

  constructor() {
    super("aborted")
  }
}

function requestParameters(input: CompletionInput): {
  readonly model: string
  readonly messages: ChatCompletionMessageParam[]
  readonly max_tokens?: number
  readonly max_completion_tokens?: number
  readonly reasoning_effort?: "minimal" | "low"
  readonly temperature?: 0
  readonly response_format?: ResponseFormatJSONSchema
  readonly signal?: AbortSignal
} {
  return {
    model: input.model,
    messages: [...input.messages],
    ...input.parameters,
  }
}

function requestOptions(input: CompletionInput): { readonly signal: AbortSignal } | undefined {
  return input.signal ? { signal: input.signal } : undefined
}

function continuedMessages(
  messages: readonly ChatCompletionMessageParam[],
  partial: string,
): readonly ChatCompletionMessageParam[] {
  return [
    ...messages,
    { role: "assistant", content: partial },
    { role: "user", content: continuationInstruction },
  ]
}

function withoutRepeatedPrefix(existing: string, continuation: string): string {
  const maximum = Math.min(existing.length, continuation.length)
  for (let size = maximum; size > 0; size -= 1) {
    if (existing.endsWith(continuation.slice(0, size))) return continuation.slice(size)
  }
  return continuation
}

export function shouldContinueCompletion(
  parameters: Pick<CompletionParameters, "response_format">,
  finishReason: FinishReason,
): boolean {
  return finishReason === "length" && parameters.response_format === undefined
}

function nextMessagesOrThrow(
  messages: readonly ChatCompletionMessageParam[],
  segment: string,
  finishReason: FinishReason,
  allowContinuation: boolean,
): readonly ChatCompletionMessageParam[] | null {
  if (finishReason === "stop") return null
  if (allowContinuation && finishReason === "length") return continuedMessages(messages, segment)
  throw new IncompleteCompletionError(finishReason)
}

export async function completeChat(client: OpenAI, input: CompletionInput): Promise<CompletedText> {
  let messages = input.messages
  let text = ""
  let responseModel = input.model
  for (let round = 0; round < completionRoundLimit; round += 1) {
    if (input.signal?.aborted) throw new CompletionAbortedError()
    const response = await client.chat.completions.create(
      {
        ...requestParameters({ ...input, messages }),
      },
      requestOptions(input),
    )
    const choice = response.choices[0]
    const segment = choice?.message.content
    if (!segment) throw new IncompleteCompletionError(choice?.finish_reason ?? null)
    responseModel = response.model || responseModel
    const novel = round === 0 ? segment : withoutRepeatedPrefix(text, segment)
    text += novel
    const next = nextMessagesOrThrow(
      messages,
      segment,
      choice.finish_reason,
      shouldContinueCompletion(input.parameters, choice.finish_reason),
    )
    if (!next) return { text, model: responseModel }
    messages = next
  }
  throw new IncompleteCompletionError("length")
}

export async function streamChat(
  client: OpenAI,
  input: StreamCompletionInput,
): Promise<CompletedText> {
  let messages = input.messages
  let text = ""
  let responseModel = input.model
  for (let round = 0; round < completionRoundLimit; round += 1) {
    if (input.signal?.aborted) throw new CompletionAbortedError()
    const stream = await client.chat.completions.create(
      {
        ...requestParameters({ ...input, messages }),
        stream: true,
      },
      requestOptions(input),
    )
    let segment = ""
    let finishReason: FinishReason = null
    for await (const chunk of stream) {
      responseModel = chunk.model || responseModel
      const choice = chunk.choices[0]
      if (choice?.finish_reason) finishReason = choice.finish_reason
      const delta = choice?.delta.content
      if (!delta) continue
      segment += delta
      if (round === 0 && !input.signal?.aborted) input.onDelta(delta)
    }
    if (!segment) throw new IncompleteCompletionError(finishReason)
    const novel = round === 0 ? segment : withoutRepeatedPrefix(text, segment)
    text += novel
    if (round > 0 && novel) input.onDelta(novel)
    const next = nextMessagesOrThrow(
      messages,
      segment,
      finishReason,
      shouldContinueCompletion(input.parameters, finishReason),
    )
    if (!next) return { text, model: responseModel }
    messages = next
  }
  throw new IncompleteCompletionError("length")
}

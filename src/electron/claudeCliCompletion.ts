import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { z } from "zod"
import type { ClaudeEffort } from "../shared/claudeTypes"
import {
  buildClaudeCompletionArgs,
  buildClaudeEnv,
  sanitizeClaudeMessage,
} from "./claudeCliEnvironment"
import { ProviderConfigurationError } from "./providerConfigStore"

export type ClaudeCompletionOptions = {
  readonly systemPrompt: string
  readonly prompt: string
  readonly imageDataUrl?: string | undefined
  readonly model: string
  readonly effort?: ClaudeEffort | undefined
  readonly jsonSchema?: Readonly<Record<string, unknown>> | undefined
  readonly tools?: readonly string[] | undefined
  readonly maxTurns?: number | undefined
  readonly onDelta?: ((delta: string) => void) | undefined
  readonly signal?: AbortSignal | undefined
  readonly timeoutMs?: number | undefined
}

export class ClaudeCompletionError extends Error {
  readonly name = "ClaudeCompletionError"
  constructor(
    readonly code: "failed" | "output_limit" | "invalid_image" | "subprocess_exit",
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
  }
}

const MAX_OUTPUT_CHARS = 2 * 1024 * 1024
const MAX_IMAGE_CHARS = 12 * 1024 * 1024
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/

const deltaLineSchema = z.object({
  type: z.literal("stream_event"),
  parent_tool_use_id: z.string().nullable().optional(),
  event: z.object({
    type: z.literal("content_block_delta"),
    delta: z.discriminatedUnion("type", [
      z.object({ type: z.literal("text_delta"), text: z.string() }),
      z.object({ type: z.literal("input_json_delta"), partial_json: z.string() }),
    ]),
  }),
})
const assistantErrorLineSchema = z.object({ type: z.literal("assistant"), error: z.string() })
const resultLineSchema = z.object({
  type: z.literal("result"),
  is_error: z.boolean(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  api_error_status: z.number().nullable().optional(),
})

type ImageBlock = {
  readonly type: "image"
  readonly source: { readonly type: "base64"; readonly media_type: string; readonly data: string }
}

function imageBlock(dataUrl: string): ImageBlock {
  const match = dataUrl.length <= MAX_IMAGE_CHARS ? IMAGE_DATA_URL.exec(dataUrl) : null
  const mediaType = match?.[1]
  const data = match?.[2]
  if (!mediaType || !data) {
    throw new ClaudeCompletionError("invalid_image", "지원하지 않는 이미지 형식입니다")
  }
  return { type: "image", source: { type: "base64", media_type: mediaType, data } }
}

export function claudeUserMessageLine(prompt: string, imageDataUrl?: string): string {
  const content = [
    ...(imageDataUrl ? [imageBlock(imageDataUrl)] : []),
    { type: "text", text: prompt },
  ]
  return `${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`
}

/**
 * Plain turns stream text; schema-bound turns stream the StructuredOutput tool's JSON,
 * which lets callers show partial results exactly as with provider JSON streaming.
 */
function deltaText(
  delta: z.infer<typeof deltaLineSchema>["event"]["delta"],
  structured: boolean,
): string | null {
  if (delta.type === "text_delta") return structured ? null : delta.text
  return structured ? delta.partial_json : null
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

function resultFailure(status: number | null, message: string, apiError: string | null): Error {
  if (status === 401 || status === 403 || apiError === "authentication_failed") {
    return new ProviderConfigurationError("auth")
  }
  if (status === 429 || apiError === "rate_limit") {
    return new ProviderConfigurationError("rate_limited")
  }
  const detail = sanitizeClaudeMessage(message) || "Claude 요청이 실패했습니다"
  return new ClaudeCompletionError("failed", detail, status)
}

export async function runClaudeCompletion(
  executablePath: string,
  workdir: string,
  options: ClaudeCompletionOptions,
): Promise<string> {
  if (options.signal?.aborted) throw new ProviderConfigurationError("cancelled")
  const input = claudeUserMessageLine(options.prompt, options.imageDataUrl)
  const child = spawn(executablePath, buildClaudeCompletionArgs(options), {
    cwd: workdir,
    env: buildClaudeEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  })

  return new Promise<string>((resolve, reject) => {
    let settled = false
    let output = ""
    let stderr = ""
    let apiError: string | null = null
    let result: z.infer<typeof resultLineSchema> | null = null
    const structured = options.jsonSchema !== undefined
    const timeoutMs = options.timeoutMs ?? 180_000

    const finish = (outcome: { readonly value?: string; readonly error?: Error }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", onAbort)
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM")
      if (outcome.error) reject(outcome.error)
      else resolve(outcome.value ?? "")
    }
    const onAbort = (): void => finish({ error: new ProviderConfigurationError("cancelled") })
    const timer = setTimeout(
      () => finish({ error: new ProviderConfigurationError("timeout") }),
      timeoutMs,
    )
    options.signal?.addEventListener("abort", onAbort, { once: true })

    createInterface({ input: child.stdout }).on("line", (line) => {
      const value = parseLine(line)
      const delta = deltaLineSchema.safeParse(value)
      if (delta.success) {
        if (delta.data.parent_tool_use_id) return
        const piece = deltaText(delta.data.event.delta, structured)
        if (piece === null) return
        if (output.length + piece.length > MAX_OUTPUT_CHARS) {
          finish({ error: new ClaudeCompletionError("output_limit", "응답이 너무 깁니다") })
          return
        }
        output += piece
        options.onDelta?.(piece)
        return
      }
      const assistantError = assistantErrorLineSchema.safeParse(value)
      if (assistantError.success) apiError = assistantError.data.error
      const parsedResult = resultLineSchema.safeParse(value)
      if (parsedResult.success) result = parsedResult.data
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_096)
    })
    child.on("error", (error) => {
      finish({
        error: new ClaudeCompletionError("subprocess_exit", sanitizeClaudeMessage(error.message)),
      })
    })
    child.on("close", (code) => {
      if (result === null) {
        const detail = sanitizeClaudeMessage(stderr) || `Claude CLI가 종료되었습니다 (코드 ${code})`
        finish({ error: new ClaudeCompletionError("subprocess_exit", detail) })
      } else if (result.is_error) {
        finish({
          error: resultFailure(result.api_error_status ?? null, result.result ?? stderr, apiError),
        })
      } else if (structured && result.structured_output !== undefined) {
        finish({ value: JSON.stringify(result.structured_output) })
      } else {
        finish({ value: output || result.result || "" })
      }
    })
    child.stdin.on("error", () => undefined)
    child.stdin.end(input)
  })
}

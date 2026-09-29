import { z } from "zod"
import { codexThreadStartResultSchema, codexTurnStartResultSchema } from "../shared/codexProtocol"
import type { CodexAppServerClient } from "./codexAppServerClient"

export type CodexStartThreadOptions = {
  readonly cwd?: string | undefined
  readonly signal?: AbortSignal | undefined
}

export type CodexStartTurnOptions = {
  readonly threadId: string
  readonly prompt: string
  readonly imageDataUrl?: string | undefined
  readonly model?: string | undefined
  readonly reasoningEffort?: string | undefined
  readonly cwd?: string | undefined
  readonly signal?: AbortSignal | undefined
}

export class CodexSession {
  constructor(
    readonly client: CodexAppServerClient,
    readonly readableRoot?: string,
  ) {}

  async startThread(options?: CodexStartThreadOptions): Promise<string> {
    await this.client.ensureStarted()
    const res = await this.client.request(
      "thread/start",
      {
        approvalPolicy: "never",
        sandbox: "read-only",
        ...((options?.cwd ?? this.readableRoot) ? { cwd: options?.cwd ?? this.readableRoot } : {}),
      },
      codexThreadStartResultSchema,
      15_000,
      options?.signal,
    )
    return res.thread.id
  }

  async startTurn(options: CodexStartTurnOptions): Promise<string> {
    await this.client.ensureStarted()
    const res = await this.client.request(
      "turn/start",
      {
        threadId: options.threadId,
        approvalPolicy: "never",
        // Codex 0.155 dropped `readOnly.access`; reads are already confined because the
        // app-owned config disables the shell tool and the client declines every tool call.
        sandboxPolicy: { type: "readOnly", networkAccess: false },
        input: [
          { type: "text", text: options.prompt },
          ...(options.imageDataUrl ? [{ type: "image", url: options.imageDataUrl }] : []),
        ],
        ...((options.cwd ?? this.readableRoot) ? { cwd: options.cwd ?? this.readableRoot } : {}),
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.reasoningEffort !== undefined ? { effort: options.reasoningEffort } : {}),
      },
      codexTurnStartResultSchema,
      15_000,
      options.signal,
    )
    return res.turn.id
  }

  async interruptTurn(params: {
    readonly threadId: string
    readonly turnId: string
  }): Promise<void> {
    if (!this.client.isRunning) return
    await this.client.request("turn/interrupt", params, z.unknown())
  }
}

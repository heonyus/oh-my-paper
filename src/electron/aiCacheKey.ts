import { createHash } from "node:crypto"

export type AiCacheKeyInput = {
  readonly sourceHash: string
  readonly action: string
  readonly provider: string
  readonly model: string
  readonly promptVersion: string
  readonly policyVersion: string
  readonly content: string
}

export function createAiCacheKey(input: AiCacheKeyInput): string {
  const digest = createHash("sha256").update(input.content).digest("hex")
  return [
    input.sourceHash,
    input.action,
    input.provider,
    input.model,
    input.promptVersion,
    input.policyVersion,
    digest,
  ].join(":")
}

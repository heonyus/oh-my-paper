import {
  JEV_DECISION_MODEL,
  type JevDecisionRequest,
  type JevDecisionResult,
} from "../../shared/aiDecision"
import type { AutoHighlightPassage } from "./autoHighlight"
import type { AutoHighlightCandidate } from "./autoHighlightCandidates"

export const JEV_HIGHLIGHT_GOALS = [
  { label: "주요 기여", reason: "핵심 기여" },
  { label: "결정적 결과", reason: "결정적 결과" },
  { label: "제한점", reason: "제한점" },
] as const

type JevHighlightGoal = (typeof JEV_HIGHLIGHT_GOALS)[number]

export function jevHighlightRequest(
  goal: JevHighlightGoal,
  sourceText: string,
  candidates: readonly AutoHighlightCandidate[],
): JevDecisionRequest {
  return {
    task: "highlight",
    text: sourceText.slice(0, 20_000),
    candidates: candidates.slice(0, 32).map(({ id, quote }) => ({ id, text: quote })),
    instructions: `연구자가 반드시 확인할 ${goal.label} 한 개를 고르세요. 선택된 문장의 ID만 반환하고, 해당되는 후보가 없으면 none을 반환하세요.`,
  }
}

export function jevHighlightPassage(
  result: JevDecisionResult,
  goal: JevHighlightGoal,
  candidates: readonly AutoHighlightCandidate[],
  selectedIds: ReadonlySet<string>,
): AutoHighlightPassage | null {
  if (result.task !== "highlight" || result.choiceId === "none" || result.choiceId === "unknown")
    return null
  if (selectedIds.has(result.choiceId)) return null
  const candidate = candidates.find(({ id }) => id === result.choiceId)
  if (!candidate) return null
  return { candidateId: candidate.id, quote: candidate.quote, reason: goal.reason }
}

export async function selectJevHighlightPassages(
  sourceText: string,
  candidates: readonly AutoHighlightCandidate[],
  decideAi: (request: JevDecisionRequest, signal: AbortSignal) => Promise<JevDecisionResult>,
  signal: AbortSignal,
): Promise<{
  readonly passages: readonly AutoHighlightPassage[]
  readonly model: string
  readonly provider: string
}> {
  const selectedIds = new Set<string>()
  const passages: AutoHighlightPassage[] = []
  let model: string = JEV_DECISION_MODEL
  let provider = "Jev"
  for (const goal of JEV_HIGHLIGHT_GOALS) {
    if (signal.aborted) throw new Error("Jev decision cancelled")
    const available = candidates.filter(({ id }) => !selectedIds.has(id))
    if (available.length === 0) break
    const result = await decideAi(jevHighlightRequest(goal, sourceText, available), signal)
    if (signal.aborted) throw new Error("Jev decision cancelled")
    model = result.model
    provider = result.provider
    const passage = jevHighlightPassage(result, goal, available, selectedIds)
    if (!passage) continue
    if (passage.candidateId) selectedIds.add(passage.candidateId)
    passages.push(passage)
  }
  return { passages, model, provider }
}

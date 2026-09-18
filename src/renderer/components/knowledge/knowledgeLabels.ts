import type {
  KnowledgeNodeKind,
  RelationPredicate,
  RelationProvenanceSource,
  RelationReviewState,
} from "../../../shared/knowledgeSchemas"

const NODE_KIND_LABELS = {
  paper: "논문",
  concept: "개념",
  note: "노트",
  claim: "주장",
  evidence: "근거",
  question: "질문",
  hypothesis: "가설",
  experiment: "실험",
  project: "프로젝트",
} satisfies Readonly<Record<KnowledgeNodeKind, string>>

const PREDICATE_LABELS = {
  cites: "인용",
  discusses: "논의",
  interprets: "해석",
  supported_by: "근거",
  motivates: "동기",
  tests: "검증",
  refutes: "반박",
  relates_to: "관련",
} satisfies Readonly<Record<RelationPredicate, string>>

const REVIEW_STATE_LABELS = {
  proposed: "제안됨",
  accepted: "검토됨",
  rejected: "거절됨",
  needs_review: "검토 필요",
} satisfies Readonly<Record<RelationReviewState, string>>

const PROVENANCE_SOURCE_LABELS = {
  user: "사용자 작성",
  import: "가져온 자료",
  ai: "AI 제안",
} satisfies Readonly<Record<RelationProvenanceSource, string>>

export const knowledgeNodeKindLabel = (kind: KnowledgeNodeKind): string => NODE_KIND_LABELS[kind]
export const relationPredicateLabel = (predicate: RelationPredicate): string =>
  PREDICATE_LABELS[predicate]
export const relationReviewStateLabel = (state: RelationReviewState): string =>
  REVIEW_STATE_LABELS[state]
export const relationProvenanceSourceLabel = (source: RelationProvenanceSource): string =>
  PROVENANCE_SOURCE_LABELS[source]

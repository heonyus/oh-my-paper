import type { Catalog } from "./i18n/locale"

const ko = {
  "memory.state.pending": "검토 대기",
  "memory.state.accepted": "승인됨",
  "memory.state.rejected": "거부됨",
  "memory.state.invalidated": "출처 변경으로 무효화",
  "memory.origin.user": "사용자 확인",
  "memory.origin.navigation": "사실 탐색 기록",
  "memory.origin.localInference": "로컬 추론",
  "memory.origin.localInferenceModel": "로컬 추론 · {model}",
} as const

const en: Readonly<Record<keyof typeof ko, string>> = {
  "memory.state.pending": "Pending review",
  "memory.state.accepted": "Accepted",
  "memory.state.rejected": "Rejected",
  "memory.state.invalidated": "Invalidated by a source change",
  "memory.origin.user": "Confirmed by you",
  "memory.origin.navigation": "From your reading history",
  "memory.origin.localInference": "Local inference",
  "memory.origin.localInferenceModel": "Local inference · {model}",
}

export const memoryMessages: Catalog<typeof ko> = { ko, en }

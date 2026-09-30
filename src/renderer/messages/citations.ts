import type { Catalog } from "../../shared/i18n/locale"

const ko = {
  // Reading tiers and score parts
  "citation.tier.deep_read": "정독",
  "citation.tier.skim": "훑어보기",
  "citation.tier.abstract_only": "초록만",
  "citation.tier.pass": "패스",
  "citation.score.dependency": "현재 논문 의존도",
  "citation.score.methodological": "방법 관련성",
  "citation.score.conceptual": "개념 관련성",
  "citation.score.evidentiary": "근거 중요도",
  "citation.score.contextSufficiency": "문맥 충분성",

  // Citation panel
  "citation.panelLabel": "인용 논문 판독",
  "citation.heading": "인용",
  "citation.analyzeAll": "전체 판독",
  "citation.analyzingAll": "판독 중",
  "citation.policy": "정독 5% · 훑어보기 15% · 초록만 25% · 패스 다수",
  "citation.notFound": "검증 가능한 논문을 찾지 못했습니다.",
  "citation.failed": "메타데이터 또는 AI 판독에 실패했습니다.",
  "citation.empty": "이 PDF에서 구조화된 참고문헌을 찾지 못했습니다.",

  // Citation item
  "citation.expand": "펼쳐보기",
  "citation.collapse": "접기",
  "citation.contexts": "인용 문맥 {count}개",
  "citation.identityMatch": "신원 일치 {percent}%",
  "citation.readingScore": "읽기 점수 {score}/100",
  "citation.readingScoreLabel": "읽기 점수 {score}점",
  "citation.openSource": "실제 논문 열기",
  "citation.analyze": "논문 확인·판독",
  "citation.analyzing": "논문 신원과 읽을 가치를 확인 중…",
  "citation.sections": "읽을 부분: {sections}",
  "citation.save": "보드에 저장",
  "citation.askLabel": "{title} 질문",
  "citation.askSubmit": "인용 논문 질문 보내기",
  "citation.askFailed": "AI 설정 또는 인용 논문 정보를 확인해주세요.",

  // Citation card on the board
  "citation.citedBy": "인용 {count}회",
  "citation.breakdownLabel": "읽기 점수 구성",

  // Card body written after an inline citation is assessed
  "citation.body.verdict": "읽기 판단",
  "citation.body.level": "권장 수준",
  "citation.body.score": "읽기 점수",
  "citation.body.role": "현재 논문에서의 역할",
  "citation.body.value": "읽을 가치",
  "citation.body.reasons": "근거",
} as const

const en: Readonly<Record<keyof typeof ko, string>> = {
  "citation.tier.deep_read": "Read closely",
  "citation.tier.skim": "Skim",
  "citation.tier.abstract_only": "Abstract only",
  "citation.tier.pass": "Skip",
  "citation.score.dependency": "Reliance",
  "citation.score.methodological": "Method relevance",
  "citation.score.conceptual": "Concept relevance",
  "citation.score.evidentiary": "Evidence weight",
  "citation.score.contextSufficiency": "Context sufficiency",

  "citation.panelLabel": "Cited paper assessment",
  "citation.heading": "Citations",
  "citation.analyzeAll": "Assess all",
  "citation.analyzingAll": "Assessing",
  "citation.policy": "Read closely 5% · Skim 15% · Abstract only 25% · Skip the rest",
  "citation.notFound": "Couldn't find a paper to verify.",
  "citation.failed": "Couldn't get the metadata or the AI assessment.",
  "citation.empty": "No structured references were found in this PDF.",

  "citation.expand": "Show more",
  "citation.collapse": "Show less",
  "citation.contexts": "Citation contexts: {count}",
  "citation.identityMatch": "Identity match {percent}%",
  "citation.readingScore": "Reading score {score}/100",
  "citation.readingScoreLabel": "Reading score {score}",
  "citation.openSource": "Open the paper",
  "citation.analyze": "Verify and assess",
  "citation.analyzing": "Checking the paper's identity and reading value…",
  "citation.sections": "Sections to read: {sections}",
  "citation.save": "Save to the board",
  "citation.askLabel": "Question about {title}",
  "citation.askSubmit": "Send question about the cited paper",
  "citation.askFailed": "Check your AI settings or the cited paper's details.",

  "citation.citedBy": "Cited by {count}",
  "citation.breakdownLabel": "Reading score breakdown",

  "citation.body.verdict": "Reading verdict",
  "citation.body.level": "Recommended level",
  "citation.body.score": "Reading score",
  "citation.body.role": "Role in this paper",
  "citation.body.value": "Reading value",
  "citation.body.reasons": "Reasons",
}

export const citationMessages: Catalog<typeof ko> = { ko, en }

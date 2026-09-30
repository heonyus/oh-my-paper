import type { Catalog } from "../../shared/i18n/locale"

/** The ChatGPT and Claude subscription cards in settings, and the sign-in states behind them. */
const ko = {
  // Shared by both cards
  "sub.signingIn": "로그인 진행 중…",
  "sub.checking": "확인 중…",
  "sub.connected": "연결됨",
  "sub.unavailable": "사용 불가: {error}",
  "sub.signInNeeded": "로그인 필요",
  "sub.reopenSignIn": "로그인 페이지 다시 열기",
  "sub.refresh": "상태 새로고침",
  "sub.cancelSignIn": "로그인 취소",
  "sub.preparingSignIn": "로그인 준비 중…",
  "sub.signedIn": "로그인 완료",
  "sub.signInCancelled": "로그인 취소됨",
  "sub.requestFailed": "요청 실패",

  // ChatGPT
  "sub.chatgpt": "ChatGPT 구독",
  "sub.chatgpt.title": "ChatGPT 구독 연결",
  "sub.chatgpt.help": "구독에 포함된 Codex 사용량을 이용합니다.",
  "sub.chatgpt.enterCode": "브라우저에서 승인을 완료한 뒤 기기 코드 {code}를 입력하세요.",
  "sub.chatgpt.comeBack": "브라우저에서 승인을 완료한 뒤 돌아오세요.",
  "sub.chatgpt.model": "구독 모델",
  "sub.chatgpt.modelDetail": "질의응답, 요약, 리더 해설에 사용됩니다.",
  "sub.chatgpt.effort": "추론 수준 (Thinking)",
  "sub.chatgpt.effortLabel": "추론 수준",
  "sub.chatgpt.effortDetail": "복잡한 수식과 심층 검증에 사용할 CoT 사고 깊이",
  "sub.chatgpt.runtimeMissing":
    "앱 내부에 설치된 OpenAI 로그인 런타임을 사용할 수 없습니다. CLI를 따로 실행할 필요는 없으며, 앱을 업데이트한 뒤 다시 확인하세요.",
  "sub.chatgpt.signOut": "로그아웃",
  "sub.chatgpt.deviceCode": "기기 코드로 로그인",
  "sub.chatgpt.signIn": "ChatGPT로 로그인",
  "sub.chatgpt.signInFailed": "로그인 실패",
  "sub.chatgpt.unsupportedLogin": "이 앱에서 지원하지 않는 로그인 응답입니다",
  "sub.chatgpt.approveWithCode": "브라우저에서 승인을 완료하세요. 기기 코드: {code}",
  "sub.chatgpt.approve": "브라우저에서 승인을 완료하세요.",
  "sub.chatgpt.browserFailed": "브라우저를 자동으로 열지 못했습니다: {error}",
  "sub.chatgpt.signedOut": "이 앱의 ChatGPT 연결을 해제했습니다",
  "sub.chatgpt.loginUnreadable": "로그인 상태 응답을 읽지 못했습니다. 새로고침하세요.",

  // ChatGPT usage limits
  "sub.usage": "구독 사용량",
  "sub.usage.plan": "플랜: {plan}",
  "sub.usage.planUnknown": "확인되지 않음",
  "sub.usage.none": "사용량 정보를 제공받지 못했습니다.",
  "sub.usage.accountLimit": "계정 한도",
  "sub.usage.shortTerm": "단기",
  "sub.usage.longTerm": "장기",
  "sub.usage.left": "{window} · {percent}% 남음",
  "sub.usage.resets": "{time} 갱신",
  "sub.usage.shared":
    "같은 계정의 다른 앱과 한도를 공유합니다. 한도에 도달해도 API로 자동 전환하지 않습니다.",

  // Claude
  "sub.claude": "Claude 구독",
  "sub.claude.title": "Claude 구독 연결",
  "sub.claude.help":
    "이 컴퓨터의 Claude Code 로그인으로 구독 사용량을 이용합니다. API 키는 쓰지 않습니다.",
  "sub.claude.comeBack": "브라우저에서 Claude 로그인을 완료한 뒤 돌아오세요.",
  "sub.claude.model": "Claude 모델",
  "sub.claude.modelDetail": "번역, 해설, 질의응답, 요약에 사용됩니다.",
  "sub.claude.effort": "추론 수준 (Effort)",
  "sub.claude.effortLabel": "Claude 추론 수준",
  "sub.claude.effortDetail": "높을수록 느리지만 더 깊이 검토합니다. Haiku에는 적용되지 않습니다.",
  "sub.claude.cliMissing": "Claude Code CLI를 찾지 못했습니다. 설치한 뒤 상태를 새로고침하세요.",
  "sub.claude.signIn": "Claude로 로그인",
  "sub.claude.notCompleted": "로그인이 완료되지 않았습니다",
  "sub.claude.finishInBrowser": "열린 브라우저에서 Claude 로그인을 완료하세요.",
} as const

const en: Readonly<Record<keyof typeof ko, string>> = {
  "sub.signingIn": "Signing in…",
  "sub.checking": "Checking…",
  "sub.connected": "Connected",
  "sub.unavailable": "Unavailable: {error}",
  "sub.signInNeeded": "Sign-in needed",
  "sub.reopenSignIn": "Reopen the sign-in page",
  "sub.refresh": "Refresh status",
  "sub.cancelSignIn": "Cancel sign-in",
  "sub.preparingSignIn": "Preparing the sign-in…",
  "sub.signedIn": "Signed in",
  "sub.signInCancelled": "Sign-in cancelled",
  "sub.requestFailed": "Request failed",

  "sub.chatgpt": "ChatGPT subscription",
  "sub.chatgpt.title": "Connect a ChatGPT subscription",
  "sub.chatgpt.help": "Uses the Codex usage included in your subscription.",
  "sub.chatgpt.enterCode": "Finish approving in the browser and enter the device code {code}.",
  "sub.chatgpt.comeBack": "Finish approving in the browser, then come back.",
  "sub.chatgpt.model": "Subscription model",
  "sub.chatgpt.modelDetail": "Used for questions, summaries and reader explanations.",
  "sub.chatgpt.effort": "Reasoning effort (Thinking)",
  "sub.chatgpt.effortLabel": "Reasoning effort",
  "sub.chatgpt.effortDetail": "How deeply to think through complex equations and careful checks",
  "sub.chatgpt.runtimeMissing":
    "The OpenAI sign-in runtime bundled with the app is not available. You do not need to run a CLI yourself; update the app and check again.",
  "sub.chatgpt.signOut": "Sign out",
  "sub.chatgpt.deviceCode": "Sign in with a device code",
  "sub.chatgpt.signIn": "Sign in with ChatGPT",
  "sub.chatgpt.signInFailed": "Sign-in failed",
  "sub.chatgpt.unsupportedLogin": "This app does not support that sign-in response",
  "sub.chatgpt.approveWithCode": "Finish approving in the browser. Device code: {code}",
  "sub.chatgpt.approve": "Finish approving in the browser.",
  "sub.chatgpt.browserFailed": "Could not open the browser automatically: {error}",
  "sub.chatgpt.signedOut": "Disconnected ChatGPT from this app",
  "sub.chatgpt.loginUnreadable": "Could not read the sign-in status. Reload the page.",

  "sub.usage": "Subscription usage",
  "sub.usage.plan": "Plan: {plan}",
  "sub.usage.planUnknown": "Unknown",
  "sub.usage.none": "No usage information was provided.",
  "sub.usage.accountLimit": "Account limit",
  "sub.usage.shortTerm": "Short-term",
  "sub.usage.longTerm": "Long-term",
  "sub.usage.left": "{window} · {percent}% left",
  "sub.usage.resets": "resets {time}",
  "sub.usage.shared":
    "Limits are shared with other apps on the same account. Reaching a limit does not switch to the API automatically.",

  "sub.claude": "Claude subscription",
  "sub.claude.title": "Connect a Claude subscription",
  "sub.claude.help":
    "Uses your subscription through the Claude Code sign-in on this computer. No API key is used.",
  "sub.claude.comeBack": "Finish signing in to Claude in the browser, then come back.",
  "sub.claude.model": "Claude model",
  "sub.claude.modelDetail": "Used for translations, explanations, questions and summaries.",
  "sub.claude.effort": "Reasoning effort (Effort)",
  "sub.claude.effortLabel": "Claude reasoning effort",
  "sub.claude.effortDetail": "Higher is slower but more thorough. Does not apply to Haiku.",
  "sub.claude.cliMissing":
    "The Claude Code CLI was not found. Install it, then refresh the status.",
  "sub.claude.signIn": "Sign in with Claude",
  "sub.claude.notCompleted": "Sign-in was not completed",
  "sub.claude.finishInBrowser": "Finish signing in to Claude in the browser window that opened.",
}

export const subscriptionMessages: Catalog<typeof ko> = { ko, en }

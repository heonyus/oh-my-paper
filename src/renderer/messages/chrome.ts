import type { Catalog } from "../../shared/i18n/locale"

const ko = {
  // Reader toolbar
  "topbar.documentPicker": "읽는 논문",
  "topbar.noDocument": "열린 논문 없음",
  "topbar.tools": "논문 읽기 도구",
  "topbar.openNote": "내 노트 열기",
  "topbar.closeNote": "내 노트 닫기",
  "topbar.note": "노트",
  "topbar.select": "선택 도구",
  "topbar.pan": "이동 도구",
  "topbar.undo": "실행 취소",
  "topbar.redo": "다시 실행",
  "topbar.zoomOut": "축소",
  "topbar.zoomIn": "확대",
  "topbar.autoTranslateOn": "자동 번역 켜기",
  "topbar.autoTranslateOff": "자동 번역 끄기",
  "topbar.autoTranslate": "자동 번역",
  "topbar.signOut": "로그아웃",

  // Outline
  "outline.label": "논문 목차",
  "outline.title": "목차",
  "outline.open": "목차 열기",
  "outline.close": "목차 닫기",
  "outline.resize": "목차 너비 조절",
  "outline.empty": "목차 정보가 없습니다",

  // Status overlays
  "status.saveFailed": "작업 공간을 저장하지 못했습니다.",
  "status.startFailed": "앱 시작에 실패했습니다.",
} as const

const en: Readonly<Record<keyof typeof ko, string>> = {
  "topbar.documentPicker": "Paper",
  "topbar.noDocument": "No paper open",
  "topbar.tools": "Reading tools",
  "topbar.openNote": "Open my note",
  "topbar.closeNote": "Close my note",
  "topbar.note": "Note",
  "topbar.select": "Select tool",
  "topbar.pan": "Pan tool",
  "topbar.undo": "Undo",
  "topbar.redo": "Redo",
  "topbar.zoomOut": "Zoom out",
  "topbar.zoomIn": "Zoom in",
  "topbar.autoTranslateOn": "Turn on auto-translate",
  "topbar.autoTranslateOff": "Turn off auto-translate",
  "topbar.autoTranslate": "Auto-translate",
  "topbar.signOut": "Sign out",

  "outline.label": "Table of contents",
  "outline.title": "Contents",
  "outline.open": "Open contents",
  "outline.close": "Close contents",
  "outline.resize": "Resize contents",
  "outline.empty": "No table of contents",

  "status.saveFailed": "Could not save the workspace.",
  "status.startFailed": "The app could not start.",
}

export const chromeMessages: Catalog<typeof ko> = { ko, en }

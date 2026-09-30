import type { Catalog } from "../../shared/i18n/locale"

/** The optional on-device writing suggestions panel. */
const ko = {
  "local.statusFailed": "로컬 제안 상태를 확인하지 못했습니다.",
  "local.verifyFailed": "선택한 로컬 파일을 검증하지 못했습니다.",
  "local.toggleFailed": "로컬 제안 설정을 변경하지 못했습니다.",
  "local.eyebrow": "선택 사항 · 기기 안에서만",
  "local.title": "로컬 글쓰기 제안",
  "local.intro":
    "로컬 모델을 켜지 않아도 결정적 제안은 계속 표시됩니다. 문서와 제안은 클라우드로 보내지지 않습니다.",
  "local.runtime": "후보 런타임: {name} {version}",
  "local.model": "후보 모델: {name}",
  "local.license": "라이선스: {license} 확인 필요",
  "local.verifying": "검증 중…",
  "local.chooseSetup": "로컬 파일 선택·검증",
  "local.changing": "변경 중…",
  "local.turnOff": "로컬 제안 끄기",
  "local.turnOn": "로컬 제안 켜기",
  "local.downloadNote":
    "자동 다운로드·시작을 하지 않습니다. 공식 파일을 직접 준비하고 SHA-256과 라이선스를 확인한 설정 매니페스트만 사용합니다.",
  "local.suggestions": "제안",
  "local.waiting": "로컬 모델 응답 대기 중…",

  "local.status.noApi": "이 빌드에서는 로컬 추론 API가 연결되지 않았습니다.",
  "local.status.checking": "로컬 제안 상태 확인 중…",
  "local.status.unsupported": "현재 기기에서는 지원되지 않습니다.",
  "local.status.off": "로컬 제안은 꺼져 있습니다.",
  "local.status.needsSetup": "로컬 제안은 켜졌지만 설정이 필요합니다.",
  "local.status.ready": "로컬 제안이 준비되었습니다.",
  "local.device": "기기: {platform}/{arch} · {support}",
  "local.device.supported": "지원됨",
  "local.device.unsupported": "미지원",

  "local.setup.ready": "런타임·모델 해시와 라이선스가 검증되었습니다.",
  "local.setup.disabled": "사용자가 로컬 제안을 껐습니다.",
  "local.setup.unsupportedDevice": "Apple Silicon macOS에서만 이 후보 경로를 사용할 수 있습니다.",
  "local.setup.setupRequired": "llama.cpp 서버 실행 파일과 Qwen GGUF 파일을 직접 선택하세요.",
  "local.setup.licenseRequired": "Apache-2.0 라이선스를 확인한 뒤 설정을 다시 선택하세요.",
  "local.setup.runtimeMissing": "선택한 llama.cpp 서버 실행 파일을 찾을 수 없습니다.",
  "local.setup.runtimeArchiveMissing": "선택한 llama.cpp 압축 파일을 찾을 수 없습니다.",
  "local.setup.runtimeArchiveHashMismatch": "llama.cpp 압축 파일 SHA-256이 공식 핀과 다릅니다.",
  "local.setup.runtimeExecutableHashMismatch":
    "선택한 llama.cpp 실행 파일이 공식 압축 파일의 실행 파일과 다릅니다.",
  "local.setup.modelRevisionMismatch": "Qwen GGUF revision이 공식 핀과 다릅니다.",
  "local.setup.modelMissing": "선택한 Qwen GGUF 모델을 찾을 수 없습니다.",
  "local.setup.modelHashMismatch": "Qwen GGUF 모델 SHA-256이 공식 핀과 다릅니다.",
  "local.setup.executionFailed": "로컬 런타임을 실행할 수 없습니다.",
  "local.setup.cancelled": "로컬 제안 요청이 취소되었습니다.",
} as const

const en: Readonly<Record<keyof typeof ko, string>> = {
  "local.statusFailed": "Could not check the local suggestion status.",
  "local.verifyFailed": "Could not verify the selected local files.",
  "local.toggleFailed": "Could not change the local suggestion setting.",
  "local.eyebrow": "Optional · on this device only",
  "local.title": "Local writing suggestions",
  "local.intro":
    "Fixed suggestions keep showing without the local model. Documents and suggestions are never sent to the cloud.",
  "local.runtime": "Candidate runtime: {name} {version}",
  "local.model": "Candidate model: {name}",
  "local.license": "License: {license}, review required",
  "local.verifying": "Verifying…",
  "local.chooseSetup": "Choose and verify local files",
  "local.changing": "Changing…",
  "local.turnOff": "Turn off local suggestions",
  "local.turnOn": "Turn on local suggestions",
  "local.downloadNote":
    "Nothing is downloaded or started automatically. Prepare the official files yourself; only a setup manifest with a checked SHA-256 and license is used.",
  "local.suggestions": "Suggestions",
  "local.waiting": "Waiting for the local model…",

  "local.status.noApi": "The local inference API is not connected in this build.",
  "local.status.checking": "Checking the local suggestion status…",
  "local.status.unsupported": "Not supported on this device.",
  "local.status.off": "Local suggestions are off.",
  "local.status.needsSetup": "Local suggestions are on but need setup.",
  "local.status.ready": "Local suggestions are ready.",
  "local.device": "Device: {platform}/{arch} · {support}",
  "local.device.supported": "supported",
  "local.device.unsupported": "not supported",

  "local.setup.ready": "The runtime and model hashes and the license are verified.",
  "local.setup.disabled": "Local suggestions were turned off.",
  "local.setup.unsupportedDevice": "This candidate setup works only on macOS with Apple silicon.",
  "local.setup.setupRequired":
    "Choose the llama.cpp server executable and the Qwen GGUF file yourself.",
  "local.setup.licenseRequired": "Review the Apache-2.0 license, then choose the setup again.",
  "local.setup.runtimeMissing": "The selected llama.cpp server executable was not found.",
  "local.setup.runtimeArchiveMissing": "The selected llama.cpp archive was not found.",
  "local.setup.runtimeArchiveHashMismatch":
    "The llama.cpp archive SHA-256 does not match the official pin.",
  "local.setup.runtimeExecutableHashMismatch":
    "The selected llama.cpp executable differs from the one in the official archive.",
  "local.setup.modelRevisionMismatch": "The Qwen GGUF revision does not match the official pin.",
  "local.setup.modelMissing": "The selected Qwen GGUF model was not found.",
  "local.setup.modelHashMismatch": "The Qwen GGUF model SHA-256 does not match the official pin.",
  "local.setup.executionFailed": "The local runtime could not run.",
  "local.setup.cancelled": "The local suggestion request was cancelled.",
}

export const localAiMessages: Catalog<typeof ko> = { ko, en }

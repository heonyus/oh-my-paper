# 로컬 글쓰기 제안

Scourgify의 로컬 제안은 선택 사항인 llama.cpp 경로입니다. 문서 열기, 앱 시작, 설정 확인만으로
모델을 내려받거나 프로세스를 시작하지 않습니다. ChatGPT 구독, Codex 자격 증명, 유료 API 키와도
연결하지 않으며 클라우드 대체 경로를 사용하지 않습니다.

## 후보와 검증 핀

현재 Apple Silicon macOS 후보는 다음과 같습니다.

- llama.cpp arm64 archive: `b9637`, `llama-b9637-bin-macos-arm64.tar.gz`
- archive SHA-256: `72a93f3e68c31de3e438d462669aad1fcdb423b995e9c41033cc7d27a9a3ac69`
- Qwen GGUF: `ggml-org/Qwen3.5-0.8B-GGUF`의 `Qwen3.5-0.8B-Q4_0.gguf`
- model revision: `9447f74`
- model SHA-256: `57d1997790d1744fba5b40a7317df71ea5e2acee28c47e78f0cce39c0703f8cf`
- model license: `Apache-2.0`

출처는 [공식 llama.cpp release 목록](https://github.com/ggml-org/llama.cpp/releases)과
[공식 ggml-org Qwen GGUF 파일](https://huggingface.co/ggml-org/Qwen3.5-0.8B-GGUF/blob/main/Qwen3.5-0.8B-Q4_0.gguf)입니다.
이 핀은 앱이 파일을 내려받는 권한을 의미하지 않습니다. 사용자가 준비한 로컬 파일과 setup
manifest를 선택하면 main process가 archive/model의 공식 해시, archive 내부의 안전한
`llama-server` regular-file 경로와 실행 파일의 실제 해시, revision과 라이선스 동의를 확인합니다.
manifest가 제공하는 실행 파일 해시는 archive에서 다시 계산한 값과 비교할 뿐 authority로 신뢰하지
않습니다. 하나라도 다르면 실행하지 않습니다.

## 실행 계약

- 후보 기기: `darwin/arm64`
- llama.cpp server 한 프로세스만 사용하며 요청은 한 번에 하나씩 처리합니다. server는 loopback의
  OS-assigned port와 요청별 random bearer token을 사용합니다.
- context: 2,048 tokens
- maximum output: 64 tokens
- idle unload: 60 seconds
- editor debounce: 650 ms
- 초안 또는 IME 조합 중인 입력은 요청을 보내지 않습니다.
- 입력이 바뀌면 revision이 증가하고 이전 결과는 버립니다. 취소 시 HTTP 요청과 프로세스를
  중단할 수 있습니다.

실제 실행 파일 선택기와 Electron boot/root API 연결은 상위 작업에서 연결합니다. 현재 이
모듈은 chooser callback과 typed preload API만 제공하며, 자동 다운로드나 userdata 모델 저장을
구현하지 않습니다.

## 상태와 fallback

UI는 기기 미지원, setup 필요, 라이선스 확인 필요, 파일 누락, 해시 불일치, 실행 실패, 취소를
구분해 표시해야 합니다. 로컬 API가 연결되지 않았거나 로컬 모델을 끈 경우에도 deterministic
`[[localnode]]` 제안은 계속 표시됩니다. 이 fallback은 모델 결과가 아니며, 유료 API나 다른
클라우드 provider로 조용히 전환하지 않습니다.

이 bounded implementation에서는 개인 문서로 실제 inference/login을 실행하지 않았습니다. 공식
파일 다운로드와 packaged Electron/Chromium end-to-end 검증은 main wiring 이후 별도 QA가
필요합니다.

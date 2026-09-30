<div align="center">

<img src="assets/branding/ohmypaper-leaf-mark.png" width="88" alt="oh-my-paper">

# oh-my-paper

### PDF는 그대로, 번역·설명·노트는 원문 자리에.

논문을 내 컴퓨터에서 읽는 로컬 우선 리딩 워크스페이스.<br>
문장을 고르고 키 하나 — 번역·설명·노트가 원문 옆에 붙고, 문서는 이 컴퓨터 밖으로 나가지 않습니다.

**한국어** · [English](README.en.md)

<a href="#-한-줄-설치"><img alt="macOS Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-111?logo=apple&logoColor=white"></a>
<a href="#-데이터는-어디에-있나요"><img alt="Local-first" src="https://img.shields.io/badge/local--first-PDFs%20stay%20on%20your%20Mac-285644"></a>
<a href="#-ai-연결"><img alt="AI: ChatGPT, Claude, API" src="https://img.shields.io/badge/AI-ChatGPT%20·%20Claude%20·%20API-7fd1a0"></a>
<a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/heonyus/oh-my-paper?color=efc245"></a>
<a href="https://github.com/heonyus/oh-my-paper/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/heonyus/oh-my-paper?style=social"></a>

<br><br>

<img src="docs/media/oh-my-paper-demo.gif" width="880" alt="논문에서 문장을 고르고 T를 누르면 한국어 번역 카드가 옆에 붙고, E를 누르면 설명이 붙는 장면">

<sub>▶ <a href="docs/media/oh-my-paper-demo.mp4">전체 데모 영상 (75초)</a> — 설치부터 가져오기·번역·설명·노트·AI 개요까지, 실제 앱을 그대로 녹화했습니다.</sub>

</div>

---

## ⚡ 한 줄 설치

```bash
curl -fsSL https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.sh | bash
```

Apple Silicon Mac, git, Node.js 22 이상(`brew install node`)만 있으면 됩니다. 설치가 끝나면 설정 마법사가 바로 이어집니다.

| 단계 | 하는 일 |
|:--|:--|
| **1** 실행 환경 확인 | Node.js, 로그인 런타임, Claude Code, uv가 있는지 봅니다 |
| **2** 문서 분석 엔진 | PaddleOCR-VL을 **백그라운드로** 받기 시작합니다 (약 3GB) |
| **3** AI 연결 | ChatGPT 구독 · Claude 구독 · API 키 중 하나를 고릅니다 |
| **4** 사용법 | 단축키와 첫걸음을 보여 주고 앱을 엽니다 |

엔진은 AI를 연결하고 사용법을 보는 동안 받아집니다. HuggingFace와 ModelScope에서 16MB 조각으로 **동시에** 받고 SHA-256으로 확인합니다. 그동안에도 논문은 바로 열어 읽을 수 있고, 먼저 가져온 논문은 엔진이 준비되면 알아서 분석됩니다.

## ✨ 이렇게 읽습니다

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/translate.gif" alt="문장을 드래그하고 T를 눌러 번역 카드를 붙이는 장면"><br>
<b>문장을 고르고, 키 하나</b><br>
드래그하면 메뉴가 뜹니다. <kbd>T</kbd> 번역 · <kbd>E</kbd> 설명 · <kbd>C</kbd> 노트에 담기 · <kbd>H</kbd> 하이라이트. 결과는 원문 옆 카드로 붙습니다.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/page-translation.gif" alt="원문 페이지 옆에 한국어로 번역된 페이지가 나란히 뜨는 장면"><br>
<b>페이지를 통째로 번역</b><br>
원문 옆에 한국어 페이지를 나란히 띄웁니다. 원본 배치 · 원문 · 대조 · 함께 읽기 네 가지로 보고, 문단을 누르면 원문 자리로 돌아갑니다.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/explain.gif" alt="수식이 있는 문장을 고르고 E를 눌러 설명을 받는 장면"><br>
<b>그림·수식 설명</b><br>
어려운 문장이나 수식을 고르고 <kbd>E</kbd>. 앞뒤 맥락까지 읽고 풀어서 설명합니다.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/note.gif" alt="노트에 문장을 쓰면 근거 문단이 옆에 나타나는 장면"><br>
<b>내 말로 남기는 노트</b><br>
쓰는 문장마다 근거가 된 문단을 찾아 옆에 보여 줍니다. <kbd>C</kbd>로 담으면 인용이 함께 들어갑니다.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/overview.gif" alt="AI 개요 패널에 키워드와 3줄 요약이 뜨는 장면"><br>
<b>AI 개요</b><br>
키워드, 3줄 요약, 전체 요약을 한 번에 봅니다. 질문하면 근거 페이지와 함께 답합니다.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/import.gif" alt="라이브러리에 PDF를 가져오는 장면"><br>
<b>끌어다 놓으면 끝</b><br>
PDF를 라이브러리에 놓으면 바로 열립니다. 제목·저자 같은 논문 정보와 페이지 구조(그림·표·수식)는 뒤에서 정리됩니다.
</td>
</tr>
</table>

앱 안에서도 헤더의 **?** (사용법)를 누르면 이 영상들을 하나씩 크게 볼 수 있습니다.

## 🌿 왜 oh-my-paper인가요

- **원문을 망가뜨리지 않습니다.** 텍스트만 뽑아 보여 주지 않고, PDF를 연속 페이지 그대로 둔 채 그 위에 번역·설명·노트를 얹습니다.
- **근거가 따라다닙니다.** 카드와 노트는 자기를 만든 문단에 붙어 있고, 누르면 그 자리로 돌아갑니다.
- **문서는 내 컴퓨터에.** PDF, 노트, 하이라이트, 캐시, 페이지 분석까지 모두 로컬입니다. AI 요청은 내가 누를 때만, 내가 연결한 곳으로만 갑니다.
- **이미 있는 구독으로.** ChatGPT나 Claude 구독이 있으면 API 키 없이 바로 씁니다.

## 🤖 AI 연결

| 방식 | 필요한 것 | 기본 모델 |
|:--|:--|:--|
| **ChatGPT 구독** | ChatGPT 계정 로그인 (브라우저 또는 다른 기기에서 코드 입력) · API 키 불필요 | GPT-6 Luna (계정에 열려 있으면) |
| **Claude 구독** | 이 컴퓨터의 Claude Code 로그인 · API 키 불필요 · 본인 컴퓨터에서 개인용으로만 | Claude Haiku 4.5 |
| **API 키** | OpenRouter · OpenAI · Gemini · Groq 중 하나의 키 | 공급자별 기본 모델 |

모델 목록은 계정에서 바로 받아 오므로, 새 모델이 나오면 앱을 업데이트하지 않아도 보입니다. 설정 › AI에서 언제든 바꿀 수 있습니다.

## 🔬 문서 분석 엔진

스캔 PDF와 그림·표·수식은 **PaddleOCR-VL-1.6**이 이 컴퓨터에서 읽습니다. Apple Silicon에서는 MLX로 가속합니다.

- 마법사에서 기본으로 설치되며, 백그라운드에서 받는 동안 진행률이 설정 화면과 `oh-my-paper doctor`에 나옵니다 (예: `설치 중 42% · 약 1분 남음`).
- 끝나면 앱을 다시 켜지 않아도 자동으로 켜집니다.
- 나중에 설치하려면 `npm run setup:paddle-vl`을 실행하세요 (Python 3.12와 [`uv`](https://docs.astral.sh/uv/) 필요).

## 🧭 명령어

| 명령 | 하는 일 |
|:--|:--|
| `oh-my-paper` | 앱을 시작하고 브라우저를 엽니다 (연결된 AI가 없으면 마법사부터) |
| `oh-my-paper onboard` | 설정 마법사: 문서 분석 엔진, AI 연결, 사용법 |
| `oh-my-paper doctor` | 런타임, 로그인, 모델, 엔진 설치 진행률, 데이터 폴더 점검 |
| `oh-my-paper update` | 최신 버전을 받아 다시 설치·빌드합니다 (진행 과정이 흐리게 흘러갑니다) |
| `oh-my-paper start --no-open` | 브라우저를 열지 않고 시작합니다 |

앱 주소는 `http://127.0.0.1:8788`, 데이터는 `~/.ohmypaper`에 있습니다.

## 🔒 데이터는 어디에 있나요

| 무엇 | 어디 |
|:--|:--|
| PDF, 라이브러리, 노트, 하이라이트, 카드 | 내 컴퓨터 |
| 페이지 분석 (PDF.js · PaddleOCR-VL) | 내 컴퓨터 |
| 번역·설명·요약 요청 | 누른 뒤에만, 내가 연결한 AI로 |
| 계정 로그인 (데스크톱 앱의 계정 모드만) | Google과 별도 계정 서버 |

PDF를 가져오거나 여는 것만으로는 아무 데도 보내지 않습니다. 저장한 API 키는 암호화되어 PDF 화면에 노출되지 않고, 저장소에 커밋되거나 oh-my-paper 서버로 가지 않습니다. 구독·API·계정 인프라에는 각자의 요금과 한도가 있습니다.

## 🛠 개발자용

<details>
<summary><b>소스에서 실행</b></summary>

Node.js 22 이상과 npm이 필요합니다 (macOS 또는 Windows).

```bash
git clone https://github.com/heonyus/oh-my-paper.git
cd oh-my-paper
npm ci
npm run build:web
npm run cli          # oh-my-paper 명령과 같습니다
```

`npm run start:web`도 앱을 시작하고(연결된 AI가 없으면 마법사부터), `npm run setup`은 마법사를 다시 띄웁니다. 대화형이 아닌 셸에서는 마법사를 건너뛰고 바로 서버를 켭니다. 브라우저 앱은 저장된 선택이 없고 `claude` CLI가 있으면 Claude 구독 모드로 시작합니다.

선택적인 로컬 런타임:

```bash
npm run setup:paddle-vl   # PaddleOCR-VL (+ Apple Silicon에서는 MLX-VLM)
npm run setup:layout
npm run setup:mineru
```

</details>

<details>
<summary><b>GPU 가속 (Windows · NVIDIA)</b></summary>

PaddleOCR-VL은 로컬 GPU 서버를 쓰면 훨씬 빠릅니다 (RTX 3060 Ti에서 페이지당 약 2초, 프로세스 안에서는 수십 초).

- **Apple Silicon:** `npm run setup:paddle-vl`이 MLX-VLM 서버까지 설치합니다.
- **Windows + NVIDIA:** `npm run setup:paddle-vl`이 WSL(`uv`가 있는 Ubuntu) 안에 vLLM 서버를 설치합니다. `npm run setup:paddle-vllm`은 그 부분만 다시 설치합니다. WSL 안에서 약 13GB, 분석 중 GPU 메모리 약 4.6GB를 씁니다.

앱은 분석할 문서가 있을 때 서버를 켜고, 10분 동안 쉬면 끕니다. WSL 부팅 후 첫 시작은 2분쯤 걸립니다.

</details>

<details>
<summary><b>데스크톱 앱 (Electron)과 계정 설정</b></summary>

```bash
npm run build
npm run dev
```

개발 런처는 `dist-electron`에서 main/preload를 불러오므로 main/preload를 바꾼 뒤에는 다시 빌드하세요. 런처는 Vite와 Electron만 켜고, 백엔드나 Google 설정은 하지 않습니다. Electron main은 `.env`를 `dotenv/config`로 읽고, 이미 있는 환경 변수가 우선합니다.

소유자 전용 Mac 설치는 사용자 데이터 폴더의 `local-access.json`(`{ "version": 1, "mode": "local", "accountId": "<로컬에서 만든 UUID>" }`)으로 Google 세션 없이 `이 Mac · 로컬` 컬렉션을 엽니다. 이 파일은 번들되지 않고 렌더러 IPC로도 전달되지 않습니다.

계정 모드 프로필은 `.env`에 비밀이 아닌 값 세 개를 채웁니다 (`.env.example` 참고):

- `OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN`: 계정 API의 HTTPS 오리진
- `OH_MY_PAPER_ACCOUNT_ISSUER`: 백엔드 `APP_ISSUER`와 같은 세션 발급자
- `OH_MY_PAPER_GOOGLE_CLIENT_ID`: 백엔드 `GOOGLE_CLIENT_IDS`가 받아들이는 Google 데스크톱 OAuth 클라이언트 ID

값이 없거나 잘못되면 데스크톱 앱은 잠긴 상태(`service_not_configured`)로 남습니다. 온라인 인증을 마친 세션은 최대 7일까지 오프라인으로 쓸 수 있습니다. 게스트 모드는 없습니다. 자세한 전제는 [계정 서비스 문서](docs/account-service.md#deployment-prerequisites-and-unverified-gates)에 있습니다. `.env`는 커밋하지 마세요.

</details>

<details>
<summary><b>검증과 기여</b></summary>

```bash
npm ci
npm run verify
npm run build
npm run make
```

렌더러에는 파일 시스템·데이터베이스·비밀·네트워크 권한이 없고, Electron IPC와 외부 데이터 경계는 Zod로 검사합니다. PR 전에 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요. 보안 문제는 [SECURITY.md](SECURITY.md)의 방법으로 비공개 제보해 주세요. 제품 설계 규칙은 [DESIGN.md](DESIGN.md)에 있습니다.

</details>

## 📍 프로젝트 상태

2.0은 통합 QA 중이고, 아직 상용·공개 배포 단계가 아닙니다. 지금 패키징 대상은 Apple Silicon macOS(arm64)이고, 지원하는 가장 오래된 macOS 버전은 아직 확인하지 않았습니다. 예전 [GitHub Releases](https://github.com/heonyus/oh-my-paper/releases)는 지난 기록일 뿐 현재 2.0이 배포 준비됐다는 뜻이 아닙니다. 자세한 내용은 [출시 준비 상태](docs/release-readiness.md)와 [Mac 패키징](docs/mac-release.md)을 보세요.

재현 가능한 합성 PDF 픽스처, Apple Silicon 패키징 확인, 로컬 파서 개선, 접근성, 원문 좌표에 맞는 번역 배치 같은 기여를 환영합니다.

---

<div align="center">

oh-my-paper가 연구에 도움이 됐다면 ⭐ 하나로 다른 연구자들도 찾을 수 있게 해 주세요.

[MIT](LICENSE) · 데모 논문: Wei et al., “Chain-of-Thought Prompting Elicits Reasoning in Large Language Models”, [arXiv:2201.11903](https://arxiv.org/abs/2201.11903), CC BY 4.0

</div>

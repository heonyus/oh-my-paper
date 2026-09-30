<div align="center">

<img src="assets/branding/ohmypaper-leaf-mark.png" width="72" alt="">

# oh-my-paper

내 컴퓨터에서 읽는 논문 리더.

구절을 고르고 키 하나를 누르면 번역·설명·노트가 원문 옆에 붙습니다.<br>
PDF는 그대로, 이 컴퓨터 안에 있습니다.

[English](README.md) · **한국어**

<img alt="상태: 베타" src="https://img.shields.io/badge/status-beta-efc245"> <img alt="macOS Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-111?logo=apple&logoColor=white"> <a href="LICENSE"><img alt="MIT 라이선스" src="https://img.shields.io/badge/license-MIT-285644"></a>

<br>

<img src="docs/media/oh-my-paper-demo.gif" width="860" alt="논문 문장을 선택해 T로 번역 카드를 붙이고 E로 설명을 여는 장면">

<sub><a href="docs/media/oh-my-paper-demo.mp4">전체 데모 (75초)</a>, 실제 앱에서 녹화</sub>

</div>

> [!NOTE]
> **oh-my-paper는 베타 버전입니다.** 계속 개발 중이라 거친 부분이 있을 수 있고, 업데이트마다 바뀔 수 있습니다. 지금은 화면과 AI 답변이 한국어로만 나옵니다.

## 설치

```bash
curl -fsSL https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.sh | bash
```

Apple Silicon Mac, git, Node.js 22 이상(`brew install node`)이 필요합니다. 설치가 끝나면 설정 마법사가 이어집니다.

1. **실행 환경 확인.** Node.js와, AI 연결에 쓰는 ChatGPT 로그인 런타임(Codex)과 Claude Code를 확인합니다.
2. **문서 분석 엔진.** PaddleOCR-VL(약 3GB)을 백그라운드로 받기 시작합니다.
3. **AI 연결.** ChatGPT 구독, Claude 구독, API 키 중 하나를 고릅니다.
4. **둘러보기.** 단축키와 첫 단계를 보여 주고 앱을 엽니다.

엔진을 받는 동안에도 논문은 바로 열어 읽을 수 있고, 엔진이 준비되면 알아서 분석됩니다.

## 읽기

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/translate.gif" alt="문장을 드래그하고 T를 눌러 번역 카드를 붙이는 장면"><br>
<b>고르고, 키 하나</b><br>
<kbd>T</kbd> 번역 · <kbd>E</kbd> 설명 · <kbd>C</kbd> 노트에 · <kbd>H</kbd> 하이라이트. 결과는 카드로 원문 옆에 붙습니다.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/page-translation.gif" alt="원문 페이지 옆에 번역 페이지가 나타나는 장면"><br>
<b>페이지 번역</b><br>
원문 옆에 번역 페이지가 열립니다. 원본 배치, 원문, 대조, 교차 네 가지로 볼 수 있고, 문단을 누르면 PDF의 그 자리로 돌아갑니다.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/explain.gif" alt="수식이 있는 문장을 선택하고 E로 설명을 여는 장면"><br>
<b>맥락을 읽는 설명</b><br>
어려운 문장이나 그림, 수식을 고르고 <kbd>E</kbd>를 누르면 앞뒤 맥락을 읽고 풀어 줍니다.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/note.gif" alt="노트를 쓰는 동안 근거 문단이 옆에 나타나는 장면"><br>
<b>내 말로 쓰는 노트</b><br>
쓰는 문장마다 뒷받침하는 문단을 찾아 줍니다. <kbd>C</kbd>는 구절을 출처와 함께 가져옵니다.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/overview.gif" alt="키워드와 3줄 요약이 있는 AI 개요 패널"><br>
<b>개요</b><br>
키워드, 3줄 요약, 전체 요약이 논문을 열 때 준비돼 있습니다. 질문에 대한 답은 근거 페이지와 함께 나옵니다.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/import.gif" alt="라이브러리로 PDF를 가져오는 장면"><br>
<b>라이브러리</b><br>
PDF를 끌어다 놓으면 바로 열립니다. 제목, 저자, 페이지 구조(그림·표·수식)는 뒤에서 채워집니다.
</td>
</tr>
</table>

앱의 **?** 버튼을 누르면 이 영상들을 볼 수 있습니다.

## 원칙

- PDF를 텍스트로 뭉개지 않습니다. 번역·설명·노트는 원래 페이지 위에 얹힙니다.
- 모든 카드와 노트는 나온 구절과 연결돼 있습니다.
- 문서는 이 컴퓨터에 남습니다. AI 요청은 직접 요청할 때만, 연결한 서비스로만 나갑니다.
- ChatGPT나 Claude 구독이 있으면 API 키 없이 쓸 수 있습니다.

## AI 연결

| 방식 | 필요한 것 | 기본 모델 |
|:--|:--|:--|
| ChatGPT 구독 | ChatGPT 로그인 (브라우저 또는 기기 코드) | GPT-6 Luna (계정에서 쓸 수 있을 때) |
| Claude 구독 | 이 컴퓨터의 Claude Code 로그인, 본인 컴퓨터에서 개인용으로만 | Claude Haiku 4.5 |
| API 키 | OpenRouter, OpenAI, Gemini, Groq 중 하나의 키 | 서비스 기본값 |

모델 목록은 계정에서 받아 오기 때문에 새 모델은 앱 업데이트 없이 보입니다. 앱의 AI 설정에서 언제든 바꿀 수 있습니다.

## 문서 분석 엔진

스캔 PDF와 그림·표·수식은 PaddleOCR-VL 1.6이 이 컴퓨터에서 읽습니다. Apple Silicon에서는 MLX로 가속합니다.

- 마법사가 설치하고, 진행 상황은 앱 설정과 `oh-my-paper doctor`에 나옵니다.
- 준비되면 다시 시작하지 않아도 알아서 켜집니다.
- 엔진이 없으면 `oh-my-paper update` 뒤나 앱을 켤 때 설치를 시작합니다. 마법사에서 설치하지 않겠다고 고른 경우는 제외합니다.
- 직접 설치하려면 `npm run setup:paddle-vl`을 실행하세요. 필요하면 [uv](https://docs.astral.sh/uv/)와 Python 3.12도 함께 설치합니다.

## 명령어

| 명령 | 하는 일 |
|:--|:--|
| `oh-my-paper` | 앱을 켜고 브라우저를 엽니다 (AI 연결이 없으면 마법사부터) |
| `oh-my-paper onboard` | 설정 마법사를 다시 실행합니다 |
| `oh-my-paper doctor` | 실행 환경, 로그인, 모델, 엔진, 데이터 폴더를 점검합니다 |
| `oh-my-paper update` | 최신 버전으로 업데이트하고 다시 빌드합니다 |
| `oh-my-paper start --no-open` | 브라우저를 열지 않고 켭니다 |

앱은 `http://127.0.0.1:8788`에서 돌고, 데이터는 `~/.ohmypaper`에 있습니다.

## 개인정보

| 무엇 | 어디에 |
|:--|:--|
| PDF, 라이브러리, 노트, 하이라이트, 카드 | 이 컴퓨터 |
| 페이지 분석 (PDF.js, PaddleOCR-VL) | 이 컴퓨터 |
| 번역·설명·요약 요청 | 연결한 AI 서비스, 직접 요청할 때만 |

PDF를 열어도 어디로도 보내지 않습니다. API 키는 암호화해 저장하고, 해당 서비스로만 보냅니다. 구독과 API에는 각자의 비용과 한도가 있습니다.

## 개발

<details>
<summary>소스에서 실행</summary>

Node.js 22 이상과 npm이 필요합니다. macOS와 Windows에서 동작합니다.

```bash
git clone https://github.com/heonyus/oh-my-paper.git
cd oh-my-paper
npm ci
npm run build:web
npm run cli          # oh-my-paper 명령과 같습니다
```

`npm run start:web`으로도 앱을 켤 수 있고, `npm run setup`은 마법사를 다시 실행합니다. 선택 사항인 로컬 런타임:

```bash
npm run setup:paddle-vl   # PaddleOCR-VL (Apple Silicon에서는 MLX-VLM 서버 포함)
npm run setup:layout
npm run setup:mineru
```

</details>

<details>
<summary>Windows + NVIDIA GPU 가속</summary>

`npm run setup:paddle-vl`이 WSL(uv가 있는 Ubuntu) 안에 vLLM 서버도 설치하고, `npm run setup:paddle-vllm`은 그 부분만 다시 설치합니다. WSL 안에서 약 13GB, 분석 중 GPU 메모리 약 4.6GB를 쓰고, RTX 3060 Ti 기준 한 페이지를 약 2초에 읽습니다. 앱이 필요할 때 서버를 켜고, 10분 동안 쓰지 않으면 끕니다.

</details>

<details>
<summary>데스크톱 앱 (Electron)</summary>

```bash
npm run build
npm run dev
```

main이나 preload 코드를 바꾸면 다시 빌드하세요. 데스크톱 앱의 계정 설정은 [docs/account-service.md](docs/account-service.md)에 있습니다.

</details>

<details>
<summary>점검과 기여</summary>

```bash
npm run verify
npm run build
```

PR을 열기 전에 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요. 보안 문제는 [SECURITY.md](SECURITY.md)에 적힌 대로 비공개로 알려 주세요.

</details>

## 상태

oh-my-paper는 베타이며 Apple Silicon Mac을 지원합니다. 패키징, 코드 서명, 지원하는 가장 오래된 macOS 버전은 아직 정해지지 않았습니다. [릴리스 준비 상태](docs/release-readiness.md)와 [Mac 패키징](docs/mac-release.md)을 참고하세요.

기여를 환영합니다. 특히 재현 가능한 합성 PDF 예제, 로컬 파서 개선, 접근성 수정, 패키징 점검이 도움이 됩니다.

---

<sub>[MIT](LICENSE) · 데모 논문: Wei et al., "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", [arXiv:2201.11903](https://arxiv.org/abs/2201.11903), CC BY 4.0</sub>

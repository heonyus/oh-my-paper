<div align="center">

<img src="assets/branding/ohmypaper-leaf-mark.png" width="88" alt="oh-my-paper">

# oh-my-paper

### The PDF stays as it is. Translations, explanations and notes sit right where they came from.

A local-first workspace for reading research papers on your own computer.<br>
Select a sentence, press one key — the translation, explanation or note lands beside the source, and the document never leaves your machine.

[한국어](README.md) · **English**

<a href="#-one-line-install"><img alt="macOS Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-111?logo=apple&logoColor=white"></a>
<a href="#-where-your-data-lives"><img alt="Local-first" src="https://img.shields.io/badge/local--first-PDFs%20stay%20on%20your%20Mac-285644"></a>
<a href="#-ai-connection"><img alt="AI: ChatGPT, Claude, API" src="https://img.shields.io/badge/AI-ChatGPT%20·%20Claude%20·%20API-7fd1a0"></a>
<a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/heonyus/oh-my-paper?color=efc245"></a>
<a href="https://github.com/heonyus/oh-my-paper/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/heonyus/oh-my-paper?style=social"></a>

<br><br>

<img src="docs/media/oh-my-paper-demo.gif" width="880" alt="Selecting a sentence in a paper, pressing T to get a Korean translation card beside it, then E for an explanation">

<sub>▶ <a href="docs/media/oh-my-paper-demo.mp4">Full demo (75 s)</a> — install, import, translate, explain, notes and the AI overview, recorded from the real app.</sub>

</div>

> The app's interface and AI output are Korean for now.

---

## ⚡ One-line install

```bash
curl -fsSL https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.sh | bash
```

You need an Apple Silicon Mac, git and Node.js 22+ (`brew install node`). The setup wizard follows right after the install.

| Step | What it does |
|:--|:--|
| **1** Runtime check | Looks for Node.js, the sign-in runtime and Claude Code |
| **2** Document engine | Starts downloading PaddleOCR-VL **in the background** (about 3 GB) |
| **3** AI connection | Pick a ChatGPT subscription, a Claude subscription or an API key |
| **4** Usage tour | Shows the keys and first steps, then opens the app |

The engine downloads while you connect AI and read the tour. It is fetched from Hugging Face and ModelScope **at once** in 16 MB ranges and checked against SHA-256. Papers open and read right away meanwhile, and any paper imported early is analysed on its own once the engine is ready.

## ✨ How you read

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/translate.gif" alt="Dragging over a sentence and pressing T to attach a translation card"><br>
<b>Select, then one key</b><br>
A menu appears over your selection: <kbd>T</kbd> translate · <kbd>E</kbd> explain · <kbd>C</kbd> add to notes · <kbd>H</kbd> highlight. The result sticks beside the source as a card.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/page-translation.gif" alt="A Korean translation of the page appearing beside the source page"><br>
<b>Translate the whole page</b><br>
A Korean page opens beside the original, in four views: original layout, source, parallel and interleaved. Click a paragraph to jump back to it in the PDF.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/explain.gif" alt="Selecting a sentence with an equation and pressing E for an explanation"><br>
<b>Figures and equations explained</b><br>
Select a hard sentence or an equation and press <kbd>E</kbd>. It reads the surrounding context and walks you through it.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/note.gif" alt="Writing a note while the supporting paragraph appears beside it"><br>
<b>Notes in your own words</b><br>
Every sentence you write finds the paragraph that supports it. <kbd>C</kbd> brings a passage in with its citation.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/media/features/overview.gif" alt="The AI overview panel with keywords and a three-line summary"><br>
<b>AI overview</b><br>
Keywords, a three-line summary and a full summary at a glance. Ask a question and the answer comes with the pages behind it.
</td>
<td width="50%" valign="top">
<img src="docs/media/features/import.gif" alt="Importing a PDF into the library"><br>
<b>Drop it in</b><br>
Drop a PDF into the library and it opens right away. Title, authors and the page structure (figures, tables, equations) are worked out in the background.
</td>
</tr>
</table>

Inside the app, the header's **?** (사용법) plays these clips one at a time, large.

## 🌿 Why oh-my-paper

- **The paper stays intact.** No flattened text dump: the PDF keeps its continuous pages, and translations, explanations and notes are laid over it.
- **Evidence travels with you.** Cards and notes stay attached to the passage that produced them, one click away from it.
- **Your documents stay home.** PDFs, notes, highlights, caches and page analysis are all local. AI requests go out only when you ask, and only to the provider you connected.
- **Use the subscription you already have.** With ChatGPT or Claude, no API key is needed.

## 🤖 AI connection

| Mode | What you need | Default model |
|:--|:--|:--|
| **ChatGPT subscription** | Your ChatGPT sign-in (in the browser, or a device code on another device) · no API key | GPT-6 Luna (when your account offers it) |
| **Claude subscription** | The local Claude Code login · no API key · personal use on your own machine only | Claude Haiku 4.5 |
| **API key** | A key for OpenRouter, OpenAI, Gemini or Groq | The provider's default |

Models are listed from your account, so new ones show up without an app update. Change it any time under 설정 › AI.

## 🔬 Document engine

Scanned PDFs, figures, tables and equations are read on your computer by **PaddleOCR-VL-1.6**, accelerated with MLX on Apple Silicon.

- The wizard installs it by default. While it downloads in the background, 설정 and `oh-my-paper doctor` show its progress (e.g. `설치 중 42% · 약 1분 남음`).
- It switches on by itself once ready, with no restart.
- If the engine is missing, `oh-my-paper update` and starting the app begin installing it, unless you said no in the wizard.
- To install it yourself, run `npm run setup:paddle-vl` (it installs [`uv`](https://docs.astral.sh/uv/) and Python 3.12 too if they are missing).

## 🧭 Commands

| Command | What it does |
|:--|:--|
| `oh-my-paper` | Start the app and open the browser (the wizard first if no AI is connected) |
| `oh-my-paper onboard` | Setup wizard: document engine, AI connection, usage tour |
| `oh-my-paper doctor` | Check the runtime, logins, models, engine install progress and data folder |
| `oh-my-paper update` | Pull the latest version and reinstall and rebuild, showing each step as it runs |
| `oh-my-paper start --no-open` | Start without opening a browser |

The app lives at `http://127.0.0.1:8788`; its data lives in `~/.ohmypaper`.

## 🔒 Where your data lives

| What | Where |
|:--|:--|
| PDFs, library, notes, highlights, cards | Your computer |
| Page analysis (PDF.js · PaddleOCR-VL) | Your computer |
| Translation, explanation and summary requests | Only after you ask, to the AI you connected |
| Account sign-in (desktop app, account mode only) | Google and a separate account service |

Importing or opening a PDF sends it nowhere. Saved API keys are encrypted, never exposed to the PDF view, never committed and never sent to an oh-my-paper server. Subscriptions, APIs and account infrastructure have their own costs and limits.

## 🛠 For developers

<details>
<summary><b>Run from source</b></summary>

Requires Node.js 22+ and npm, on macOS or Windows.

```bash
git clone https://github.com/heonyus/oh-my-paper.git
cd oh-my-paper
npm ci
npm run build:web
npm run cli          # same as the oh-my-paper command
```

`npm run start:web` also starts the app (the wizard first when no AI is connected) and `npm run setup` reruns the wizard. Non-interactive shells skip the wizard and start the server directly. Without a saved choice, the browser app starts in Claude subscription mode whenever the `claude` CLI is installed.

Optional local runtimes:

```bash
npm run setup:paddle-vl   # PaddleOCR-VL (+ an MLX-VLM server on Apple Silicon)
npm run setup:layout
npm run setup:mineru
```

</details>

<details>
<summary><b>GPU acceleration (Windows · NVIDIA)</b></summary>

PaddleOCR-VL recognizes pages far faster through a local GPU server (about 2 seconds per page on an RTX 3060 Ti, against tens of seconds in-process).

- **Apple Silicon:** `npm run setup:paddle-vl` also installs an MLX-VLM server.
- **Windows with an NVIDIA GPU:** `npm run setup:paddle-vl` also installs a vLLM server inside WSL (an Ubuntu distribution with `uv`). `npm run setup:paddle-vllm` reinstalls just that part. It takes about 13 GB inside WSL and about 4.6 GB of GPU memory while documents are analysed.

The app starts the server when a document needs analysis and stops it after ten idle minutes; the first start after WSL boots takes about two minutes.

</details>

<details>
<summary><b>Desktop app (Electron) and account setup</b></summary>

```bash
npm run build
npm run dev
```

The development launcher loads the Electron main/preload entry from `dist-electron`, so rebuild after main/preload changes. It starts Vite and Electron; it does not provision the backend or configure Google. Electron's main process loads `.env` via `dotenv/config`; inherited environment values take precedence.

For the explicitly authorized owner-only Mac installation, main can read `local-access.json` in the installation's user-data directory (`{ "version": 1, "mode": "local", "accountId": "<locally generated UUID>" }`) and open the existing collection as `이 Mac · 로컬` without a Google session. The file is not bundled or passed through renderer IPC.

Account-managed profiles fill three non-secret bindings in `.env` (see `.env.example`):

- `OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN`: the account API's HTTPS origin.
- `OH_MY_PAPER_ACCOUNT_ISSUER`: the session issuer, matching the backend's `APP_ISSUER`.
- `OH_MY_PAPER_GOOGLE_CLIENT_ID`: a Google Desktop OAuth client ID accepted by the backend's `GOOGLE_CLIENT_IDS`.

Missing or invalid bindings leave the desktop app locked (`service_not_configured`). After verified online authentication, a session allows up to seven days of bounded offline use; there is no guest mode. See the [account-service prerequisites](docs/account-service.md#deployment-prerequisites-and-unverified-gates). Keep `.env` uncommitted.

</details>

<details>
<summary><b>Verify and contribute</b></summary>

```bash
npm ci
npm run verify
npm run build
npm run make
```

The renderer has no direct filesystem, database, secret or network authority; Electron IPC and external data boundaries are parsed with Zod. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and report security issues privately as described in [SECURITY.md](SECURITY.md). Product rules live in [DESIGN.md](DESIGN.md).

</details>

## 📍 Project status

Version 2.0 is in integration QA, not ready for commercial or public distribution. Packaging targets Apple Silicon macOS (arm64); the oldest supported macOS version has not been validated. Earlier [GitHub Releases](https://github.com/heonyus/oh-my-paper/releases) are historical artifacts, not evidence that 2.0 is ready to ship. See [release readiness](docs/release-readiness.md) and [Mac packaging](docs/mac-release.md).

Welcome contributions include reproducible synthetic PDF fixtures, Apple Silicon packaging checks, local parser improvements, accessibility and source-faithful translation geometry.

---

<div align="center">

If oh-my-paper helps your research, a ⭐ helps other researchers find it.

[MIT](LICENSE) · Demo paper: Wei et al., “Chain-of-Thought Prompting Elicits Reasoning in Large Language Models”, [arXiv:2201.11903](https://arxiv.org/abs/2201.11903), CC BY 4.0

</div>

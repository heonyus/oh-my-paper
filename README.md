<p align="center">
  <img src="assets/branding/ohmypaper-leaf-mark.png" width="96" alt="oh-my-paper leaf mark">
</p>

<h1 align="center">oh-my-paper</h1>

<p align="center">
  A local-first spatial workspace for reading research PDFs without flattening the paper.
</p>

<p align="center">
  <a href="https://github.com/heonyus/oh-my-paper/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/heonyus/oh-my-paper/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/heonyus/oh-my-paper/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/heonyus/oh-my-paper"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/heonyus/oh-my-paper"></a>
  <a href="https://github.com/heonyus/oh-my-paper/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/heonyus/oh-my-paper?style=social"></a>
</p>

<p align="center">
  <img src="docs/media/oh-my-paper-demo.gif" width="880" alt="Selecting a sentence in a paper, pressing T to get a Korean translation card beside it, then E for an explanation">
</p>
<p align="center">
  <a href="docs/media/oh-my-paper-demo.mp4">▶ Full demo (75 s, mp4)</a> — install, import, translate, explain, notes and the AI overview, recorded from the real app.<br>
  <sub>Demo paper: Wei et al., “Chain-of-Thought Prompting Elicits Reasoning in Large Language Models”, <a href="https://arxiv.org/abs/2201.11903">arXiv:2201.11903</a>, CC BY 4.0.</sub>
</p>

oh-my-paper keeps the PDF in place and lets translations, explanations, notes, figures, and
citations stay connected to the exact page that produced them. Documents stay on your computer,
but the official app requires Google sign-in through a separate account-only backend.
The supported target is Apple Silicon macOS (arm64).

Version 2.0 is in integration QA, not ready for commercial or public distribution. A blank-reader
regression is being fixed. Live authentication, search, signing/notarization, and minimum-macOS
compatibility remain unverified; see [release readiness](docs/release-readiness.md).

## What it does

- Reads papers as a continuous PDF column on a spatial research board.
- Keeps translation and explanation cards attached to their source passages.
- Detects headings, figures, tables, equations, and citations with PDF-aware geometry.
- Stores the library, notes, highlights, caches, and provider configuration locally.
- Provides keyword, three-line, full-paper, citation, and follow-up discussion tools.
- Supports light/dark appearance, scalable UI text, selectable fonts, search, and a minimap.
- Shows a short looping clip beside each feature the first time you reach it (import, translate,
  explain, notes, AI overview); the header **?** (사용법) replays them all.

## Install

Existing [GitHub Releases](https://github.com/heonyus/oh-my-paper/releases/latest) are historical
artifacts, not evidence that the current 2.0 checkout is ready to install or distribute.
Current packaging targets macOS arm64 only. The oldest supported macOS version has not been
validated. See [Mac packaging](docs/mac-release.md) for local commands and distribution prerequisites.

### One-line install (local browser app)

Requirements: an Apple Silicon Mac, git, and Node.js 22+ (`brew install node`).

```bash
curl -fsSL https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.sh | bash
```

The installer clones the app into `~/.oh-my-paper/app`, installs dependencies, builds the web
app, links an `oh-my-paper` command into `~/.local/bin` (adding it to `PATH` for zsh/bash),
and starts the setup wizard. The wizard walks through four explained steps — runtime check,
AI connection, the optional OCR engine, and a short usage tour — then offers to open the app.

| Command | What it does |
|---|---|
| `oh-my-paper` | Start the app and open the browser (runs the wizard first if nothing is connected) |
| `oh-my-paper onboard` | Setup wizard: AI connection, OCR engine, usage tour |
| `oh-my-paper doctor` | Check the runtime, logins, models and data folder |
| `oh-my-paper update` | Pull the latest version, reinstall and rebuild |
| `oh-my-paper start --no-open` | Start without opening a browser |

AI connection choices, all selectable with arrow keys and Enter:

- **ChatGPT 구독 (OpenAI)** — sign in with your ChatGPT account in the browser, or with a
  device code on another device; no API key. The model list comes from the bundled Codex
  runtime for your account, so new models (currently GPT-6 Astra by default) appear
  without an app update.
- **Claude 구독 (Anthropic)** — reuses the local Claude Code login (default Claude Haiku 4.5).
- **API 키** — OpenRouter, OpenAI, Gemini or Groq.

### Run from source

```bash
git clone https://github.com/heonyus/oh-my-paper.git
cd oh-my-paper
npm ci
npm run build:web
npm run cli          # same as the oh-my-paper command
```

`npm run start:web` still starts the app (running the wizard first when nothing is connected)
and `npm run setup` reruns the wizard. Non-interactive shells skip the wizard and start the
server directly.

Open `http://127.0.0.1:8788`. If AI is not connected yet, the browser shows a short
guided connect screen (Claude 구독, ChatGPT 로그인 or API 키) instead of the library.
Without a saved choice, the browser app starts in Claude 구독 mode whenever the `claude`
CLI is installed.

Reader translation, explanation, summary, chat and research answers use the connected
subscription or API model. The official `@openai/codex` runtime is an application
dependency; the local server starts it when needed — you do not install or start
`@bitkyc08/opencodex` for this path. A separate app-owned profile retains the ChatGPT
connection across restarts; **로그아웃** disconnects that profile only.

For stronger page structure analysis — scanned PDFs, figures, tables, equations —
install the optional local parser. It requires Python 3.12 and `uv`, and model
downloads can be large:

```bash
npm run setup:paddle-vl
```

Optional local runtimes:

```bash
npm run setup:layout
npm run setup:mineru
npm run setup:paddle-vl
```

Provider subscriptions, optional APIs/OCR, and account infrastructure have separate
costs and limits; there is no zero-charge guarantee.

### Desktop app (Electron)

The desktop shell additionally builds the Electron main/preload entries:

```bash
npm run build
npm run dev
```

The build above is required because the development launcher loads the Electron
main/preload entry from `dist-electron`; rerun it after main/preload changes. The
launcher starts Vite and Electron; it does not provision the backend or configure
Google. Electron's main process loads `.env` via `dotenv/config`; inherited
environment values take precedence.

For the explicitly authorized owner-only Mac installation, main can instead read
`local-access.json` in that installation's user-data directory: `{ "version": 1,
"mode": "local", "accountId": "<locally generated UUID>" }`. It opens the existing
collection as `이 Mac · 로컬` without a Google session or server privileges. This file
is not bundled or supplied through renderer IPC; profiles without it still require
the account bindings below. AI connections remain separate and explicit.

For account-managed profiles, fill the three non-secret bindings in `.env` (see
`.env.example`) using an authorized account service:

- `OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN`: account API HTTPS origin.
- `OH_MY_PAPER_ACCOUNT_ISSUER`: expected session issuer, matching the backend's `APP_ISSUER`.
- `OH_MY_PAPER_GOOGLE_CLIENT_ID`: Google Desktop OAuth client ID accepted by the backend's `GOOGLE_CLIENT_IDS`.

Both origins must have no path, trailing slash, query, fragment, or credentials. Google setup needs
a Desktop OAuth client and appropriate consent-screen configuration. The account backend needs
its own database and signing key; those secrets never belong in the desktop `.env`.
See [account-service prerequisites](docs/account-service.md#deployment-prerequisites-and-unverified-gates).
Missing or invalid account bindings leave the desktop app locked (`service_not_configured`).
After verified online authentication, the session policy permits up to seven days of bounded offline
local use, subject to lease expiry and known revocation. This is not a guest mode.

Keep `.env` uncommitted. Packaged apps need separately supplied trusted main-process bindings;
the development `.env` is not bundled. Synthetic test issuers belong only to dedicated test launchers,
never a production login bypass. The local account-service HTTP fixture is not a valid production
desktop HTTPS binding.

## Local processing

PDF rendering, library storage, notes, highlights, search, and built-in structure
detection work locally. Page structure analysis runs on-device through PDF.js and
PaddleOCR-VL; importing or opening a PDF never sends it anywhere by itself.

### GPU acceleration for PaddleOCR-VL

PaddleOCR-VL recognizes pages far faster through a local GPU server (about 2 seconds per page on
an RTX 3060 Ti, against tens of seconds in-process):

- **Apple silicon:** `npm run setup:paddle-vl` also installs an MLX-VLM server.
- **Windows with an NVIDIA GPU:** `npm run setup:paddle-vl` also installs a vLLM server inside WSL
  (an Ubuntu distribution with `uv`). `npm run setup:paddle-vllm` reinstalls just that part. It
  takes about 13 GB inside WSL and about 4.6 GB of GPU memory while documents are analyzed.

The app starts the server when a document needs analysis and stops it after ten idle minutes; the
first start after WSL boots takes about two minutes. Documents open right away, and page structure
appears as analysis reaches each page.

## Optional AI providers

### Desktop and existing API connections

Google app identity does not grant AI access. Configure a separate connection under **Settings → AI**:

- ChatGPT subscription mode uses the official local Codex App Server runtime, separate login, and
  an app-owned profile with OS-keyring credentials. It does not copy another app's login or silently
  fall back to a paid API. A working runtime and eligible user subscription are prerequisites;
  live login, inference, cancellation, and usage reporting still need verification.
- Claude subscription mode (browser app only, personal use) runs the locally installed Claude
  Code CLI headlessly with its existing login; the default model is `claude-haiku-4-5`. Anthropic
  does not allow third-party products to offer claude.ai login without approval, so this mode
  is for the owner's own Mac and must not be shipped to other users.
- API mode uses your own provider keys. Gemini, Groq, OpenAI and OpenRouter are separate
  choices. PDF structure analysis stays local through PDF.js and
  PaddleOCR-VL and does not need a hosted OCR key.

See [subscription authentication](docs/subscription-auth.md) for the implementation boundary.

Provider keys saved in the app are encrypted with Electron `safeStorage`. They are never exposed to
the PDF renderer, committed to Git, or sent to a oh-my-paper server.

The environment example contains only non-secret account bindings. Configure personal provider
credentials in the app; never commit keys, tokens, or account-service signing material.

## Privacy boundary

| Action | Default location |
|---|---|
| PDF files and workspace | Your computer |
| Notes, highlights, and generated cards | Your computer |
| PDF.js structure detection | Your computer |
| PaddleOCR-VL / MinerU parsing | Your computer |
| Google identity and app session validation | Google and the separate account backend |
| AI request after an explicit click | The provider you configured |

Importing or opening a PDF does not automatically run AI/OCR. Network AI work begins only after an
explicit action and only when a provider has been configured.
The account backend handles identity and sessions, not PDFs, note bodies, provider credentials, or
AI requests. There is no automatic document synchronization; notes remain real local Markdown files.

## Development

```bash
npm ci
npm run verify
npm run build
npm run make
```

The renderer has no direct filesystem, database, secret, or network authority. Electron IPC and
external data boundaries are parsed with Zod.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report security issues
privately as described in [SECURITY.md](SECURITY.md).

## Project status

The 2.0 integration is still under QA. Useful contributions include reproducible synthetic PDF
fixtures, Apple Silicon packaging checks, local parser improvements, accessibility, and source-faithful
translation geometry. Windows, Linux, and Intel Mac releases are outside the current target.
The [active product plan](.omo/plans/README.md) describes intended work; the coordinator's
[execution record](.omo/evidence/ohmypaper-local-product/2026-09-06/execution.md) tracks QA evidence.
Neither feature descriptions nor passing simulated tests establish release readiness.

If oh-my-paper helps your research, [star the repository](https://github.com/heonyus/oh-my-paper) so
other researchers can find it.

## License

[MIT](LICENSE)

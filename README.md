<p align="center">
  <img src="assets/branding/scourgify-leaf-mark.png" width="96" alt="Scourgify leaf mark">
</p>

<h1 align="center">Scourgify</h1>

<p align="center">
  A local-first spatial workspace for reading research PDFs without flattening the paper.
</p>

<p align="center">
  <a href="https://github.com/heonyus/scourgify/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/heonyus/scourgify/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/heonyus/scourgify/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/heonyus/scourgify"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/heonyus/scourgify"></a>
  <a href="https://github.com/heonyus/scourgify/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/heonyus/scourgify?style=social"></a>
</p>

Scourgify keeps the PDF in place and lets translations, explanations, notes, figures, and
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

## Install

Existing [GitHub Releases](https://github.com/heonyus/scourgify/releases/latest) are historical
artifacts, not evidence that the current 2.0 checkout is ready to install or distribute.
Current packaging targets macOS arm64 only. The oldest supported macOS version has not been
validated. See [Mac packaging](docs/mac-release.md) for local commands and distribution prerequisites.

### Run from source

Requirements: an Apple Silicon Mac, Node.js 22+, npm, and configured account infrastructure for
normal authenticated use.

```bash
git clone https://github.com/heonyus/scourgify.git
cd scourgify
npm ci
npm run build
cp .env.example .env
```

For the explicitly authorized owner-only Mac installation, main can instead read
`local-access.json` in that installation's user-data directory: `{ "version": 1,
"mode": "local", "accountId": "<locally generated UUID>" }`. It opens the existing
collection as `이 Mac · 로컬` without a Google session or server privileges. This file
is not bundled or supplied through renderer IPC; profiles without it still require
the account bindings below. AI connections remain separate and explicit.

For account-managed use, fill these three non-secret bindings in `.env` using an authorized account service:

- `SCOURGIFY_ACCOUNT_SERVICE_ORIGIN`: account API HTTPS origin.
- `SCOURGIFY_ACCOUNT_ISSUER`: expected session issuer, matching the backend's `APP_ISSUER`.
- `SCOURGIFY_GOOGLE_CLIENT_ID`: Google Desktop OAuth client ID accepted by the backend's `GOOGLE_CLIENT_IDS`.

Both origins must have no path, trailing slash, query, fragment, or credentials. Google setup needs
a Desktop OAuth client and appropriate consent-screen configuration. The account backend needs
its own database and signing key; those secrets never belong in the desktop `.env`.
See [account-service prerequisites](docs/account-service.md#deployment-prerequisites-and-unverified-gates).

Then run `npm run dev`. The build above is required because the development launcher loads the
Electron main/preload entry from `dist-electron`; rerun it after main/preload changes. The launcher
starts Vite and Electron; it does not provision the backend or configure Google. Electron's main
process loads `.env` via `dotenv/config`; inherited environment values take precedence. Missing or
invalid account bindings leave the app locked (`service_not_configured`).
After verified online authentication, the session policy permits up to seven days of bounded offline
local use, subject to lease expiry and known revocation. This is not a guest mode.

Keep `.env` uncommitted. Packaged apps need separately supplied trusted main-process bindings;
the development `.env` is not bundled. Synthetic test issuers belong only to dedicated test launchers,
never a production login bypass. The local account-service HTTP fixture is not a valid production
desktop HTTPS binding.

## Local processing and optional runtimes

PDF rendering, library storage, notes, highlights, search, and built-in structure detection work
locally. For stronger page structure analysis, install the optional local parser:

```bash
npm run setup:paddle-vl
```

This explicitly downloads PaddleOCR-VL into a local runtime. Local document processing does not
remove the Google account requirement. There is no zero-charge guarantee: provider subscriptions,
optional APIs/OCR, and account infrastructure have separate costs and limits.

Optional local runtimes:

```bash
npm run setup:layout
npm run setup:mineru
```

They require Python 3.12 and `uv`; model downloads can be large.

## Optional AI providers

Google app identity does not grant AI access. Configure a separate connection under **Settings → AI**:

- ChatGPT subscription mode uses the official local Codex App Server runtime, separate login, and
  an app-owned profile with OS-keyring credentials. It does not copy another app's login or silently
  fall back to a paid API. A working runtime and eligible user subscription are prerequisites;
  live login, inference, cancellation, and usage reporting still need verification.
- API mode uses your own provider keys. Gemini, Groq, OpenAI, and OpenRouter connections, optional
  Mistral OCR, and an existing local OpenCodex proxy are separate choices. ChatGPT subscription
  access does not include Mistral OCR or these API charges.

See [subscription authentication](docs/subscription-auth.md) for the implementation boundary.

Provider keys saved in the app are encrypted with Electron `safeStorage`. They are never exposed to
the PDF renderer, committed to Git, or sent to a Scourgify server.

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
[execution record](.omo/evidence/scourgify-local-product/2026-09-06/execution.md) tracks QA evidence.
Neither feature descriptions nor passing simulated tests establish release readiness.

If Scourgify helps your research, [star the repository](https://github.com/heonyus/scourgify) so
other researchers can find it.

## License

[MIT](LICENSE)

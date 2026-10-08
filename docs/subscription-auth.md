# Individual subscription authentication

Verified 2026-09-05. Implementation observations are not provider endorsement or permission for public multi-user hosting.

## What Aside does

The official [provider guide](https://docs.aside.com/help/ai) distinguishes Aside plan models, Subscription and API. It documents OAuth popup login for ChatGPT Plus/Pro, Claude Pro/Max and GitHub Copilot, followed by usage indicators where supported. Its private token transport implementation is not published in that guide. The installed Aside CLI accepts an `openai-codex` provider. Neither fact establishes that Aside uses Codex App Server internally.

## What installed OCX does

Read-only inspection of the installed `@bitkyc08/opencodex` source found:

- `src/oauth/chatgpt.ts`: authorization-code PKCE, loopback callback, token exchange and refresh.
- `src/oauth/chatgpt-device.ts`: user device code, provider-hosted approval page, bounded polling and token exchange.
- `src/adapters/openai-responses.ts` and `src/server/auth-cors.ts`: subscription Responses requests forwarded to the ChatGPT Codex backend using account-scoped authorization, rather than necessarily spawning a Codex process for each request.

Upstream: [OpenCodex source](https://github.com/lidge-jun/opencodex). No installed credentials or private configuration were inspected, reused or copied. The implementation here does not copy that project's OAuth client identity, refresh tokens, account pooling or private endpoint adapter.

## oh-my-paper's implementation and user flow

oh-my-paper uses the documented [Codex App Server authentication interface](https://learn.chatgpt.com/docs/app-server) as its local subscription transport. This is an implementation choice, not an assertion that all subscription integrations require a CLI or Electron.

1. Choose ChatGPT subscription in settings and explicitly start browser or device-code login.
2. Authenticate on OpenAI's page, not in a oh-my-paper password form.
3. The app-owned local Codex home holds credentials and refresh state. They are not returned to the renderer or copied from another application.
4. The app reads account/plan/available usage. It does not run AI merely because login succeeded.
5. An explicit translation, explanation or proposal sends only its scoped content. Subscription limits and authentication failures stop that operation; no paid API fallback occurs.
6. Disconnect removes this app's connection. It does not log the user out of Aside or their other Codex profiles.

## Credential isolation contract

oh-my-paper launches Codex App Server with an app-owned `CODEX_HOME`, `HOME`, and config path. CLI authentication credentials are configured for the OS keyring (`cli_auth_credentials_store = "keyring"`) in both the generated config and the launch override. There is no `file` or `auto` credential-store fallback: if the keyring-backed login cannot be used, the operation fails closed rather than writing a token to the app profile or switching to a paid API path.

The launch environment is an allowlist. It preserves the executable `PATH` and app-owned routing variables, while excluding inherited API credentials and endpoint overrides such as `OPENAI_API_KEY`, `CODEX_API_KEY`, and `OPENAI_BASE_URL`. oh-my-paper does not read or copy credentials from another Codex profile. This follows the official [Codex credential configuration](https://openai.com/index/running-codex-safely/) guidance for OS keyring storage; no real login or inference is part of this change.

Provider-reported limits may be unavailable and are not replaced with invented values. Subscription usage is shared with the same account's other clients. PDF structure analysis is independent and runs locally through PDF.js and PaddleOCR-VL.

## Web implications

### Local browser integration (2026-09-22)

The loopback server now owns the official runtime installed through `@openai/codex`.
It reuses the existing App Server adapter instead of copying OpenCodex's token
exchange or private-endpoint adapter. No `@bitkyc08/opencodex` package, proxy process,
or existing proxy credential is required for the OpenAI subscription path.

Browser settings call validated local routes for account status, login, cancellation,
logout, and persisted AI mode/model selection. Login-completed notifications travel
over a local event stream. The browser receives the provider's login URL and account
status, never access or refresh tokens. The app-owned profile and OS keyring preserve
the connection on restart. No login or inference is started during package installation.

The same selected mode routes reader requests and research planning/answers. API
configuration remains separate, with no silent fallback if subscription auth fails.
OpenAI is the only subscription provider integrated in this change. Old proxy
configuration files are preserved, but the browser now directs users to its own
ChatGPT login instead of exposing the external proxy option.

Successful local route tests and opening an authorization page are not evidence of
an authenticated completion. Live account approval, inference, and authenticated
reopen must be verified with the user's own OpenAI login.

OAuth itself does not require Electron. OCX's HTTP implementation shows why the earlier claim that a server-side Codex subprocess is universally necessary was too strong. However, current oh-my-paper relies on local IPC, SQLite/files and the managed App Server transport. Ordinary Workers cannot run that subprocess.

A hosted UI plus personal local companion can retain credentials and documents on-device. A fully hosted multi-user service instead needs a supported provider authorization arrangement, strict per-user credential isolation, refresh/revocation, storage and abuse controls. A community client's working private endpoint is not a public third-party SaaS API contract. No Cloudflare/GCP resources were recreated, and no free-hosting or unlimited-subscription claim is made.

## Claude subscription through the local Claude Code CLI (2026-09-28)

Personal-use only. Anthropic's Agent SDK documentation states that, unless previously
approved, third-party developers may not offer claude.ai login or rate limits in their
products. It is meant only for use on your own Mac; this mode must not be advertised or
shipped to other users.

- The loopback server runs the installed `claude` CLI (`CLAUDE_PATH`, `PATH`, then
  `~/.local/bin`, `~/.claude/local`, Homebrew and `/usr/local/bin`). No runtime is bundled.
- Authentication is the CLI's own login. The app reads `claude auth status --json` for the
  account, plan and email, and can start `claude auth login --claudeai`, which opens the
  browser itself. No token is read, copied or stored by oh-my-paper. There is no logout
  button because it would sign the user out of Claude Code everywhere.
- Each request is one headless turn: `-p` with stream-json input/output, `--tools ""`,
  `--safe-mode` (no CLAUDE.md, plugins, hooks or MCP), `--no-session-persistence`, the
  action's system prompt, and the selected model and effort (effort is omitted for Haiku 4.x).
  Images travel as base64 content blocks, never inside the prompt text.
- The child environment is an allowlist (`PATH`, `HOME`, locale, `TMPDIR`,
  `CLAUDE_CONFIG_DIR`). `ANTHROPIC_API_KEY`, auth tokens and base-URL overrides are never
  passed, so a failed subscription request cannot silently fall back to paid API billing.
- At most three CLI runs are active at once; queued and running requests honour
  cancellation. Logged-out, rate-limited, timed-out and cancelled runs map to the existing
  AI job error codes.
- Remaining-usage percentages are not available from the CLI and are not invented.
  Subscription usage is shared with the user's other Claude Code sessions.
- The Electron desktop shell does not implement this mode and rejects saving it.


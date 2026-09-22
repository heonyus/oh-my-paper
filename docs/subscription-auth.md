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

OAuth itself does not require Electron. OCX's HTTP implementation shows why the earlier claim that a server-side Codex subprocess is universally necessary was too strong. However, current oh-my-paper relies on local IPC, SQLite/files and the managed App Server transport. Ordinary Workers cannot run that subprocess.

A hosted UI plus personal local companion can retain credentials and documents on-device. A fully hosted multi-user service instead needs a supported provider authorization arrangement, strict per-user credential isolation, refresh/revocation, storage and abuse controls. A community client's working private endpoint is not a public third-party SaaS API contract. No Cloudflare/GCP resources were recreated, and no free-hosting or unlimited-subscription claim is made.

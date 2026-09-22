# Release readiness

As of 2026-09-06, version 2.0 is in integration QA. It is not commercially or publicly ready.
A blank-reader regression is being fixed; a successful build or simulated UI run does not establish
that the current reader workflow works. This page describes release limitations, not a second QA
ledger. The coordinator owns the [execution record](../.omo/evidence/ohmypaper-local-product/2026-09-06/execution.md)
for the [active product plan](../.omo/plans/README.md).

## Runtime prerequisites

The official target is Apple Silicon macOS (arm64). PDFs, Markdown notes, and collection metadata
remain local. A separate account-only Worker/D1 backend supports mandatory Google sign-in and app
sessions; it does not host documents or provider credentials. Offline access is bounded to a valid
lease of up to seven days after online verification, not unrestricted signed-out use.

The desktop main process needs `OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN`, `OH_MY_PAPER_ACCOUNT_ISSUER`, and
`OH_MY_PAPER_GOOGLE_CLIENT_ID`. The first two are exact HTTPS origins; the issuer must match backend
`APP_ISSUER`, and the Desktop OAuth client ID must be accepted by `GOOGLE_CLIENT_IDS`. Blank or invalid
values fail closed. The root `.env.example` contains only these non-secret desktop bindings.

An authorized account operator must separately configure Google OAuth/consent, HTTPS routing,
the Worker database, migrations, and a protected signing key. The committed local configuration does
not supply production credentials or infrastructure. See the [account-service contract](account-service.md).
Development test keys, local issuers, and simulated authenticated launchers are synthetic-only;
they must never unlock a shipping app or substitute for a live Google grant.

AI authorization is separate. ChatGPT subscription mode requires the official local Codex App Server
runtime and the user's own login in an isolated app profile. API and OCR connections use the user's
own credentials; Local OpenCodex is a separate proxy mode. No shared key or automatic paid fallback
is promised. Subscriptions, optional APIs/OCR, and backend operation have separate costs and limits;
there is no zero-charge guarantee. See [subscription authentication](subscription-auth.md).

## Outstanding verification

| Area | Current limitation |
|---|---|
| Reader integration | Blank-reader issue remains under repair; rerun import, render, source return, and reopen on the fixed build. |
| Live account authentication | Google consent/login/cancel, session renewal/revocation, offline expiry, and production backend operation remain unverified. Synthetic tests are not live-auth evidence. |
| Provider authentication and inference | Real subscription login, billing mode, inference, cancellation, usage, and disconnect need separate evidence. |
| Search and research | Live scholarly/web search and selected runtime search capability remain unverified; fixtures do not prove live retrieval. |
| Distribution | Signing, notarization/stapling, and installed-artifact acceptance remain unverified. Local packaging does not authorize public deployment or release upload. |
| Minimum macOS | No validated oldest supported OS. The plan's upstream macOS 13 floor is not an application compatibility guarantee. |

Use [Mac release guidance](mac-release.md) for configuration checks and local packaging. Availability
of a signing credential, a green preflight, or a run on the current Mac does not close these gates.
Public infrastructure activation and distribution require separate authorization.

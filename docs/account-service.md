# Scourgify account service contract

This is the account-only HTTP contract implemented by `apps/account-worker`. It has no document,
collection, provider-auth, AI, payment, or entitlement routes. The current Wrangler configuration is
local-only: it contains no remote D1 ID, no real Google client ID, and no signing key. Public
provisioning or deployment is not authorized by this repository state.

## Transport and common responses

- Production callers must use HTTPS. Authentication uses explicit bearer values, never cookies.
- JSON requests require `Content-Type: application/json` and are limited to 16,384 bytes.
- JSON responses use `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, and
  `X-Content-Type-Options: nosniff`.
- All timestamps are integer Unix seconds. Token strings must be treated as opaque except where the
  JWT claim contract below explicitly permits verification.
- Error bodies are always `{ "error": { "code": string, "message": string } }` for handled errors.

Handled error codes are `invalid_request` (400), `invalid_identity` (401), `invalid_access` (401),
`invalid_renewal` (401), `renewal_reuse` (401), `invalid_challenge` (409), `body_too_large` (413),
`rate_limited` (429), `not_found` (404), `method_not_allowed` (405), and
`service_misconfigured` (500).

## Routes

### `GET /health`

Public liveness check. It does not touch D1 or require signing configuration.

```json
{ "ok": true, "service": "scourgify-account", "version": 1 }
```

### `POST /v1/auth/challenge`

Request (strict JSON; additional fields are rejected):

```json
{ "codeChallenge": "<43-character base64url SHA-256 PKCE challenge>" }
```

Success: `201`.

```json
{
  "challengeId": "<UUID>",
  "nonce": "<43-character base64url value>",
  "pkceMethod": "S256",
  "expiresAt": 2000000600
}
```

The challenge expires after 10 minutes and is single-use. At most five unconsumed challenges may
exist per client key.

### `POST /v1/auth/exchange`

Request:

```json
{
  "challengeId": "<UUID returned by /v1/auth/challenge>",
  "codeVerifier": "<43-128 character PKCE verifier>",
  "idToken": "<Google ID token>"
}
```

The request has no `accountId`, email, subject, name, issuer, or audience field. The Worker verifies
the Google signature against Google's rotating JWKS, accepts only the configured Google client ID
audience and Google issuers, checks expiry, and requires the ID token `nonce` to equal the
server-issued nonce. It also requires `BASE64URL(SHA256(codeVerifier))` to equal the stored PKCE
challenge. Only the verified Google `sub` establishes identity. The optional signed `name` claim is
the only stored display metadata; email is not account identity.

Success: `200`, with the session response described below. Challenge consumption, account upsert,
session creation, and hashed renewal-token insertion are one D1 batch transaction. Concurrent
exchange of one challenge produces one success and one `invalid_challenge` response.

### `POST /v1/auth/renew`

Request:

```json
{ "renewalToken": "sr_<opaque random value>" }
```

Success: `200`, with a new session response. The renewal expiry is unchanged from interactive login.
The presented renewal credential is atomically marked consumed while its hashed replacement is
inserted. Confirmed reuse of a consumed credential revokes the complete session family and returns
`renewal_reuse`. Missing, expired, capped, or otherwise invalid credentials return `invalid_renewal`.

### `GET /v1/account`

Requires `Authorization: Bearer <accessToken>`. The JWT signature, issuer, audience, purpose, expiry,
account, and active D1 session are checked. An offline lease is rejected here.

Success: `200`.

```json
{ "account": { "id": "<UUID>", "displayName": "Researcher" } }
```

`displayName` can be `null`.

### `POST /v1/logout`

Request:

```json
{ "renewalToken": "sr_<current or previously consumed credential from the session>" }
```

The renewal credential authenticates the revocation request, so logout still works after access-token
expiry. Success is `204` with no body. The session and all of its renewal-token hashes are revoked in
one D1 batch. A missing or unknown credential returns `invalid_renewal`.

## Session response

`/v1/auth/exchange` and `/v1/auth/renew` return this exact shape:

```json
{
  "account": { "id": "<UUID>", "displayName": "Researcher" },
  "accessToken": "<ES256 JWT>",
  "accessExpiresAt": 2000000900,
  "renewalToken": "sr_<opaque random value>",
  "renewalExpiresAt": 2002592000,
  "offlineLease": "<ES256 JWT>",
  "offlineLeaseExpiresAt": 2000604800,
  "offlineLeaseKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "<base64url>",
    "y": "<base64url>",
    "alg": "ES256",
    "use": "sig",
    "kid": "<RFC 7638 JWK thumbprint>"
  }
}
```

The public JWK contains no private `d` member. The desktop must persist the public key received over
the authenticated HTTPS exchange together with its lease and select it by `kid`; it must not accept a
replacement key from an unrelated local file or untrusted payload.

## JWT claim contract

Both signed credentials have header `alg: "ES256"`, `typ: "JWT"`, and `kid` equal to the advertised
public JWK thumbprint. Both contain `iss` equal to configured `APP_ISSUER`, `sub` equal to the internal
account UUID, an unguessable `jti`, integer `iat`/`exp`, and `sid` equal to the server session UUID.

Access JWT:

```json
{
  "aud": "scourgify-account-api",
  "purpose": "account-api",
  "exp": "iat + 900"
}
```

Offline lease JWT:

```json
{
  "aud": "scourgify-desktop-offline",
  "purpose": "scourgify-local-access",
  "verified_at": "iat",
  "renewal_expires_at": "fixed interactive-login renewal expiry",
  "exp": "min(iat + 604800, renewal_expires_at)"
}
```

The offline lease is not accepted by any account-service route. Desktop policy separately owns
trusted-clock rollback detection, foreground/reconnect revalidation, known-revocation handling, and
preservation of unsaved buffers at expiry.

The renewal credential is not a JWT. It is 32 random bytes encoded as base64url with an `sr_` prefix.
Only its lowercase SHA-256 hash is stored in D1. The service retains consumed hashes until session
expiry to detect replay.

## Native login sequence owned by the desktop main process

1. Generate a fresh cryptographic PKCE verifier (43-128 unreserved characters), its S256 challenge,
   and a separate OAuth `state`.
2. Send only the S256 challenge to `/v1/auth/challenge`; retain verifier and state in the pending
   main-process transaction.
3. Open Google's authorization endpoint in the system browser using a Desktop OAuth client, the
   exact same PKCE challenge, the Worker-provided `nonce`, `openid profile` scopes, and a random-port
   `127.0.0.1` loopback redirect. Do not use an embedded password form or OOB copy/paste flow.
4. Accept the loopback callback only for the pending transaction and exact `state`; handle cancel and
   timeout. Exchange the authorization code with Google using the retained verifier.
5. Send only `challengeId`, the same verifier, and Google's ID token to `/v1/auth/exchange`. Do not send
   Google access/refresh tokens, provider credentials, documents, or client-supplied identity.
6. Store app credentials through the desktop's Keychain-backed main-process boundary. The renderer
   never receives Google credentials or signing private material.

Google documents PKCE and random loopback ports for desktop installed apps, and explicitly no longer
supports OOB copy/paste. Its backend guide requires verification of signature, audience, issuer, and
expiry before using `sub`: [native OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[backend ID-token verification](https://developers.google.com/identity/sign-in/web/backend-auth).

## Desktop main-process integration contract

Desktop configuration is one trusted main-process value with this exact shape:

```ts
type AccountClientConfig = {
  readonly serviceOrigin: string
  readonly issuer: string
  readonly googleClientId: string
}
```

`parseAccountClientConfig(value)` accepts only a strict object. `serviceOrigin` and `issuer` must be
exact HTTPS origins with no path, query, fragment, credentials, or trailing slash.
`createApplicationAccount` reads only `SCOURGIFY_ACCOUNT_SERVICE_ORIGIN`,
`SCOURGIFY_ACCOUNT_ISSUER`, and `SCOURGIFY_GOOGLE_CLIENT_ID` from the main-process environment. These
values are non-secret explicit deployment bindings; they are never read from renderer input and
there is no separate test-auth or bypass flag. This repository does not yet contain authorized
production values. If any value is missing or malformed, the helper returns
`unavailableAccountSession("service_not_configured")` and remains fail closed.

The stable bootstrap signature is:

```ts
async function createApplicationAccount(options: {
  readonly userDataRoot: string
  readonly getStore: () => WorkspaceStore | null
  readonly switchStore: (
    collectionRoot: string,
    indexFile: string,
    accountId: AccountId,
  ) => Promise<void>
  readonly prepareAuthenticatedAccount?: (accountId: AccountId) => Promise<void>
  readonly onStatusChanged: (status: AccountStatus) => void
}): Promise<{
  readonly session: AccountSessionController
  readonly login: GoogleLogin | null
  readonly dispose: () => Promise<void>
}>
```

The getter may return `null` only during a main-owned remount; collection authorization fails closed
in that interval. The helper constructs, initializes, and returns the session only after restore-time ownership checks finish.
Main calls it as follows:

```ts
const account = await createApplicationAccount({
  userDataRoot,
  getStore: () => currentStore,
  switchStore: async (collectionRoot, indexFile, accountId) => {
    const service = await resolveAccountServiceRootForAccount(userDataRoot, accountId)
    await remountApplicationStore(collectionRoot, indexFile, service.root)
  },
  prepareAuthenticatedAccount: async (accountId) => {
    const service = await resolveAccountServiceRootForAccount(userDataRoot, accountId)
    await remountCurrentCollectionServices(service.root)
  },
  onStatusChanged: (status) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(accountIpcChannels.statusChanged, status)
    }
  },
})
```

`account.dispose()` cancels a pending native login and drains registry work; it does not log out or
delete credentials. `login` is `null` when configuration is unavailable.

The third `switchStore` argument is mandatory at invocation. Existing two-argument callback
implementations remain assignable when they intentionally ignore it, but a remount implementation
must consume the principal to select account-scoped service state.
`prepareAuthenticatedAccount` is awaited before `AccountSession` changes or broadcasts status to
`authenticated`. Use it to finish the account-scoped provider-service remount; if it throws, the
session remains fail closed and no authenticated status is published.

Use `accountRemountRequiresReload(currentAccountId, nextAccountId, collectionChanged)` for the
renderer decision. It requires a reload when the collection changes or when one non-null mounted
account principal changes to another, even if a path comparison says the collection is unchanged.
The initial transition from the unbound service root does not force a reload. Collection ownership
is still checked and, for a first login, durably bound by `AccountSession` before account preparation;
a mismatched account remains `switch_required` and cannot invoke the preparation callback.

Provider keys, OCR credentials, Codex app-owned state, and AI mode use only the root returned by
`resolveAccountServiceRootForAccount(userDataRoot, accountId)`. By default this is
`userDataRoot/account/services/<accountId>`. Signed-out, credentials-needed, and unavailable startup
uses `resolveUnboundServiceRoot(userDataRoot)`, which returns
`userDataRoot/account/services/unbound`; it must never fall back to `userDataRoot/scourgify`.

Legacy `userDataRoot/scourgify` service credentials are used only after an explicit user-approved
call to `bindLegacyAccountServiceRoot(userDataRoot, accountId)`. That app-private owner marker is
write-once: rebinding it to another account fails, and merely finding the legacy directory never
claims or copies it. No consent UI or automatic legacy binding is implemented here.

`collectionSwitch` must implement three main-process operations:

```ts
type CollectionAccountSwitch = {
  readonly currentAccountId: () => Promise<AccountId | null>
  readonly bindUnownedToAccount: (accountId: AccountId) => Promise<void>
  readonly openForAccount: (
    accountId: AccountId,
    choice: "open_existing_for_account" | "create_separate_collection",
  ) => Promise<void>
}
```

A verified first login persists the grant and then binds an unowned collection. Restore checks the
current collection owner before returning an authenticated status. A mismatch returns
`switch_required`; protected IPC remains denied until the explicit open/create operation completes
and `currentAccountId()` reports the newly authenticated account. The session never reassigns an
owned collection.

Ownership is stored under `userDataRoot/account/collection-owners.json`, separate from portable
collection manifests. It records bounded collection/account UUID bindings and one preferred
collection per account, but no tokens or document content. A switch updates the private registry,
awaits the injected store remount, then durably replaces `active-collection.json`. On remount or
pointer failure it restores the prior registry and asks the same callback to remount the original
collection; a rollback failure is surfaced and never treated as authenticated success. A failed new
collection creation may leave an inactive unowned directory for manual recovery, but does not move
the active pointer or reassign an existing collection.

Install the global gate before `applicationIpc` or any other feature registrar calls
`ipcMain.handle`:

```ts
const restoreGlobalAccountGate = installGlobalAccountGate(
  ipcMain,
  accountSession,
  async () => capturedDirtySaveAccountId,
  (event) =>
    event.sender === mainWindow.webContents &&
    event.senderFrame?.url === mainWindow.webContents.getURL(),
  () => accountRemountInProgress,
)
```

The sender predicate is mandatory and runs even for public channels. Compare the expected
`WebContents` identity and exact frame URL; do not use string-prefix matching. The gate captures the
original bound `handle`, wraps all future registrations once without calling the replacement
recursively, and returns a restore function that cannot overwrite a later replacement. Its fixed
public allowlist is limited to account login/status/refresh/logout/switch, necessary provider/OCR
configuration and status, Codex login/status, and validated external-help opening. All other future
registrations call `accountSession.authorize()` by default.

The optional transition predicate closes the remount interval. While true, the gate rejects protected,
dirty-save, provider, OCR, Codex, and external-help IPC; only `account:status` remains callable. Set
it before disposing the prior application handlers and clear it only after the new collection and
account service root are mounted. Serialize remounts. A registry rollback supplies the original
collection owner's account ID and remounts that owner's service root before returning.

Use `installAccountGate(ipcMain, accountSession, senderPredicate)` to obtain the typed registrar for
`registerAccountIpc(registrar, accountSession, googleLogin)`. Account IPC registration must also occur
after the global hook. The redundant sender check on these few public handlers is intentional. Store
the returned unregister/restore functions for orderly app shutdown.

The only post-lock write exceptions are `workspace:save`, `workspace:flush`, and
`account:recovery-save`. They call
`accountSession.authorize({ kind: "dirty_save", accountId: capturedDirtySaveAccountId })`; the account
ID comes from the main-owned collection that was unlocked before the lock, not from renderer input.
`account:recovery-save` accepts the strict `accountRecoveryDraftSchema` and must write a recoverable
draft artifact only. It must not call the normal knowledge-node update path or mutate canonical note
state while locked. A suitable registration is:

```ts
const disposeRecovery = registerAccountRecoveryIpc(
  registrar,
  accountRecoveryRoot,
  async () => capturedDirtySaveAccountId,
)
```

The callback passed to `registerAccountRecoveryIpc` returns the captured account ID or `null`; `null`
is denied. The handler validates `accountRecoveryDraftSchema` and durably replaces a new mode-`0600`
JSON artifact below `accountRecoveryRoot/<accountId>/<nodeId>/<random UUID>.json`, including file and
parent-directory flushes. Renderer values cannot select a path or overwrite canonical note bytes.

`account:recovery-list` accepts `{ "limit": 1..50 }`; it scans at most 256 account-directory entries
and 512 candidate file entries and returns metadata only. `account:recovery-read` accepts the strict
`{ recoveryId, nodeId }` pair and returns `{ recoveryId, draft }` only below the currently
authenticated account directory. Reads reject symlinked directories, non-files, malformed records,
ID/path mismatches, and records over 16,777,216 bytes. The 16 MiB cap covers the maximum valid
multibyte serialization allowed by the two 2,000,000-character draft fields. Both restore routes are
normally protected and cannot be used through dirty-save grace. Applying a recovered draft remains
a normal authenticated knowledge-node update; recovery storage never applies or deletes canonical
note bytes itself.

`capturedDirtySaveAccountId` must be captured while the collection is authenticated and must become
`null` when no previously unlocked collection exists. The global gate rejects the recovery channel
when it is `null`.

Every custom asset/file protocol handler must call
`await authorizeAccountOperation(accountSession, transitionPredicate)` before reading or returning
local bytes. This applies the same remount lock as protected IPC before session authorization, so an
already-authenticated old session cannot read an old asset URL during handoff. The global IPC hook
does not protect protocol handlers by itself.

## Desktop preload and renderer binding

`createPreloadAccount()` returns the complete `AccountApi`: `status`, `login`, `cancelLogin`,
`refresh`, `logout`, `switchCollection`, `saveRecoveryDraft`, `listRecoveryDrafts`,
`readRecoveryDraft`, and `onStatusChanged`. Merge that object into the existing context-bridge API in
preload; do not expose `ipcRenderer`, credentials, config, or the session object. Every request and
response is Zod-validated. `onStatusChanged(listener)` validates every pushed status and returns an
unsubscribe function. Main emits from `AccountSessionOptions.onStatusChanged`; there is no polling.

The root owns current status and calls `refresh("foreground")` on an explicit window foreground event
and `refresh("reconnect")` on an explicit network reconnect. `refresh` makes no request while the
access credential is current and online verification is less than 24 hours old, except reconnect is
always revalidated. Do not add an idle timer or retry a protected action automatically after login.

Mount the prop-driven account component around the already existing application tree:

```tsx
<AccountGate
  status={status}
  entitlement={{ tier: "free" }}
  busy={busy}
  error={error}
  onLogin={login}
  onCancel={cancelLogin}
  onRefresh={refreshFromUserAction}
  onOpenHelp={openHelp}
  onOpenSettings={openSettings}
  onSwitchCollection={switchCollection}
>
  <App />
</AccountGate>
```

Before the first authenticated state, the protected child tree is not mounted. After it has been
unlocked once, expiry, revocation, rollback, or account switching keeps the same child tree mounted
under an `inert` and `aria-hidden` container while an opaque blocking overlay is shown. This preserves
an unsaved CodeMirror buffer without allowing interaction. Root should snapshot its live note draft
and offer `saveRecoveryDraft`; it must not replace the retained tree with a new guest `App` instance.

The free entitlement object is separate from account identity and from AI provider configuration.
Neither a Google app login nor a free entitlement grants access to ChatGPT, Codex, Mistral, or a paid
API.

Electron recommends the asynchronous `safeStorage` APIs on macOS so Keychain access can complete
without blocking, and warns that `shell.openExternal` must not receive untrusted links:
[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage),
[Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

## Bounds and persistence

- Per-client fixed-window limits are 10 challenge, 20 exchange, 30 renew, 120 account, and 20 logout
  requests per 60 seconds. D1 stores only a hash of the Cloudflare client key.
- Ten active sessions are retained per account; a new interactive login revokes sessions older than
  the nine newest. A session permits at most 4,096 renewal rotations.
- Access lasts 15 minutes. Renewal lasts at most 30 days from interactive login and never slides.
  Offline use lasts at most seven days and never beyond renewal expiry.
- D1 contains Google `sub`, optional display name, session/revocation timestamps, challenge metadata,
  rate counters, and renewal hashes. It never stores Google ID tokens, PKCE verifiers, renewal
  plaintext, email identity, provider tokens, PDFs, notes, or document metadata.

D1 prepared statements and batches are used for all untrusted values and multi-write transitions.
Cloudflare documents that D1 batch statements execute sequentially as a transaction and roll back the
sequence on statement failure: [D1 binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Local verification

Prerequisites are Node.js, npm, and the isolated package dependencies. No Cloudflare login is needed
for local tests.

```sh
npm --prefix apps/account-worker install
npm --prefix apps/account-worker run typegen
npm --prefix apps/account-worker run typecheck
npm --prefix apps/account-worker test
```

For a persistent local server, create a disposable directory, apply migrations to it, create an
uncommitted `apps/account-worker/.dev.vars` containing a synthetic ES256 private JWK under
`APP_JWT_SIGNING_JWK`, and use the same persistence directory for both commands:

```sh
ACCOUNT_WORKER_STATE="$(mktemp -d /tmp/scourgify-account.XXXXXX)"
npm --prefix apps/account-worker run db:migrate:local -- --persist-to "$ACCOUNT_WORKER_STATE"
npm --prefix apps/account-worker run dev:local -- --persist-to "$ACCOUNT_WORKER_STATE" --port 8789
curl --fail http://127.0.0.1:8789/health
```

The committed configuration intentionally uses `UNCONFIGURED_GOOGLE_DESKTOP_CLIENT_ID`; a real Google
token cannot pass until an authorized deployment supplies its Desktop client ID and HTTPS issuer.

## Deployment prerequisites and unverified gates

Activation requires separate authority to create a Cloudflare Worker and D1 database, bind the real
database ID, set `APP_JWT_SIGNING_JWK` with `wrangler secret put`, configure an HTTPS issuer and Google
Desktop client ID, apply remote migrations, and set fail-closed routing/abuse controls. Google consent
screen and verification requirements depend on the final audience and publication status. Current
Cloudflare account plan, D1/Worker cost, quotas, production rate-limit topology, domain/TLS ownership,
key rotation procedure, Cross Account Protection, and live Google login/cancel behavior remain
unverified. No resource was provisioned and no deploy command was run.

Current local tests use real workerd/Miniflare D1 storage and the production JOSE verification logic
with local test keys. They do not contact Google's JWKS endpoint and are not evidence of a live Google
grant. Cloudflare's current local-test guidance is documented at
[Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
and [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/).

# Deep research integration contract

Tasks 22–24 add a bounded research lane without changing the existing application root or Codex subscription adapter. The lane is inert until the user creates a preview, reviews its scope and budgets, checks the consent control, and starts the job.

## Delivered boundaries

- `WebDiscoveryService` accepts results only from an injected `OfficialWebSearchPort`. It calls `runSearch` only after `readCapability` reports the Codex app server, ChatGPT subscription billing, live search mode, and structured source events as verified. An unavailable or ambiguous capability fails closed; there is no proxy, search-page scraper, API-key fallback, or quota fallback.
- `createSourceFetcher` accepts credential-free HTTPS only. It resolves and rejects private, link-local, loopback, documentation, multicast, and reserved destinations before dispatch; pins the approved address into undici; repeats validation for every redirect; and bounds redirects, time, content types, and streamed bytes. HTML/plain text is capped at 5 MB, PDF at 100 MB, redirects at five, and each retrieval at 30 seconds.
- `ResearchJobStore` persists validated snapshots in the collection’s existing SQLite database. A process restart converts every running job to `paused`, converts pending request IDs to `unknown_outcome`, and requires a user resume. Counts are committed before local reads, search, source retrieval, and model calls.
- Official provider request IDs are copied from the completed structured search item into the persisted request log. They are never reconstructed from assistant prose.
- Default preview budgets are five searches, twenty total source attempts, fifteen active minutes, and twenty model turns. Search, auth, quota, network, time, and budget stops remain visible. Provider token usage stays `unknown` unless the official runtime reports both input and output counts.
- Search metadata is retained as `metadata-only`. Retrieved HTML carries a content hash and exact processed excerpt. A downloaded PDF is labelled `PDF binary only`; it is not represented as read text and has no fabricated page. Model-returned evidence IDs must belong to the validated source set.
- The generated report is a draft. The user can edit its title and Markdown before an explicit save. Saving calls an injected async note creator so the main process can use `CollectionService.createNode`; the returned note is the canonical folder-Markdown record. Structured citation metadata is retained on that node.
- Model-authored Markdown links are retained only when their normalized destination exactly matches a selected source record. Other inline, autolink, and bare HTTPS destinations are replaced and make the draft partial. Source titles, snippets, and destinations are Markdown-escaped; the report section is labelled `Source references`, not `Validated sources`.
- `ResearchView` loads the bounded local job list on mount, restores a selected job without external work, polls every 500 ms only while that job is running, and stops polling after the first status-channel error. Its source list shows the exact retained URL, page state, snippet, and access label.

## Required main-process wiring

The integration owner should wire these new APIs without copying credentials or reading the user’s Codex profile directory:

1. Extend the existing app-owned Codex app-server client with a generic completed-item listener or an equivalent bounded `thread/items/list` read. The installed protocol exposes `modelProvider/capabilities/read` and completed `webSearch` items with `{ id, query, action, results }`; the current oh-my-paper client does not forward those items.
2. Implement the narrow `OfficialWebSearchPort` interface from `src/electron/webDiscovery.ts`. Verify a ChatGPT subscription account, provider `webSearch` capability, a research-only `web_search = "live"` thread configuration, and structured result availability. Parse only returned `{ title, url, snippet }` fields and preserve the item `id` as `providerRequestId`. If any proof is absent, return an unavailable capability.
3. Construct the ready service with `createApplicationResearch({ store, createNode, codexAdapter, readLocalSource, officialSearchPort })`. The default omitted `officialSearchPort` is intentionally usable only for local-source synthesis and returns `structured_sources_unverified` for external search.
4. Construct `ResearchJobStore` with `collectionService.repository.db`; pass `input => collectionService.createNode(input)` as `createNode`. The local reader must return a validated `ResearchSource` and must not run during preview. The factory already wires safe retrieval and the existing subscription completion adapter without API-key or Local OpenCodex fallback.
5. Register the returned jobs with `registerResearchIpc`, add `research: createResearchPreload()` to the main preload object and its shared window type, then pass that prop to `ResearchView`. Pass `onOpenLocalSource={openNode}` as well: only an exact `ohmypaper://node/<KnowledgeNodeId>` is parsed, branded, and sent through that internal callback; it is never rendered as an external link. These existing root files were deliberately not edited in this bounded lane.
6. On window shutdown, collection close, or account switch, first `await` the async unregister function. It aborts active jobs and waits for every runner and in-flight canonical-note save to settle before handlers are removed and SQLite may be closed.

The current subscription adapter configures web search as disabled and does not expose structured `webSearch` lifecycle items. The installed protocol supports the necessary shapes, but that is not proof that the mounted account/provider returns sources. Until the integration owner adds and verifies the narrow port above, the honest production state is `search_unavailable`. Live OAuth, live inference, live web search, and private-document network transmission were not exercised in this lane.

## Official protocol basis

The Codex app server documents `thread/start`, `turn/start`, item lifecycle notifications, per-turn usage, and the structured `webSearch` item. Its generated configuration schema defines web search modes including `disabled`, `cached`, and `live`. These are the only accepted protocol basis for the subscription search port:

- [OpenAI: Unlocking the Codex harness](https://openai.com/index/unlocking-the-codex-harness/)
- [OpenAI Codex app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [OpenAI Codex configuration schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json)

## Targeted evidence

Run only the bounded lane tests:

```sh
npx vitest run \
  tests/unit/localProduct/researchApplication.test.ts \
  tests/unit/localProduct/researchIpc.test.ts \
  tests/unit/localProduct/researchView.test.tsx \
  tests/unit/localProduct/researchJobs.test.ts \
  tests/unit/localProduct/researchReport.test.ts \
  tests/unit/localProduct/webDiscovery.test.ts \
  tests/unit/localProduct/webDiscoverySourceFetch.test.ts
```

The synthetic coverage checks explicit preview/start consent, count-before-call persistence, provider request IDs, late transport completion after cancellation, awaited disposal, unknown usage, explicit canonical-note save, restart-to-paused recovery, reopen history, polling-error termination, inspectable access labels, unknown evidence rejection, capability fail-closed behavior, HTTPS result normalization, redirect revalidation, private-address rejection, HTML-as-PDF rejection, inert HTML extraction, and streaming byte limits.

## Remaining integration and QA

The main integration owner must still edit the existing adapter/preload/window type/App root, then personally run Electron QA. Acceptance should include unavailable capability, explicit start, cancel, auth/quota/network pause, restart and deliberate resume, report edit/save/open/reopen, keyboard focus, narrow panes, light/dark, and 50/100/200% text. A passing unit test or build does not establish live subscription search, OAuth, inference, or canonical-note persistence in the mounted app.

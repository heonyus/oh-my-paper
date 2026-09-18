# Scourgify memory system

This task adds a local, inspectable semantic-memory store and bounded mounting adapters. It does
not call an AI provider, access Wiki/llm-wiki, or fetch external content. The host still owns
calling the initializer and exposing the adapters from its existing Electron bootstrap.

## Records and authority

`src/shared/memorySchemas.ts` defines the boundary contracts. A semantic record has:

- a stable memory ID and derivation key;
- an explicit scope (`collection`, `project`, `document`, `note`, or `session`);
- local evidence with source key and source revision;
- record revision, origin (`user`, `navigation`, or `local_inference`), and ISO timestamps;
- one of `pending`, `accepted`, `rejected`, or `invalidated`.

The SQLite tables are created by `initializeMemoryRepository(db)` and are namespaced as
`semantic_memories`, `semantic_memory_evidence`, `semantic_memory_tombstones`, and
`factual_navigation_recents`. Evidence is normalized so source revision changes can be
invalidated without guessing from a serialized text blob. A memory is derived context, not a
replacement for a Markdown note, PDF, evidence anchor, or knowledge record.

## Lifecycle API

```ts
const memory = initializeMemoryRepository(existingDatabase)

const proposed = memory.propose(draft)
const accepted = memory.approve(memoryId)
const rejected = memory.reject(memoryId)
const forgotten = memory.forget(memoryId)
const invalidatedCount = memory.invalidateSource(sourceKey, currentRevision)
```

`propose` creates a pending record. Pending, rejected, and invalidated records remain
inspectable and are never returned by semantic retrieval. `approve` is the separate review
action; accepting a memory does not accept a graph relation. `forget` keeps the record as a
rejected history item and writes a derivation/scope tombstone. A later `propose` for the same
derivation returns `suppressed`, so an old summary cannot silently return. `createApproved` is
the explicit approval path for creating a new record after a tombstone.

`invalidateSource(sourceKey, currentRevision)` marks every memory whose local evidence points
to an older revision as `invalidated`. The source record itself is untouched. The IPC list,
retrieve, and export boundaries re-check accepted source evidence with the injected main-side
reader before exposing it; stale or deleted exact-source records are invalidated there. The
collection subscription hook is still useful for prompt updates, but correctness does not depend
on a reconciliation event. There is no background watcher or AI maintenance job in this task.

## Typed Electron seam

The new adapter seam is intentionally callable without changing an existing host:

The owning main bootstrap derives the scope from the active collection, rather than from the
renderer:

```ts
const collectionScope = {
  kind: "collection",
  key: collection.files.manifest.collectionId,
}
const sourceRevisionReader = createMemoryCollectionSourceReader(
  collection,
  readCanonicalPdfEvidence,
)
const dispose = registerMemoryIpc(ipcMain, store.repository.db, {
  collectionScope,
  sourceRevisionReader,
})
const memoryApi = createMemoryPreloadApi(ipcRenderer)
```

`memory:scope` is a protected read channel: it accepts only `{}` and returns the scope captured
by the main registration. The preload resolves that channel asynchronously for every operation,
so a main-side registration can be disposed and recreated when the native collection changes.
The optional second argument to `createMemoryPreloadApi` is a validated scope override for tests;
production mounting should omit it. Account identity is not part of this local collection scope.

`registerMemoryIpc` validates every request and response with the shared Zod contracts, rejects
scope mismatches, and exposes list, retrieval, proposal, approval, rejection, forgetting,
invalidation, and paginated export operations. `createMemoryPreloadApi` validates again and
resolves every call through the protected active collection scope. `MemoryView` is the
prop-driven wrapper for that API: it loads list/recents, shows busy/error states, generates an
internal UUID for each new manual memory, and provides simple approval/rejection/forgetting
through `MemoryInspector`.

Renderer proposals may identify a knowledge node or PDF fragment revision, but cannot supply the
quote, page, or accepted evidence itself. `createMemoryCollectionSourceReader` checks node
existence through `CollectionService.getNode` and reads the canonical note revision from
`CollectionService.index.get(nodeId)?.revision`. It must not read `knowledge_nodes.body` or
metadata timestamps: canonical note bodies can be empty in that database. The PDF callback is
also main-owned and must read the local anchor plus immutable document-version hash. A stale or
unvalidated source-dependent record remains unapproved.

The collection-change invalidation hook is also host-owned and does not require editing the root
bootstrap in this task. It is an early-update optimization; the read-boundary validation above
remains authoritative:

```ts
const unsubscribe = collection.subscribe(
  createMemoryCollectionChangeInvalidator(
    store.repository.db,
    (nodeId) => collection.index.get(nodeId)?.revision ?? null,
  ),
)
```

The host should dispose the IPC registration and this subscription together when switching or
closing a collection. `invalidate` and `export` remain available as explicit host hooks; no host
wiring or production mount is claimed until the owning bootstrap calls these functions.

## Retrieval boundary

`MemoryRepository.retrieve({ scope, terms })` performs deterministic, local candidate ranking.
It reads accepted records in the exact requested scope, scores matching terms in memory text and
evidence quotes, then applies both limits:

- at most 8 records;
- at most 1,000 conservative token units.

`estimateConservativeTokens` uses a deliberately conservative local estimate, and persisted
caller estimates are clamped upward to that estimate. The result exposes the records actually
used, their aggregate conservative count, and the number omitted. No pending, rejected,
invalidated, out-of-scope, or recency-only record is admitted.

## Navigation recents

`recordNavigation` and `listNavigationRecents` use a separate factual-recents table. It keeps
the latest 100 navigation facts and is not semantic memory, is not returned by `retrieve`, and
does not age-purge semantic records. The approved 30-day note-history policy therefore does not
apply to these semantic records.

Source keys are validated as local Scourgify identifiers. HTTP(S) URLs and `wiki:` sources are
rejected at the schema boundary. Stored PDF/Markdown/imported text remains untrusted data and
cannot expand tools, providers, scope, or permissions.

## Inspector contract

`src/renderer/components/memory/MemoryInspector.tsx` is a prop-driven renderer. It accepts a
`MemoryPage`, separately supplied navigation recents, a pending action ID, and typed callbacks
for page changes, approval, rejection, and forgetting. It shows provenance, scope, revision,
source evidence, conservative budget, review state, and separate navigation recents. It uses the
existing knowledge surface classes and semantic CSS variables; it does not introduce a new
design system or mutate an existing UI host.

The inspector and `MemoryView` remain prop-driven. The current host mounts the preload API and
memory route through its application bootstrap; `projectName` is optional, so the default user
scope label is simply “이 컬렉션”.

## Verification

The real in-memory SQLite lifecycle checks are:

```sh
npx vitest run tests/unit/localProduct/memoryLifecycle.test.ts --environment node --reporter=verbose
npx vitest run tests/unit/localProduct/memoryIpc.test.ts --environment node --reporter=verbose
npx vitest run tests/unit/localProduct/memoryInspector.test.ts tests/unit/localProduct/memoryView.test.ts --environment jsdom --reporter=verbose
```

They cover pending-to-approved retrieval, source invalidation, non-resurrection after forget,
explicit recreation, 8/1,000 retrieval bounds, 100 navigation recents without semantic age
purge, and rejection of HTTP/Wiki source keys.

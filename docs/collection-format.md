# oh-my-paper collection format

Status: schema version 1 local storage and repository integration. Renderer wiring and migration of
the user's personal profile remain separate QA-gated actions.

## Directory layout

```text
<collection>/
  collection.json
  notes/
  papers/
  assets/
  .ohmypaper/
    metadata.sqlite
    journal/
    history/
    conflicts/
    recovery/
```

`notes/` contains the canonical note bodies. `papers/` is reserved for immutable managed PDF
versions named by document-version ID. `assets/` stores immutable files as
`<sha256>.<lowercase-extension>`. `.ohmypaper/metadata.sqlite` is portable bibliographic,
relation, evidence, placement, project, reader-state, and other non-note metadata. Note rows retain
identity/title/aliases but their database body is empty. A machine-local
`<userData>/collections/<collection-id>/index.sqlite` projects canonical note text and FTS and can
be deleted and rebuilt.

`collection.json` is strict and contains no machine profile path, credential, or secret:

```json
{
  "format": "scourgify-collection",
  "schemaVersion": 1,
  "collectionId": "00000000-0000-4000-8000-000000000000"
}
```

A higher schema version is rejected before a writer lock or other app state is created. Schema
versioning is independent of the application version.

## Canonical Markdown notes

Each canonical note has one stable UUID in namespaced frontmatter:

```markdown
---
ohmypaper:
  id: 00000000-0000-4000-8000-000000000000
---
# Note
```

The reader also recognizes the equivalent `ohmypaper.id: <uuid>` spelling. It extracts only this
identity field. It does not parse, reorder, normalize, or serialize the remaining YAML or Markdown;
all caller-supplied bytes, line endings, whitespace, and unrelated frontmatter are written exactly.
Invalid UTF-8, missing identity, duplicate identity fields, and duplicate IDs across files are
rejected.

New app-generated paths use `notes/<note-id>.md` from `initialNoteRelativePath(noteId)`. A later
external rename does not change identity because the frontmatter UUID remains authoritative.

The SHA256 of the complete file bytes is its revision. Saving requires the revision the caller read,
or `null` only when creating a new path. A mismatch returns a conflict and retains exact current and
incoming bytes under `.ohmypaper/conflicts/`; it never overwrites the current note.

## Exported file API

`src/electron/collectionFiles.ts` exports:

- `initializeCollection(root, collectionId)`
- `createCanonicalNoteBytes(noteId, body)` and `initialNoteRelativePath(noteId)`
- `CollectionFiles.open(root, options?)`
- `readNote(relativePath)` and `scanNotes()`
- `saveNote({ relativePath, bytes, expectedRevision, reason, acknowledge? })`
- `writeAsset({ bytes, extension })`
- `recover()` and `acknowledgeRecovery(operationId)`
- `close()`

`saveNote` returns a discriminated `saved`, `conflict`, or `metadata_pending` result. The optional
`acknowledge(note)` callback is the integration seam for the synchronous metadata repository. It is
called only after the Markdown rename and directory flush. If it fails, the canonical file remains
committed and the durable journal reports `metadata_pending` after restart. Repository integration
must reconcile that result and then call `acknowledgeRecovery`.

`files.history` exposes boundary/typing snapshots, conflict evidence, pruning, and separate recovery
drafts. Typing snapshots are limited to one per 30 seconds. Explicit save, close, external-change,
and restore boundaries are not throttled. `prune()` removes only unprotected snapshots strictly
older than 30 days; unresolved conflict revisions and conflict byte copies remain protected. Call
pruning only after a successful durable save/reconciliation.

## Repository and application API

`CollectionService.open(collectionRoot, indexFile)` opens the single writer, portable metadata DB,
and rebuildable index, recovers the journal, and reconciles canonical files. Its narrow application
surface is:

- `createNode`, `updateNode`, and `deleteNode` for canonical note CRUD and ordinary metadata nodes
- `getNode` and `findNodes`, with note bodies/search projected from the local index
- `rescan`, `status`, `restore`, `writeAsset`, and `close`
- `collectionRoot`, `files`, and `history` for bounded main-process collection APIs
- `subscribe(listener)`, returning an unsubscribe function; reconciliations emit changed/removed
  note IDs for renderer refresh and dependent-cache invalidation

In canonical mode, direct repository note create/update/delete calls fail with
`CanonicalNoteWriteError`. `withCanonicalNoteWrite` is an internal projection gate used only after
the collection service has arranged the file operation. Non-note metadata repository operations
remain synchronous.

`WorkspaceStore.openCollection(collectionRoot, indexFile)` returns a store whose `initialize()`,
`read()`, `save()`, and `close()` methods are awaitable. `store.collection` is the nullable canonical
service getter. Legacy `new WorkspaceStore(root)` remains available so an existing personal profile
is not migrated merely by launching this code.

Workspace note saves compare canonical bodies against the renderer snapshot acknowledged by
`read()`. The disk revision observed during the save is never treated as the renderer's baseline.
Changing an existing body without an acknowledged baseline records an unresolved conflict and keeps
the exact external file bytes. This protects an external edit when an otherwise unrelated board save
arrives from a stale renderer.

`CollectionWatcher.start(service, callback)` watches the `notes/` directory, coalesces events, and
reconciles through the service. `focus()` and `manualRescan()` cover watcher gaps; there is no idle
whole-vault polling.

## Durability and filesystem boundary

Only one app writer may hold a collection. Each write retains previous and incoming bytes, writes and
flushes a same-directory temporary file, checks the target revision again, renames, flushes the
directory, and only then invokes metadata acknowledgment. Restart recovery either finishes a prepared
write, reports metadata acknowledgment still pending, or records an explicit conflict. A failed
pre-rename write retains the incoming bytes as a separate recovery draft and leaves the last committed
note untouched.

Portable paths reject absolute paths, traversal, backslashes, NULs, and colon-based drive/path forms.
Every existing path component and collection scan rejects symlinks, non-file entries, duplicate note
IDs, and case-insensitive/NFC-equivalent name collisions. Known network-managed filesystem types expose
a `reliabilityWarning`; callers must surface it rather than promise local rename/flush behavior.

A filesystem rename and a SQLite transaction are not one atomic transaction. The journal and content
hashes make the boundary recoverable, but arbitrary external editors do not participate in the app's
transaction or writer lock. A committed file with failed metadata/index acknowledgement remains
canonical and is reconciled on restart; metadata is never used to roll the note back.

## Reversible legacy migration

`previewCollectionMigration(legacyRoot, userDataRoot, collectionId?)` reports counts and the
non-destructive destination. `migrateLegacyCollection(...)` is explicit: it stages a new collection,
makes a consistent SQLite backup, copies the legacy workspace and every regular file under the legacy
PDF directory, writes canonical notes, preserves metadata/relations/settings, maps verified PDFs to
`papers/<document-version-id>.pdf`, validates, and only then writes `active-collection.json`. Missing
legacy PDFs remain reported as missing version IDs. Hash mismatch, unsupported filesystem entries, or
any interrupted stage leaves the active pointer unchanged and never erases the legacy source.

No personal profile is migrated automatically. The staged backup lives under
`.ohmypaper/migration-backup/`, and the original legacy root remains the rollback source.

## Import, export, and backup authority

Import stages and validates content before it enters canonical storage. Export produces selected
copies and never redacts or rewrites canonical notes. A full collection backup must include managed
PDFs, assets, `collection.json`, canonical notes, and a consistent SQLite backup; ordinary exports do
not implicitly include history, conflicts, recovery drafts, jobs, or private memory state.

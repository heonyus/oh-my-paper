# Reader duplicate-root investigation

This file is the reader-owned temporary diagnostic record. The root `.debug-journal.md` was concurrently replaced by an unrelated memory task, so it is not modified here.

## Reproduction

Command used for GUI runs:

```text
npx playwright test tests/e2e/localProduct/pdfEvidenceNavigation.spec.ts --workers=1 --trace on --timeout=20000 --output=/tmp/scourgify-reader-fix-N
```

## Bounded experiments

1. Fresh production artifact with existing diagnostic test: `boardCount=84` before backlink, `85` after, repeated `added=1,removed=0`, renderer crash, no pageerror.
2. Removed only `flushSync` around `PdfSurface` scale commit: `37 -> 38`, same repeated additions and renderer crash. Negative as a complete fix.
3. Suppressed only rendered-zoom state update from `onScaleCommitted`: `40 -> 42`, same crash. Negative; restored.
4. Temporary `BoardViewport` mount/unmount probe: repeated same-id mounts with one unmount before the first measurement; count reached `31 -> 32`, then continued to `74` during the failing assertion. This is repeated component mounting, not one DOM node duplicating itself. Probe removed afterward.
5. Removed only renderer `StrictMode`: `83 -> 84`, same crash. Negative; restored.
6. Suppressed only `PageTranslationPortal` in `ResearchSidebar`: `81 -> 82`, same crash. Negative; restored.
7. Restored production build with parent probe: `shellCount=1`, all boards had immediate parent `app-shell`, `86 -> 87`, same crash. The roots accumulate as siblings in one shell; no second live App shell.
8. Temporary unminified React development renderer: repeated warnings identified the exact mechanism: `Encountered two children with the same key, a8d53c8ee54d5942`, matching `ReaderWorkspace`'s redundant `key={document.id}` on the single `BoardViewport`. The portal, scale callback, and StrictMode toggles were already negative.
9. Removed only that BoardViewport key, rebuilt production, and reran the clean GUI flow: `1 passed (4.8s)`, including the strict `.board-viewport` count of exactly 1 and the evidence backlink/source-highlight assertions.

## Current diagnostic state

- Production source behavior is restored for `PdfSurface`, `main.tsx`, `ResearchSidebar`, and `BoardViewport`; `ReaderWorkspace` now omits the redundant BoardViewport key.
- The named e2e test retains only the strict `.board-viewport` count regression; temporary console, fiber, parent-count, and MutationObserver probes were removed.
- Full `npm run build`, scoped Biome check, typecheck, and the clean production GUI regression pass.

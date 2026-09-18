# Native reference management

This module adds a thin bibliographic editor to an existing Knowledge `paper` node. It is not a second library, does not contact Zotero or any network service, and never merges records automatically.

## Stable integration API

The shared contract is `BibliographyApi` in `src/shared/bibliographyIpc.ts`:

- `getPaper(paperNodeId)` returns the paper node plus normalized bibliographic metadata.
- `previewDuplicates(input)` reports other paper nodes with the same normalized DOI or arXiv identifier.
- `updatePaper(input)` updates the existing paper node after the caller has handled that preview.
- `exportBibtex({ paperNodeIds })` returns bounded local `references.bib` content. It does not write a file from the renderer.

The main-process integration point is `new BibliographyService(knowledgeRepository)`, followed by `registerBibliographyIpc(service)`. Expose `createBibliographyPreload()` under the app's existing preload bridge. The Library paper-detail entry can render `PaperBibliographyPanel` with one loaded `BibliographyPaper` and the three matching API callbacks. These existing mount files are intentionally left for the main integration owner.

## Storage behavior

Bibliographic fields are stored in the existing paper node metadata: `citationKey`, `authors`, `year`, `doi`, `arxivId`, `venue`, `tags`, and `readingState`. Updates spread the current metadata before replacing those fields, retain the node ID and body, and do not modify document-version or source-anchor records. DOI and arXiv aliases are refreshed while unrelated aliases remain intact.

Citation keys are generated from the first author's surname, year, and first useful title word. Once persisted, a key remains stable across later metadata edits. A new collision receives a deterministic suffix from the paper node ID.

Duplicate detection is deliberately conservative: only exact normalized DOI or arXiv matches are shown, at most 100 candidates. Citation-key and duplicate checks page through a bounded maximum of 10,000 paper nodes. The panel blocks its first save when candidates exist, offers an explicit “keep duplicate and save” action, and exposes no merge action.

## Current limits

- BibTeX export uses a compact `@article` mapping and supports at most 64 selected papers per request.
- Libraries above 10,000 papers need a repository identifier index instead of the bounded scan.
- The panel displays generated BibTeX so the existing trusted main-process save flow can persist it; it does not gain direct filesystem authority.

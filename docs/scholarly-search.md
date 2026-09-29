# Scholarly search core

Task 21 exposes a main-process TypeScript function, `searchScholarly`, and a separate Electron
IPC adapter for explicit read-only metadata search. Importing or opening a PDF does not call it.

## Contract

`searchScholarly(request, options)` searches one or more of `crossref`, `arxiv`, and `openalex`.
The request accepts a non-empty query, optional publication-year bounds, page 1–100, and a
display page size of 1–100. A page is requested independently from each selected provider and
the returned provider pages are interleaved into at most the requested display size.

Every item retains its provider record ID and available DOI, versioned arXiv ID, or OpenAlex ID.
Entries from different providers are not merged, even when an identifier agrees but metadata
conflicts. Metadata, abstract, and full-text access are separate states. A metadata result does
not mean that oh-my-paper downloaded or read the paper.

Every provider has its own success or error state. A successful empty response is distinct from
a malformed response. Rate limits include a parsed `Retry-After` delay when supplied. There are
no automatic retries, paid fallbacks, API credentials, imports, or PDF downloads.

## Transport limits

- At most two provider requests run concurrently.
- Each request has a 15-second timeout.
- Response bodies are streamed and stopped above 5 MiB.
- Redirects are disabled.
- Cancellation prevents undispatched provider requests from starting.
- Search text and returned content are not logged.

The default transport uses the installed `undici` dependency. Tests can inject a synthetic
transport or wire stream without weakening the production limits.

## Provider details

- Crossref uses `query.bibliographic`, `rows`, `offset`, publication-date filters, and selected
  metadata fields. Crossref documents public access without registration and deprecates
  `query.title` in favor of `query.bibliographic`.
- arXiv uses the Atom query API with `start`, `max_results`, relevance sorting, and an optional
  submitted-date range. Every meaningful query term is required (`all:a AND all:b`, quoted
  phrases stay phrases); sending a whole sentence as one exact phrase matched almost nothing. oh-my-paper makes one arXiv request per explicit search action; clients
  should avoid rapidly repeating page requests because arXiv asks callers to pace consecutive
  requests.
- OpenAlex uses `search.semantic` (embedding search over titles and abstracts, at most 50
  results) for the first page, because keyless keyword `search` is paused under load. Later pages
  use keyword `search`. Abstracts are rebuilt from `abstract_inverted_index`. Set
  `OH_MY_PAPER_OPENALEX_API_KEY` (a free key) to raise the limits.

Primary references:

- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [Crossref REST API documentation repository](https://github.com/CrossRef/rest-api-doc)
- [arXiv API user manual](https://github.com/arXiv/arxiv-docs/blob/develop/source/help/api/user-manual.md)
- [OpenAlex authentication and limits](https://help.openalex.org/api/authentication/)

## Integration boundary

Root wiring is intentionally separate. Main integration should:

1. Call `registerScholarlyIpc({ knowledge: store.repository })` and dispose its returned cleanup.
2. Expose `createDiscoveryPreload()` as the `discovery` field of the root preload API.
3. Render `SearchView` with that API. Pass the existing safe external-link callback through
   `onOpenExternal`; the component never navigates directly.

The search IPC keys active abort controllers by renderer and job ID. A cancel request can only
cancel a job owned by the same renderer, and cleanup aborts all remaining jobs. Metadata save is
an explicit second action with an in-UI confirmation. It reuses the existing knowledge
repository `createNode`, keeps DOI/arXiv/OpenAlex identities as exact aliases and metadata, and
returns an existing paper when an identifier matches. Saved nodes have an empty body and
`fullTextReviewed: false`; no PDF is fetched or imported.

The existing single-citation service keeps its found/not-found response shape. Provider HTTP,
transport, and malformed-response failures are now retained in `CitationLookupProvidersError`
instead of being converted to `not_found`, so the negative cache cannot persist a provider
outage as a confirmed absence. A later provider may still return a valid match after an earlier
provider fails.

## Research agent discovery

The `리서치` agent (`src/electron/agentService.ts`) uses free sources only and never a paid search
API:

- Discovery: OpenAlex semantic search for the planner's English description, plus, for each
  planned keyword query, arXiv, Semantic Scholar, OpenAlex keyword search (`search=`, which
  matches an exact name such as a new paper's acronym where embedding search cannot) and
  DataCite restricted to arXiv's registrant (`client-id=arxiv.content`), which indexes every
  arXiv DOI with its title, authors and abstract within hours of submission and is not subject
  to the arXiv API's rate limit (`src/electron/paperDiscoverySources.ts`).
- Web search (optional, off by default): set `OH_MY_PAPER_SEARXNG_URL` to a SearXNG instance
  (open-source metasearch) whose `search.formats` includes `json`; public instances mostly
  disable that format or challenge automated clients, so this is meant for a self-hosted one
  (`docker run -p 8080:8080 -v ./searxng:/etc/searxng searxng/searxng` with
  `search: { formats: [html, json] }` in `searxng/settings.yml`, then
  `OH_MY_PAPER_SEARXNG_URL=http://localhost:8080`). Each keyword query is also sent there
  (`categories=general,science`) and its hits become paper records: arXiv ids and DOIs are
  extracted from result URLs and resolved through one OpenAlex `filter=doi:` request, arXiv
  papers OpenAlex has not indexed yet are read from their abstract page, and remaining page
  titles are matched against OpenAlex keyword search. Hits that resolve to no record are
  dropped. No keyless general web search survives automation (DuckDuckGo's HTML endpoints
  answer automated clients with a bot challenge; Jina and Brave require keys), so nothing is
  queried without this setting.
- Web fallback (automatic in Claude subscription mode): when the first round's screening finds
  fewer than two relevant papers, the request is searched once through the Claude Code CLI's
  WebSearch tool (`--tools WebSearch --allowedTools WebSearch`, structured output, low effort,
  at most eight turns) on the user's own login, and the hits are resolved to records exactly like
  SearXNG hits. The trace shows it as 보조 검색 with the extra screening it triggers. One call is
  an agentic turn of roughly half a minute, so it never runs when the indices already suffice.
  Codex and API modes have no fallback unless SearXNG is configured.
- Expansion (deep mode): Semantic Scholar recommendations, references and citations of the best
  papers so far; OpenAlex `cites:` when only an OpenAlex id is known.
- Pacing is shared per host (`src/electron/paperSourceHttp.ts`): the arXiv API one request at a
  time at least 3.1 s apart (arxiv.org abstract pages have their own 3.1 s serial pacer),
  OpenAlex, Semantic Scholar, DataCite and the web engine 1.1 s apart. A 429/502/503/504 is
  retried once (twice with a key) after `Retry-After` (capped at 6 s). A source that stays
  rate-limited rests for a 20 s cool-down (or its `Retry-After`, if longer) before the run tries
  it again; the trace shows the rate limit, and a row on which every source was resting says so
  instead of showing an empty failure.
- Keyless Semantic Scholar keyword search shares a public pool that is often throttled; set
  `OH_MY_PAPER_S2_API_KEY` (a free key) to use it reliably. Recommendations and reference lookups
  generally work without a key. The arXiv API also answers 429 for minutes at a time; the
  OpenAlex keyword and DataCite sources keep exact-name lookups working while it does.
- Quick mode: one round, about 30 screened candidates, up to 8 papers. Deep mode: up to three
  rounds within a four-minute search budget, up to 20 papers, then a structured report. Each turn
  makes one planner call, one screening call per round, and one answer call to the configured AI
  mode.

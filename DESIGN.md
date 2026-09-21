# Scourgify interaction and visual contract

## 2026-09-15 Browser-first paper reading (current)

This section supersedes the expanded desktop navigation below for the browser
product.
Keep Scourgify's leaf identity, bundled typography, neutral surface and focus tokens.
The product is a paper library and continuous PDF reader, with context-aware AI
beside the source. Library recommendations remain in scope; general knowledge
graphs, comparison/project boards and agent memory are outside the browser shell.

Navigation has Library and Reader, with paper recommendations reached from Library.
Use the existing LibraryHome list/preview and ReaderWorkspace/PDF primitives.
The reader retains its compact document/outline/select/pan/undo/zoom toolbar,
continuous pages, page-adjacent translation, source-linked cards and collapsible
research sidebar. Avoid duplicate headers and settings for disconnected services.

The ten reference families are Translation, AI Chat, Explanation, Citation, Summary,
Preview, Library, Scholar Deep Search, Auto Highlight and Markup. Each needs real
behavior and persistence where applicable. Empty, loading, saving, error, cancelled
and unavailable states must be explicit and actionable. No generated demo data.

The local browser runtime has a blocking first-run credential gate. Library and reader
content stay hidden until the user has saved both a personal OpenRouter API key and a
personal Mistral OCR API key. The same gate selects the OpenRouter model. Credentials
remain in the local data directory and generated OCR, translations and paper insights
reuse their existing persistent caches; source distributions contain no user keys.

Primary persona: Korean researcher reading English papers and checking their source.
Keyboard-only and enlarged-text users must reach import, search, reading, source
return and settings. Existing semantic colors, 4/8/12/16/24 spacing, bundled font
selection and 50–200% text scale remain the design system; PDF text is untouched.
Each panel owns its scrolling, controls wrap before clipping, and narrow viewports
collapse secondary panels while preserving access to their content. Verify actual
screens at 375/768/1280px and a normal desktop, both themes and enlarged text.

This is an existing-product conversion; use current components and installed test
tooling. No new dev-tool dependencies are needed. Reference fidelity concerns the
reader interaction and quality; copying another product's logo is not authorized.
There is no accepted functional or accessibility debt at completion.

## 2026-09-10 Consistent sizing across every workspace

The user requested one consistent design across all tabs, with no overflowing labels or mismatched boxes. Preserve the existing neutral research workspace, leaf branding, shared records and reader behavior. Apply the existing title/body/compact/toolbar typography and spacing tokens consistently to Library, Search, Knowledge, Connections, Reader, Compare, Project, Memory and their settings/dialogs.

Controls grow with their text. Flexible rows and grids must shrink or stack before labels, selected values or actions collide. Korean words wrap as words; long unbroken identifiers and URLs may break within bounded content. Fixed-height controls must not clip 50–200% text. Keep deliberate PDF/graph pan areas and table scrolling, while preventing accidental horizontal overflow of the application, forms and navigation. All actions remain reachable in a 920×640 window, using internal scrolling where needed.

Acceptance uses synthetic populated workspaces, every tab in both themes, normal and enlarged text at desktop/narrow widths, and 50% text. Compare current screenshots and element bounds; verify settings scrolling, source return and saved note reopen. No new dependencies or replacement component framework are needed.

## 2026-09-10 Internal Mistral OCR configuration

The user reverted the subscription OCR experiment. Desktop document OCR uses the existing Mistral parser with `MISTRAL_API_KEY` supplied through the main process environment. Source development loads an uncommitted `.env`; installed apps load the local app-data `.env`. Never bundle the key in renderer code or distribute it inside the application. Hide the desktop Mistral key form and provider-specific setup instructions.

An explicit page translation uses configured Mistral structure extraction before translating, retaining existing block types, table/equation content, source geometry and document cache. Reading/importing a PDF still performs only local preparation. A missing key is an internal setup gap, not evidence that OCR is available. Existing ChatGPT chat/translation login and local-only writing suggestions remain separate.

## 2026-09-08 Explicit local owner access (current)

The Knowledge list is a continuous 200px side panel aligned directly below shared navigation, matching Library density. Remove the floating rounded-card frame and outer gutters. Use one quiet 13px title, compact labelled create/collapse icon buttons, aligned full-width search and kind controls, and document rows with understated dividers. Do not duplicate filter icons or use a large dark create button in this narrow panel. The user requested no repeated app launches during QA: complete non-window checks first, then inspect the final installed Knowledge panel once in one app session.

The user approved login-free use on this Mac. A main-process profile file explicitly selects local owner access; its absence keeps the existing Google-required behavior. Local access is a separate `local` state, not a fake authenticated Google session or remote administrator role. It opens the current collection without rebinding ownership or creating another document store. Saved notes, PDFs and source links remain in their existing locations. Existing main-process sender/input validation remains mandatory.

Show `이 Mac · 로컬` in the shared account area and omit the inapplicable logout action. Library, Reader and Knowledge remain immediately available after startup, including without network or account-service settings. AI/provider setup remains separately available through Settings and never runs automatically. Do not claim Google is connected in local mode; the existing Google flow remains available to account-managed profiles and its unconfigured state is not promoted to a pass. Reopen persistence and real installed-app workspace entry, not a dismissed help dialog, are the acceptance boundary.

## 2026-09-08 Stable navigation and explicit reader context (current)

Every workspace, including the PDF reader, keeps the same global top navigation, labels, order and secondary menu. The `리더` destination denotes the retained reading workspace; it does not select a different paper or claim to be a recent-paper list. The library's title-and-page `이어서 읽기` remains the explicit resume action.

The secondary `더 보기` and `설정` controls travel together as a compact group when global navigation wraps, so Settings never becomes an isolated extra row. At large text or narrow widths, the document selector takes its own full row. Minimap legend labels wrap by whole label, not individual Korean syllables.

Changing document identity resets transient selection, sidebar and retrieval state. Outline and citation indexes are owned by their document and cannot be displayed or acted on under another document while it loads. Memory marks its secondary-menu destination and trigger as current.

The reader uses the shared brand/account header and navigation. A separate compact toolbar below shows a labelled `읽는 논문` selector containing the actual active document title, followed by outline, selection/pan, undo/redo, zoom and explicit translation controls. Changing the selector uses the same document-opening path as Library and restores that document's saved page. With no document, show an honest empty reader and import action; do not select a random or first paper. Global destinations never move to a left icon rail. Only the document outline may occupy the left side. Reading tools wrap at large text/narrow widths; PDF content, source geometry and evidence return remain intact.

This supersedes the historical reader-only 56px global rail and replacement header. Reuse the existing 64px desktop global chrome, two-row narrow/large-text global navigation, tokens and reader controls. Validate identical global menu bounds before/after entering the reader, explicit document switching, empty state, source return, per-document reopen, and light/dark/narrow/50–200% text.

## 2026-09-08 Paper exploration and content-first refinement (current)

Paper graph node colors encode references (muted blue #3b88b0), cited-by (teal #31968f), and related papers (purple #9a73af), with a text legend. The seed remains outlined. Citation coordinates use a visibly labelled log scale and small collision offsets; arrowheads end outside the paper marks.

At 150–200% text, research navigation wraps in a dedicated lower header area, with the brand and account above it. The graph inspector grows to 480px on wide windows; source, save and exploration actions share a persistent footer while article text scrolls independently. Short windows may scroll the footer itself rather than cut off controls. Narrow windows retain the stacked graph and inspector.

The explicit rejection of generic generated UI supersede the decorative treatment of the previous checkpoint. This is a functional paper exploration requirement, not just graph styling. Preserve Scourgify branding, local records and all existing reader/knowledge tools.

- Research graph: a large left graph stage with a 320–360px right article inspector. Circular paper marks, author/year labels, visible selected paper, highlighted incident edges and quiet unrelated nodes. Citation and semantic-related edges are distinct. References and cited-by expand actual external scholarly metadata after an explicit user action; related results identify the provider/method. Do not call title search similarity, fabricate citations or invent counts.
- A year/citation layout uses observed metadata, with unknown values visibly identified; no invented timeline. Directed citation edges mean source cites target. References, cited-by, related exploration, back/forward, selection, zoom, pan, fit and graph/list modes must be usable. History is bounded and restored without another network request; abandoned requests are cancelled or ignored by generation.
- Graph selection opens an in-place inspector containing actual title, authors, year, available abstract and source link. Saving reuses the existing discovery-to-knowledge path. External results are not silently imported PDFs or scientifically accepted user relations. The local knowledge graph remains a shared-record view, clearly distinguished from external paper discovery.
- Typography/surfaces: honor the bundled user-selected font, 14px body, 13px controls, 12px metadata, 18px view title and 24px brand scaled with existing appearance preferences. Base canvas #f5f6f8, surface #ffffff, ink #202326, muted #62676e; retain dark equivalents and semantic action/focus tokens. Quiet lilac/mint wash may remain where it does not compete with content. Panel radius 8px and control radius 6px; graph nodes alone are circular. Use the existing 4/8/12/16/24 spacing scale. Main top chrome 64px; narrow two-row navigation remains 112px.
- Library: a compact context heading, search and import action lead directly to a continuous document list. Resume reading is a small strip, not a hero card. List rows target roughly 88px at 100% text, grow for long titles or accessibility scaling, and use separators rather than separate framed cards. Compact thumbnails, consistent title/author/year hierarchy and one primary reading action per selection. Selection previews; explicit reading opens. All document kinds remain available through a folded filter instead of many empty categories. Collections retain 200px/176px widths and collapse; reader keeps the 56px rail.
- Latest header feedback: compact 22px/600 wordmark with a 30px raster leaf aligned on one baseline; reserve the existing native window-control area. Native traffic lights use a 12px left and 24px top inset to align with the 64px chrome. Sidebar has one quiet 13px `보관함` heading, no `탐색`/`빠른 보기` eyebrows, and the main heading names the current collection/filter rather than repeating `라이브러리`. Keep native window controls and app identity intact. Main content and sidebar header align within the same compact rhythm.
- Knowledge/Compare/Project: the same restrained typography, toolbar/control hierarchy and neutral surfaces; writing content is the main column, optional properties/relations use progressive disclosure. Do not hide data loss, errors, missing evidence or pending changes to obtain a cleaner screenshot. Reader source geometry and continuous scrolling remain unchanged by surface restyling.
- Acceptance: real public scholarly API verification plus deterministic bounded/error/cancellation tests; fresh Electron flows for graph expansion, neighbor selection, back/forward, save, source opening, library filters/collections, reading/notes persistence. Check all major views in both themes, narrow window and text scaling. Report public API behavior separately from fixtures and live OAuth/AI inference.


## 2026-09-08 Non-reader screen layout revision (current)

This revision supersedes the earlier labelled-rail layout for non-reader screens. Use a clear information hierarchy and panel proportions using Scourgify branding and real local records. The reference is an interaction/layout target, not permission to fabricate article metadata or citation networks.

- Research flow: top navigation for discovery, library, notes, connections and projects; selection previews an item in place, explicit actions open its PDF or note. The continuous PDF reader retains its working toolbar and navigation. Library collection/list context and exploration history must survive inspection.
- Layout at 1440px: 72px top chrome; 20–24px outer padding; 200px collection/list sidebar (reduced by the user's latest explicit feedback); flexible primary canvas; roughly 320px selected-record inspector. Collection and graph lists can collapse; the retained reader rail is a 56px icon rail with accessible names/tooltips. Use 12px panel radius, white panel surfaces, subtle borders, 36px minimum controls, and compact 4/8/12/16/24px spacing. At narrow widths panels reflow or scroll within their own bounded area; no clipped controls. Text scaling remains 50–200%.
- Tokens: light canvas #f1f2f6, subtle lilac #efedf6 and mint #eaf4f2 atmospheric wash; surface #ffffff; muted surface #f5f6f8; ink #202326; muted ink #62676e; border #dce0e4; primary action #202725; green selection #e3eee8; focus #35765b. Dark equivalents use canvas #181b20, surface #22262d, muted #2a3038, ink #eef0f3, muted ink #b7bfc8, border #3d4651 and high-contrast pale-green actions. Use shared token variables, not decorative per-card colors.
- Typography: existing bundled user-selected font; body 14px, compact 12px, controls 13px, section title 18px, brand 24px, scaled by existing appearance variables. Korean words remain intact where needed; long document titles wrap, never push panes beyond the viewport.
- Graph: actual shared relations only, review state visible, graph/list alternatives, root history, pointer pan, zoom and fit. Selecting a node updates the inspector without leaving the graph. Every node can be reached; viewport transforms must not create inaccessible clipped neighbors. Unknown year/citation count is not an invented timeline axis.
- Library: document preview with explicit reading action; real saved collections only if backed by existing persistence. Document-kind filters remain labelled as filters. No browser storage duplicating repository metadata.
- Compact layout: at 1000px and below, the header uses two rows (112px total) so the brand and navigation do not overlap. Library lists narrow to 176px and the inspector reflows below the main list. Collection creation uses an inline labelled form. Completed import jobs collapse to a short summary; active jobs and failures stay visible. Visited research views preserve their current selection and draft while shared collections refresh on return.
- Reading/notes: preserve selection explanation/translation and page-adjacent translation through existing explicit-consent actions. Preserve canonical folder Markdown, backlinks and exact PDF source returns. Do not claim plugin compatibility with other Markdown editors.
- Project and graph body previews render readable Markdown and show wiki-link aliases instead of internal identifiers; the canonical note source remains unchanged. Source jumps center the selected passage within the available reader viewport rather than using card placement offsets.
- Accessibility and persona: a Korean researcher can find a paper, inspect relationships, return to its source, and save/reopen a linked note by keyboard or pointer. Focus indicators, loading/empty/error states and reversible edits are required. Hover/selection changes use existing short transitions; no decorative animation.
- Verification: current Electron captures at desktop and narrow sizes, both themes, appearance scaling, synthetic import, graph exploration and fit, preview-to-reader, and note/source persistence. Live OAuth/provider inference remain separately unverified until configured. Existing Electron dependencies are the accepted runtime tooling; do not install unrelated web/SEO instrumentation for this desktop change.


## 2026-09-08 six-screen reference implementation

The user approved implementation from the six generated desktop concepts: Library, Reader, Knowledge, Connections, Compare and Project. These are layout references, not production data or evidence of working features. Preserve the approved leaf logo and existing semantic palette; do not reproduce generated text mistakes, fabricated papers, source quotes or decorative accent rails. Reuse existing controls and records rather than introducing competing stores.

- Shared navigation: a separately identifiable Library home followed by the five labelled destinations 읽기, 지식, 연결, 비교, 프로젝트. Current location is explicit; search, memory, interchange and AI proposal tools remain reachable as secondary utilities. At normal desktop size use an approximately 88px labelled rail and 220–260px secondary list panes; at high text scale or narrow windows allow bounded scrolling and readable compact navigation without clipping controls.
- Library: a working import action, collection navigation, retained recent reading position, local PDF thumbnails and paper cards. The continue-reading item is backed by actual reader state. Empty or unavailable files have actionable honest states.
- Reader: preserve the existing continuous PDF board, selection, source tools, fixed navigation and page-adjacent translations. Do not replace the board with a static page or side-panel-only translation.
- Knowledge: search/list, a continuous opaque note writing column and evidence/backlinks. Compare: selectable records, condition rows, explicit unknowns and source return. Connections: labelled relationships, list alternative, selected-record detail and distinct proposals. Project: actual shared records and removable placements, with no fabricated experiments or results.
- Persona and acceptance: a Korean-speaking researcher moving from PDF to note to comparison/graph and back. Keyboard focus, empty/loading/error/save/conflict states, dark/light, 50/100/200% text and narrow settings remain required. Existing Electron tests and disposable-profile native interaction are the acceptance harness; no extra dev dependencies or mobile/web replacement are introduced.
- Settings uses the native modal dialog lifecycle: focus enters the dialog, background controls are inert, Tab stays inside, Escape closes it, and focus returns to the opener. Keep the existing scrolling settings layout and appearance inheritance.
- Project keeps its existing evidence-transfer tool in an expandable bottom section, leaving the board available at full width when the tool is closed.
- Navigation stacks each icon above its Korean label. `--navigation-rail-width` is at least 88px and grows with the compact text size so labels remain whole at 200%; secondary action labels wrap only between words.
- Knowledge prioritizes writing: group formatting and view controls in a compact toolbar, reduce empty vertical gaps, and disclose relation creation on demand. Draft-preservation guidance is a quiet status message with no generic retry action. Graph, Compare and Project stack their heading above content in a column shell.


This is the current contract, replacing the conflicting historical specifications archived under `.omo/plans/archive/pre-direct-2026-09-05/`. It describes intended behavior; implementation status belongs in the active plan and QA report.

## 1. What the product is

Read a paper, keep the original passage with your interpretation, connect it to a concept or research question, and later trace a hypothesis or result back to that evidence. Existing reading functions stay intact. A graph is a useful view, not the product's purpose.

Use plain labels: `라이브러리`, `읽기`, `지식`, `연결`, `비교`, `프로젝트`, `설정`. Describe actual actions and errors. Avoid slogans such as “연구 문서를 위한 개인 라이브러리”, implementation-provider marketing, fake metrics, or decorative AI badges.

## 2. Visual direction

Quiet, legible desktop research software. Natural green identity with restrained warmth, not a gold/ivory dashboard. No blue brand accents, repeating dot grid, gradients behind controls, oversized pills, excessive nested cards, or ambient motion inside the reader. Do not copy Anthropic/Apple layouts or logos.

Latest reference grammar: use the reference's alignment, crisp hierarchy, near-neutral palette, and spacious layout as inspiration for Scourgify's own natural-green system. Keep accents sparse and purposeful; this is not a clone, and the approved leaf mark, bundled readable fonts, and restrained glass navigation remain Scourgify-specific.

Approved branding: `assets/branding/scourgify-leaf-mark.png`. Render the full raster with `object-fit: contain`, stable aspect ratio and clear padding. Never crop the leaf inside a wordmark viewport. The optional onboarding scene is `assets/branding/scourgify-onboarding-golden-leaves-v1.jpg`; do not load it in normal reading views.

### Accent treatment prohibition

Alerts, cards, callouts, and selected-card treatments must not use decorative or status-colored vertical accents: no `border-left`/`border-inline-start` rails, inset box-shadows, or `::before` pseudo-element rails. Communicate state with readable text and icons, plus a neutral uniform boundary or a subtle whole-surface treatment. Only actual Markdown blockquotes, structural split-pane separators, and authored PDF content are exempt.

AI-generated and research-draft notices are neutral inline text only. They must not become a colored left rail, callout, or authored Markdown quote.

### Semantic palette

| Token | Light | Dark |
| --- | --- | --- |
| canvas | `#F4F5F2` | `#151C18` |
| surface | `#FFFFFF` | `#1D2721` |
| surface-muted | `#ECEFEA` | `#263229` |
| ink | `#17251F` | `#EDF2EC` |
| ink-muted | `#556259` | `#B0BCB1` |
| line | `#D6DDD5` | `#3B493E` |
| action | `#285644` | `#9BCCAB` |
| action-hover | `#1D4435` | `#B9DEC4` |
| focus | `#9B772E` | `#DABB77` |
| action-subtle | `#E3EDE5` | `#30483A` |
| note | `#F5EDD6` | `#403B2A` |
| warning | `#88651F` | `#DABB77` |
| error | `#A04335` | `#F0A393` |

Original photographic samples remain reference colors, not mandatory control colors: forest `#040F0F`, evergreen `#0C1E20`, moss `#394134`, haze `#716745`, bronze `#A18242`, amber `#AD7015`, leaf gold `#EFC245`, light `#FFE398`. Reserve warm accents for focused evidence, warnings and notes. State also needs text/icon, not color alone. Keep the PDF's authored colors unchanged.

### Type and density

- Default Wanted Sans; selectable bundled Wanted Sans, Pretendard, SUIT, Geist + Wanted Sans Korean fallback, and system font. No font CDN. Show each family in a visible labelled specimen.
- Font specimens always stack the family label above the full-width preview, independent of window width. The text-scale row may wrap within its panel; reserve intrinsic width for the percentage value at 200% rather than clipping it or reducing text size.
- Title 24px, section 16px, body 14px, metadata 12px at 100%; use the existing semantic scale for toolbar variants. Prefer restrained medium weights, no decorative serif UI.
- User text scale 50–200%, 5% steps, presets 50/75/100/125/150/175/200. No duplicate “100% 초기화” button. Warn that values below 90% are small without blocking the preference.
- Text scale does not scale PDF pages or shrink hit targets. Controls expand/wrap at 200%, never clip or hide actions. Minimum desktop target 32px; touch target 44px.
- Specimens: `읽은 것은 남고, 필요한 것은 다시 찾을 수 있어야 합니다.` / `What we read should remain, and what we need should be easy to find again.`
- Gaps 4/8/12/16/24/32px; 1px hairlines. Radius tiers: 8px inset fields, 12px controls, 18px content cards, 24px floating panels/dialogs; inner radii follow outer radius minus padding. Use progressive `corner-shape: squircle` where supported, with ordinary rounded corners as a safe fallback. Do not round the PDF page itself. Keep content grouped by spacing rather than boxed everywhere.

### Glass chrome, 2026-09-06

The user requested Apple-inspired material and geometry, not a clone. Apply glass to navigation, floating tool groups and dialogs; paper, note prose, tables and graph labels retain opaque reading surfaces. Source: [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials) and the frontend Apple/redesign references. Do not copy Apple's blue accents, logos, copy or proprietary font files.

Reusable glass recipe: light `rgba(250,252,249,.88)`, dark `rgba(27,38,31,.90)`; 20px background blur with 120% saturation; inset top rim light `rgba(255,255,255,.78)` / dark `rgba(255,255,255,.12)`; outer green-black shadow `0 8px 28px rgba(13,31,22,.10)` / dark `.25`. Quiet floating elevation uses `0 2px 8px rgba(13,31,22,.06)`. No animated blur, full-window blur, fake lens distortion, glitter or moving background.

Normal/hover/focus/pressed/disabled states reuse semantic action/line/focus tokens. `prefers-reduced-transparency`, increased contrast and unsupported backdrop filtering use opaque surfaces and solid borders. Reduced motion retains content and focus without transform transitions. Never require transparency to identify an action.

The topbar, left rail, right navigation rails, minimap, source tools, popovers, and dialogs share this chrome recipe. PDF pages, note prose, tables, graph labels, board cards, metadata panes, and research content remain opaque so translucency never reduces reading contrast. Workspace typography is driven by the persisted local font family and 50–200% text scale custom properties; the PDF document itself is never restyled.

Shared state harness and final QA must include long Korean/English titles, keyboard focus, saving/conflict/error, empty list, light/dark, 50/100/200% scale and narrow panes. Reading body uses 1.6 line height and at most 72ch; navigation keeps compact 1.4 leading, 500/600 weights and tabular numbers. Keep bundled font choices with real specimens; no extra font downloads or dev-tool dependencies for this redesign.

## 3. Navigation and reading

- Returning from a graph, comparison or note evidence link verifies the immutable PDF hash, brings the anchored region into view and marks it with the existing source highlight. A small dismissible source-return notice identifies the page. Anchors without geometry open the page and explicitly say that the exact region is unavailable; never invent a highlight. This navigation neither creates a card nor starts AI.

- Library is the default launch view, with local first-page previews, search, plain import control and retained recent position. A paper card opens the existing reader, not a replacement viewer.
- Fixed top toolbar and compact left rail. The five destinations remain reachable. Library remains a separate home action. Long titles truncate only in navigation, not in content/editors.
- Reader retains continuous vertically aligned PDF pages and spatial cards on either side; paper and cards pan/zoom together. Toolbar, outline and metadata rail remain fixed.
- Preserve hand/select/note tools, undo/redo, zoom/fit, minimap, outline, highlights, selection actions, figure/table/equation actions, citations, discussion, and source return.
- Page translation belongs next to its source page and follows its position/zoom. It never replaces the research sidebar. Show completed batches while later batches stream; cancellation stops pending work; auth/limits require user recovery, not blind retries.
- Translation reading has three explicit modes in the page translation surface: `원문` keeps the PDF as the only reading column, `대조` places the source and Korean page blocks in parallel columns, and `함께 읽기` repeats each source paragraph immediately before its translation. Mode changes reuse the same parsed blocks, cache and AI job, so switching modes never starts another request.
- Every translation block keeps its parsed block ID and source bounds. Hover, focus or keyboard activation on either side highlights the source region; selecting a translated paragraph exposes the same source anchor used by notes, highlights and explanations. Headings, lists, equations, tables and figure captions keep their source order, with equations rendered as math rather than plain text.
- Figure blocks reuse one crop of the original PDF region and keep the source jump; the bilingual view does not redraw the same figure as a second translated copy. If a crop cannot be prepared, the control remains an honest source-return action.
- The page surface owns a bounded scroll region. Controls wrap at narrow widths and 50–200% text; parallel columns stack only when the viewport cannot preserve readable line lengths. A document action can translate all pages with a visible page/block progress, resume completed cache entries, and cancel without discarding completed pages. PDF export uses the browser print dialog and an explicit print layout label until a verified direct exporter exists.
- Import, opening settings, opening a PDF, and scrolling to a new document do not trigger AI/OCR. A deliberate automatic-translation toggle may process pages only within that document; reset consent on switching documents.
- Research rail: expand or first mode activation opens transiently; activating the same open mode again pins it until explicit collapse. Selecting another mode opens that mode transiently. Pointer leave dismisses only unpinned content; hover/keyboard focus alone never pins. Collapse clears local pin state. Pin activation does not repeat translation toggles or sticky-tool actions; translation remains page-adjacent. Keep existing geometry, tokens and motion; expose expanded and pinned state accessibly.
- Each scroll region owns its scrolling: settings content and sidebar/card bodies have bounded heights and `min-height: 0`; their wheel events do not pan the board. At 920×640 all settings actions remain reachable at 200% text.
- Local preparation status appears only for current jobs. Completed rows disappear shortly; errors remain actionable. Never restore old completed documents as a live queue.

## 4. One knowledge model, five views

Identity/content, relationships, source evidence and placement are separate records. A node edited from any view changes everywhere. Paper identity differs from PDF version; versioned anchors never drift to a similar title or a replacement file.

### Knowledge

Search title/body and Korean/English aliases. Create/edit paper, concept, note, claim, evidence, question, hypothesis, experiment and project records. Stable `[[id|label]]` links have autocomplete and click-through; renaming a node does not break links. Show incoming and outgoing links and distinguish draft edits, saving, saved, conflict and failure. Do not silently discard edits on selection changes.

Live note editing uses one Markdown source and undo history. Source/live toggles preserve text and selection; image/table/math controls remain ordinary compact buttons. Selecting a passage exposes a bounded `선택한 구절 연결` action with its target and quote visible before saving. Empty selection disables the action. Saving and linking report failures without dismissing the buffer; stale external edits never overwrite silently. Stored note-fragment quotes appear alongside PDF evidence in relations; missing or ambiguous text is labelled `연결 위치 확인 필요`, not replaced with a guessed match.

The note editor is a document-first writing surface: one opaque, borderless title field and one continuous 720–800px writing canvas share the note's reading column. Aliases and stored properties are folded under `세부 정보`; relations and backlinks remain available under a folded `연결 및 백링크` section instead of competing with the prose. Insert tools stay compact and appear on demand; the default surface contains no canned writing suggestions. Notes use an honest pending-save fallback rather than background autosave: `⌘S`/`Ctrl+S` and the visible save action submit the current body with `expectedBody`, while conflict or writer-lock recovery keeps the buffer in place and explains the next action.

From a selected PDF passage or existing grounded reader card, `지식으로 연결` chooses an existing concept/question/hypothesis or creates one. Repeated use from two PDFs must link to one identity. Preserve the exact quote, hash, page and available source ranges. A sticky note is not fabricated PDF evidence. Source return opens the matching imported file and page; unavailable versions show an explanation, never jump to the wrong file.

### Graph

Start around a selected node, bounded by visible node/edge limits. Citation/concept/research and review-state filters operate on the same store. Show actual edges and labels plus a keyboard-accessible list. Nodes open the knowledge record; evidence opens its source. Show truncation honestly. A force simulation or a new graph dependency is not required for a useful neighbourhood view.

### Compare

Select records and inspect actual source-linked task, data split, model, tools, budget and metric conditions. Unknown means `확인되지 않음`; do not invent summaries, scores, claims of superiority or globally novel research gaps. Follow source links. Distinguish metadata-only literature from read full text.

### Project

Create/select named boards; place existing shared nodes, move them spatially, and remove placements independently of node deletion. The same node can appear on multiple boards. Question → hypothesis → experiment uses typed relations and stores code commit, data/evaluation configuration, metrics and bounded failure categories. No patient-level prompts/results are silently ingested.

### Relations and AI review

### Search and research workspace

Keep academic metadata search and evidence research in a labelled two-mode navigation within Search. Local research sources are opt-in, selected from named records (maximum 20), never implicitly the whole library. Display the count, removable selection chips, and the excerpt limit before the scope preview. Loading titles is local-only; AI and external search still require preview and explicit start. Reuse surface, spacing, focus and field-radius tokens; no decorative dashboard panels.

Relations include cites/discusses/interprets/supported_by/motivates/tests/refutes/relates_to. Show creator and provenance, evidence, and proposed/accepted/rejected/needs-review states. `supported_by` is a recorded assessment, not certification of truth.

An explicit AI proposal action displays its scope before sending selected evidence/records through the configured provider. Results remain proposed and can be accepted/rejected individually. No on-mount calls, automatic merges, paid fallback, or fabricated source IDs. Keep user-written notes distinct from AI output.

## 5. Interchange and configuration

- Data recovery lists only the signed-in account's interrupted drafts. Preview is read-only; restoring creates a new standalone note and never silently overwrites its original. Keep the recovery copy available and clearly label the new note. Normal note history remains a separate revision-aware restore action.

- Markdown exports carry stable IDs, aliases, document versions, evidence, relations and provenance. Import previews conflicts; explicit commit revalidates and is atomic. Do not overwrite existing notes silently.
- JSON Canvas carries layout and visual edges; a sidecar carries Scourgify semantics. Explain the pair, missing-node constraints and partial-save failures. A Canvas-only import is not claimed to preserve PDF anchors.
- Native bibliography management preserves imported legacy IDs and reviewed identifier matches; no Zotero application connector or automatic synchronization. Metadata-only records remain labelled until their full text is actually read.
- Experiment JSONL accepts bounded aggregate records with code/data/evaluation versions. Optional Inspect conversion uses the official log reader header mode, not execution of imported code or raw patient traces.
- API and ChatGPT subscription modes are visibly distinct. Local OpenCodex remains an API-compatible local proxy option. Credentials stay main-process-only. Display actual connection state, cancellation, expiry/error and unknown usage honestly.
- Settings separates app account, AI connections and reading/general preferences. Google app login is required with the approved seven-day bounded offline policy; it is not provider authorization. Modal body scrolls; close and navigation remain accessible. No shared API key, automatic sync or document upload to the account service.
- Subscription connection offers browser login and device-code login, a cancellable pending state, account plan and available usage windows. Pending authorization never displays as connected. Failures remain visible until retried. Login/logout refresh the application's provider state; no background inference or API fallback.
- `데이터 가져오기·내보내기` is a rail action opening the existing bounded settings-style dialog. Format, destination and selected record precede file selection. Previews show counts, titles and conflicts; invalid previews cannot commit. A successful commit consumes its preview. Canvas export explicitly saves two companion files and reports a cancelled second save.
- `AI 연결 제안` opens a bounded dialog with a searchable node checklist (2–12 records), visible source-scope notice, explicit generate/cancel controls and individual accept/reject decisions with source-return buttons. Proposed is never styled as accepted. Use existing settings and knowledge primitives, no new palette.
- Note images use collection-owned raster assets only. Picker, paste and drop keep Markdown paths portable; unsupported or oversized input shows an inline error without losing the buffer. A note's `변경 이력` opens a scrollable, opaque text preview with date, current revision, explicit restore and conflict review. Restore preserves a recovery copy and must fail visibly if the current file changed. Existing modal chrome and focus rules apply.

## 6. Motion, performance and acceptance

The desktop account gate loads before the research workspace. It never flashes local documents before authentication. Expiry covers and disables the mounted workspace, preserving its editor buffers. Explicit logout, account change and window close first write pending note drafts to local recovery. Help is a native, keyboard-dismissable dialog; account-service configuration failures must explain what is unavailable without presenting a nonfunctional sign-in button.

Use short opacity/transform state transitions only; respect reduced motion. Do not animate reading content continuously. If an onboarding view is retained, use optional small scroll entrances with content visible without animation, no heavy animation framework.

Reuse PDF/thumbnail caches with bounded eviction and cancellation. Do not re-render every PDF on pointer samples or re-query document status when idle. Optimize measured work, not just bundle numbers.

Verify the actual current Electron build with synthetic PDFs: library/import, complete reader controls, two PDFs to one concept and back, persistent edit/backlinks, graph filters, honest comparison, multi-board placement, reviewed import/export, failure/cancel states, settings at 50/100/200%, dark/light and narrow windows. The old Hotebook mockup remains a feature-continuity reference only; its old palette and historical screenshots are not the current design or acceptance evidence.

## 9. Document Preparation and Enrichment

Keep `SourceDocumentAst` (immutable source), `SemanticDocumentAst` (derived interpretation) and `RenderedDocumentGeometry` (current viewport coordinates) separate. Native text is the default; scanned or unparseable content shows an actionable warning. `AI 구조 보강` is an explicit optional action, never triggered by key configuration. Show queued/running/complete/failed/cancelled and `budget-paused` distinctly; resume only on a deliberate action. Existing movable board cards retain source anchors while derived structure is regenerated. Unknown coordinates remain missing, not fabricated 1×1 boxes.

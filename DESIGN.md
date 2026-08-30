# Scourgify Design System

## 0. Research Log

- Primary visual contract: `.omo/frontend-design/mockups/hotebook-board-cards-metadata-sidebar-v1.png` (1536×1024, SHA-256 `78b7a1281ad31775f018e885b205b8a277bdd2c901213294b1b8adec7abbbf39`).
- Interaction evidence: `.omo/evidence/hotebook-rnr-verified.md` and the preserved private Record & Replay session.
- Component references: sanitized captures under `recording-review-2026-08-26/`; prior MarginLedger implementation is explicitly not a pixel or source-code base.
- Owner corrections: continuous vertical paper column; research cards remain on the infinite board; collapsible right sidebar is metadata/index only.
- Scourgify branding assets: `assets/branding/scourgify-logo-v2.png` (app mark) and `assets/branding/scourgify-wordmark-v1.png` (topbar wordmark).
- Runtime evidence established a narrow mode rail, a roughly 300px resizable content pane, cached overview sections, page-adjacent translation, and source-proximate explanation controls.
- Computer History evidence on 2026-08-28 shows repeated paper/tab switching, zooming, card minimization, citation/GitHub hops, and new-tab word lookups. Scourgify therefore prioritizes persistent reading context, compact controls, and fast translation/explanation recovery over decorative dashboard chrome.
- Skipped: third-party brand tokens. The owner-approved layout mockup remains the interaction reference.

## 1. Atmosphere & Identity

Scourgify is a quiet spatial research desk: the paper stays crisp and central while translation, reasoning, notes, citations, and infographics accumulate around exact passages. Its signature is the provenance connector, a thin blue path that makes every board object visibly accountable to its source without turning the workspace into a dashboard.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---:|---|
| App canvas | `--canvas` | `#f8f9f7` | Infinite board and window surround |
| Dot grid | `--canvas-dot` | `#dfe3e8` | Sparse board orientation grid |
| Surface | `--surface` | `#ffffff` | PDF leaves, cards, rails |
| Surface muted | `--surface-muted` | `#f4f6f8` | Selected rows, metadata groups |
| Text primary | `--ink` | `#20242a` | Titles and body |
| Text secondary | `--ink-muted` | `#656d78` | Metadata and hints |
| Hairline | `--line` | `#e1e5ea` | Dividers and card edges |
| Action | `--action` | `#3478f6` | Selection, connectors, focus |
| Action subtle | `--action-subtle` | `#eaf2ff` | Selected source/outline states |
| Note | `--note` | `#fff1bd` | User note cards only |
| Success | `--success` | `#2b9b69` | Completed local preparation |
| Warning | `--warning` | `#b87400` | OCR/quality review states |
| Error | `--error` | `#c43d45` | Failed preparation/provider states |

Color never carries state alone. The PDF's colors are document content, not app tokens.
Scourgify follows the macOS appearance with explicit Light, Dark, and System choices. Every surface
uses semantic tokens; paper pages remain faithful white PDF content while app chrome, board canvas,
cards, rails, inputs, and overlays adapt. Native controls inherit the active `color-scheme`.

The visual language is quiet macOS utility, not an AI dashboard: neutral grouped surfaces, one-pixel
separators, restrained translucency, small monochrome symbols, and blue reserved for selection and
links. Feature identity comes from layout and content structure rather than colored icon tiles.

## 3. Typography

- UI/Korean: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`.
- Document: rendered by PDF.js; never restyled.
- Coordinates/identifiers: `"SF Mono", ui-monospace, monospace`.

| Token | Size | Weight | Line height | Usage |
|---|---:|---:|---:|---|
| `--type-title` | 18px | 650 | 1.35 | Sidebar/card titles |
| `--type-body` | 14px | 430 | 1.55 | UI and generated prose |
| `--type-compact` | 12px | 500 | 1.45 | Metadata, page/source IDs |
| `--type-toolbar` | 13px | 520 | 1.3 | Toolbar and actions |

No readable UI text is smaller than 12px. Korean, DOI, and unbroken identifiers wrap intentionally.

## 4. Spacing & Layout

Base unit: 4px. Allowed intent tokens: 4, 8, 12, 16, 20, 24, 32, 40.

- Top toolbar: 60px fixed screen region.
- Left utility rail: 48px fixed icon-only rail; every icon keeps a tooltip and accessible label.
- Outline panel: optional 240px default screen region between the utility rail and board; user-resizable from 200–420px and persisted locally.
- Research sidebar: 300px default content pane plus a 40px mode rail; user-resizable from 260–520px and persisted locally. It collapses to the 40px mode rail.
- Board viewport: remaining bounded region; owns pan/zoom gestures and never document scroll.
- Paper column: all pages share one X coordinate, ordered vertically with 12–20px gaps.
- Board world: minimum 4800×6400 logical pixels, expandable from rendered page and card extents; zoom 38–400%. Navigation bounds mirror the larger occupied side around the paper column and reserve at least 720 logical pixels on both left and right, so cards can live on either side without leaving the opposite side as a hard edge.
- Pan: two-finger/trackpad wheel and hand-tool drag. Pinch or `Ctrl`/`Meta` wheel zooms around cursor. Rendered pages and cards define a finite navigation extent with 40px screen-space outer padding, so persisted or live gestures cannot strand all content beyond an unlimited blank region.
- Cards: 280–340px default width, movable in board coordinates, never docked in metadata sidebar.
- FigJam-style post-its: 240px default width, square-cornered 4px radius, `--note` paper tone, created at the clicked board coordinate and focused for immediate editing.
- A compact bottom-right minimap shows every rendered page, board card, current page, and the live viewport rectangle. Clicking or dragging navigates immediately; `첫 페이지로` restores page 1 with 40px top padding. It is an actionable recovery surface, not a decorative overview.

The paper column and cards transform together. Toolbar, rails, and metadata sidebar remain screen-fixed.

## 5. Components

### BoardViewport
- **Structure:** grid canvas, world transform, paper column, cards, SVG connector layer, bounded-navigation controller, minimap.
- **States:** empty, preparing, ready, panning, zooming, bounded-edge, minimap-dragging, selection, restore-failed.
- **Accessibility:** keyboard pan/zoom/reset/fit; current zoom announced; motion is not required to locate content.
- **Scroll ownership:** wheel/trackpad gestures over the board pan the board; scrollable sidebar/card bodies keep their own bounded scroll. Minimap pointer and wheel events never leak into board panning.
- **Trackpad axis intent:** ordinary wheel gestures lock to their dominant axis, so vertical reading never accumulates incidental horizontal drift. `Shift` plus wheel intentionally pans horizontally. Pinch zoom remains focal-point anchored.
- **Boundary stability:** finite board bounds are applied before paint. Repeated wheel or trackpad input at the top, bottom, left, or right edge never renders an overscrolled frame and snaps back, so the paper and cards do not vibrate at navigation limits.
- **Zoom performance:** wheel/pinch updates are coalesced to at most one viewport commit per animation frame. The paper uses a temporary compositor scale during active zoom and commits the expensive PDF.js page scale only after 140ms of inactivity, so long papers do not rerender every page for every wheel delta.

### BoardMinimap
- **Structure:** 160px token-driven surface, one continuous document strip spanning the paper's real world bounds, one current-page marker, labelled card markers, and a high-contrast live viewport rectangle. Do not render every page as a bordered miniature: long papers must remain a legible document silhouette rather than a dense ladder of page lines. The header shows the page count, and a compact switch turns the minimap on or off with workspace persistence.
- **Behavior:** click or pointer-drag maps minimap coordinates into board world coordinates and recenters through the same finite navigation bounds as wheel/drag. `첫 페이지로` centers page 1 horizontally and restores 40px top padding.
- **States:** live, dragging, current-page, card-present.
- **Accessibility:** labelled navigation surface, visible `첫 페이지로` button, semantic current viewport; no information is conveyed by color alone.

### PaperColumn
- **Structure:** continuous ordered PDF leaves, page IDs, source anchor overlays.
- **States:** validating, rendering, text-indexing, ready, password, damaged, OCR-needed.
- **Behavior:** current/near pages render first; all pages retain a single vertical axis.
- **Metadata invariant:** blank or whitespace-only PDF metadata never replaces a registered non-empty document title. This keeps workspace persistence valid across re-render and app restart.
- **External links:** PDF.js annotation links and visible HTTPS text both open through Electron's validated external-link boundary in the macOS default browser. The reader never navigates away from the local PDF surface and internal PDF destinations remain in-app.
- **Link hit scope:** visible-text URL detection is leaf-scoped to the clicked PDF text span. Clicking a figure, canvas, page background, or structure affordance never searches the surrounding page for an unrelated URL.
- **Render quality:** PDF.js canvas backing stores honor the window device-pixel ratio through 200% UI scaling and ordinary paper zoom. Canvas allocation may use up to 32M pixels per visible page before PDF.js detail rendering takes over; the paper surface is aligned to physical-pixel boundaries so vector text is never softened by a fractional parent transform.

### SourceAnchor
- **Structure:** passage/object highlight, page/range identity, connector endpoint.
- **States:** exact, nearby, page-only, unresolved, selected.
- **Behavior:** never silently relocates; explicit action toolbar appears after a stable selection.

### DocumentFeatureTarget
- **Variants:** document title, section heading, subsection heading, figure, table, display equation, related-work citation.
- **States:** idle, hover-ring, action-visible, loading, explained, metadata-missing.
- **Behavior:** only those variants receive an AI mark. Headings, figures, tables, equations, and citations expose affordances only while hovered or keyboard-focused. Targets display a neutral subtle dashed outline (`--ink-muted` at 55%) on hover/focus with no blue fill. Image-bearing targets expose a copy action; equations expose a LaTeX/text copy action; inline citations open a Smart Citation preview before any AI request. If supported by DOM, a top-right close affordance is available.
- **Section affordance:** heading and subheading targets expose one compact icon immediately outside the detected text bounds. The visible control never contains a text label or covers document glyphs; its full action name remains available through the accessible label and tooltip.
- **Geometry:** figure and table bounds are the caption-column visual object above the caption, not a union of interior labels. Display equations join the math line to a right-edge equation number. Nested heading, equation, and citation marks inside a figure or table are suppressed.
- **Layout pipeline:** each document runs once through the optional local PP-DocLayout detector and caches normalized page boxes for tables, charts, images, and titles. Cached model boxes own Figure/Table geometry and are matched globally to PDF captions without reuse. PDF text/ink detection remains a bounded Web Worker fallback when the local runtime is unavailable; low-confidence or structureless pages remain unmarked rather than exposing a guessed target. This local pass performs no AI or network request after the model is installed.
- **Overlay lifecycle:** feature overlays live in a stable viewer-owned layer outside PDF.js page children, while their geometry stays page-local. PDF.js page replacement and zoom may refresh or rescale geometry but must never remove targets.
- **Zoom invariant & Cluster Layout:** Figure and Table actions sit 8px outside the detected object's nearer side with enough clear width; they never snap to a distant page edge. The cluster is stacked vertically so no chart label, table cell, or caption is obscured. When the nearer side fits 28px controls but not labelled pills, the cluster becomes icon-only and stays on that side instead of jumping across another text column. Equation actions are two icon-only controls placed entirely outside the detected math bounds; they prefer the nearest column margin and switch sides when that margin is clipped by the board viewport, so no formula glyph is obscured and the controls remain reachable. Feature outlines are 1 screen-pixel neutral dashed strokes; zoom changes enclosed PDF geometry without altering stroke weight or dash intervals.
- **Constraint:** overlays never cover target content; after the pointer corridor expires they fade in 110–120ms. Idle sparkles never appear on table cells, figure labels, axis ticks, or body prose.
- **Pointer corridor:** Figure/Table clusters include an invisible 8px bridge from the target edge to the controls. Moving from any target to its adjacent actions also keeps controls alive for a 280ms fallback; entering an action or citation popover cancels dismissal. Citation popovers open below the source line and never cover their trigger.
- **Citation hit priority:** native PDF citation links retain their yellow hover and internal destination behavior outside Scourgify controls. Where a Smart Citation button or popover overlaps the annotation rectangle, the Scourgify control owns the pointer hit and remains clickable above PDF.js annotation z-order.

### FeatureExplanationCard
- **Structure:** feature-kind label, source title/caption, grounded Korean explanation, source-jump action.
- **States:** loading, complete, failed.
- **Behavior:** image-bearing targets send only the cropped local feature image plus page caption/context after explicit click; text targets send only the detected block and minimal context.
- **Research context contract:** every AI request has four explicit evidence slots: cached paper overview, current section, local before/after text, and the exact user question or target. Existing AI paper summaries are injected when available; otherwise a locally extracted paper overview is cached by document ID and reused without a network request.
- **Figure/Table interpretation:** Figure, Table, and display-equation actions are multimodal. They send the local image crop plus full nearby caption/section prose and paper overview. Responses lead with the scientific finding or decision-relevant comparison; crop, OCR, truncation, and tool disclaimers never lead the answer and appear only as one specific `확인 필요` note when they materially affect interpretation.

### SelectionActions
- **Variants:** translate, explain, visualize, highlight, note.
- **States:** stable-selection, keyboard-shortcut, running, complete, failed.
- **Behavior:** a stable single-page text selection supports `E` (explain), `T` (translate), `I` (infographic), `H` (highlight), and `C` (comment) shortcuts; invocation clears the native selection and keeps the action local to the selected range.

### FeatureCopyAction
- **Variants:** figure image, table image, equation text/LaTeX best effort.
- **States:** idle, copying, copied, unavailable.
- **Behavior:** copy is explicit, local-only, and never sends data to the provider.

### SmartCitationCard
- **Structure:** cited-paper title, authors/year/venue, abstract summary, DOI or paper link, citation context.
- **States:** preview-loading, metadata-found, metadata-missing, explanation-loading, explained.
- **Behavior:** hover/focus previews locally resolved reference text; click performs an explicit online metadata lookup and can add the result as a board citation card.

### ResearchCard
- **Variants:** translation, explanation, infographic, note, sticky post-it, citation, quiz.
- **States:** loading, streaming, complete, failed, minimized, selected, moving, unresolved.
- **Behavior:** drag, 32px compact-bar minimize, close, 240–720px width/160–900px height resize, internal scroll, and source-grounded follow-up chat. Connectors are hidden by default and only the selected/focused card exposes its source line; selection persists while moving and clears when the board or another card is selected. Reopening the same source focuses the cached card without replacing its content or issuing another AI request. A completed translation can be converted in place to a source-linked note while preserving its translated body and anchor.
- **Loading:** AI cards show only a slim progress track while the first request runs; generic prose such as “AI가 분석하는 중입니다” is never rendered as card content. Loading, completed body, size, minimized state, and chat history are workspace-persisted.
- **Initial height:** explanation, infographic, note, citation, and long translation cards use a 420px expanded display height when no persisted height exists. Selection translations up to 120 characters start at a compact 180px; all bodies remain internally scrollable and resizable. Post-its and highlights retain natural height.
- **Index focus:** activating a board-index row places the card's actual visual center inside the available board viewport, accounting for persisted width and minimized state, so resize and expand controls remain reachable beside the fixed sidebar.
- **Selection translation:** the translation action translates only the highlighted quote and creates a `선택 번역` card. It never forwards surrounding page context as translatable text. Selections up to 120 characters use a small completion budget so a word or short phrase returns with minimal latency.

### ChatComposer
- **Structure:** one quiet rounded composer surface, a label-free one-row textarea, optional plain-text model metadata, and one 28px circular ArrowUp submit control integrated at the lower right. Card chat, paper discussion, citation questions, and the paper chat agent share this primitive.
- **Behavior:** visible prompt sentences such as “질문하세요” are omitted; accessible labels remain for VoiceOver. `Enter` submits, `Shift+Enter` inserts a line break, and IME composition never submits prematurely. The submit control is muted gray while unavailable and dark neutral while actionable rather than a large blue square.
- **States:** idle, focus-within, ready, sending, disabled. Focus uses the existing hairline and surface tokens without changing layout.

### InsightDisclosure
- **Structure:** the clamped text keeps its bottom fade; the disclosure is a small gray text label with a 12px chevron inside the faded edge, never a bordered action button.
- **Behavior:** collapsed copy reads `더 보기` with a downward chevron; expanded copy reads `접기` with the chevron reversed. The full accessible name includes the owning insight title.

### PostIt
- **Structure:** compact drag strip, editable Markdown source, rendered Markdown/KaTeX body, close action.
- **States:** newly-created editing, rendered, focused, moving.
- **Behavior:** selecting the post-it tool then clicking the board creates one card at that exact board coordinate, focuses the editor, and returns to the select tool after placement. Double-clicking an existing post-it re-enters editing; `Cmd/Ctrl+Enter` commits and `Escape` restores rendered mode.
- **Persistence:** post-it position and Markdown source are ordinary workspace card data and survive document/app reopen.
- **Immediate editing:** a new or empty post-it always renders its textarea immediately and focuses it. Placeholder copy is a faint editing hint only; it is never presented as saved note content.

### GeneratedCardTitle
- **Structure:** concise Korean noun phrase, 24 characters preferred and 42 characters maximum, with no generic `해설`, `분석`, page number, or duplicated section heading suffix.
- **Behavior:** AI responses may return a `# title` first line; Scourgify parses it into the card header and keeps the remaining Markdown as the body. A quiet regenerate control in the header explicitly requests a new title from the current grounded card body.

### ProviderSettings
- **Providers:** OpenAI API, OpenRouter, and Local OpenCodex. Local OpenCodex uses the already-running OpenAI-compatible loopback endpoint at `127.0.0.1:10100`; it never copies browser cookies, OAuth tokens, or ChatGPT credentials into Scourgify.
- **Status:** the local provider is considered ready only after its `/v1/models` endpoint responds. It needs no API-key field; hosted providers continue to use encrypted key storage.
- **Boundary:** ChatGPT subscription billing is not represented as an API entitlement. Scourgify only connects to the user's separately authenticated local OpenCodex proxy.

### SettingsWindow
- **Structure:** a 720px split-view sheet with a 176px macOS source-list sidebar and one focused content pane. The sidebar contains `일반`, `AI 모델`, and `읽기`; the current row uses a quiet selected surface rather than a colored dashboard tile. The content pane uses grouped preference rows with labels, values, and native-sized controls aligned on one baseline.
- **Behavior:** appearance and reading preferences apply immediately and persist with the workspace. Provider credentials remain a deliberate form action and show a compact connection state beside the page title. Switching sections does not reset unsaved provider fields.
- **Responsive:** below 680px the source list becomes a compact horizontal segmented row above the content. The sheet stays within `calc(100vw - 32px)` and `calc(100vh - 32px)` with only the content pane scrolling.
- **Copy:** headings are nouns, not instructions. Implementation and privacy explanations are omitted; errors and connection state are concise and local to the affected group.

### SidebarCategoryPanel
- **Structure:** macOS-style grouped list with a strong feature title and immediately readable content preview. Translation foregrounds translated text and source; explanation foregrounds a Markdown takeaway; visual analysis foregrounds structured nodes; notes foreground editable prose; highlights foreground the quotation; citations foreground identity and reading rationale.
- **Constraint:** no blue icon tiles, colored left rails, oversized counters, or decorative gradients. Rail badges represent unread additions rather than lifetime totals, use compact 9–11px capsules, abbreviate counts above 99 as `99+`, and clear as soon as the user opens that mode.

### MarkdownContent
- **Coverage:** every user-authored or AI-authored prose surface uses the same renderer; plain strings remain plain paragraphs while Markdown headings, lists, links, tables, code, and block quotes are supported.
- **UI heading scale:** Markdown `h1`/`h2`/`h3` inside cards and sidebars map to 18px/16px/14px UI headings. Generated prose never inherits document-sized browser heading defaults.
- **Math:** inline `$…$` and display `$$…$$` use KaTeX with horizontal overflow contained inside the owning panel/card.
- **Safety:** raw HTML is never executed; external links open through the validated Electron external-link boundary.

### MetadataSidebar
- **Structure:** document title/authors/year/DOI/pages, current page/selection, a compact board index for translations, AI explanations, AI cards, notes, and citations, followed by tags.
- **Behavior:** every board-index row shows only kind, title, and source page; activating it pans to and selects the corresponding board card. The header opens the Paper Chat Agent in this same sidebar column.
- **States:** expanded, collapsed marker rail, metadata-review, empty.
- **Constraint:** never renders full research-card bodies.

### SidebarResizeHandle
- **Structure:** 7px hit area centered on a 1px divider with a quiet 28px center grip, exposed as an ARIA separator with current/min/max width.
- **Behavior:** pointer drag resizes the adjacent expanded panel directly; arrow keys adjust by 16px. The handle never appears on a collapsed rail.
- **Persistence:** outline and research-sidebar widths are workspace values and restore on the next launch.

### OutlinePanel
- **Structure:** title, close control, current-page marker, and PDF outline rows only.
- **Placement:** appears to the left of the board and never inside the right research sidebar.
- **Behavior:** the top-left toolbar outline button toggles it; choosing a row jumps to that PDF page and preserves the open state until explicitly closed.

### PreparationProgress
- **Steps:** PDF 확인 → 문서 등록 → 페이지 구성 → 텍스트 추출 → 앵커 생성 → 메타정보 → 품질 검사 → 보드 준비 완료.
- **States:** pending, active, complete, warning, failed.
- **Behavior:** the panel is dismissible at any time and automatically closes shortly after every step reaches complete; warnings and failures remain until explicitly dismissed.
- **Constraint:** import performs no AI/network request.

### AI Provider Settings
- **Providers:** OpenAI API and OpenRouter API, each with an encrypted local key and user-selectable model ID. OpenRouter with `z-ai/glm-5.3-flash` is the default state.
- **Typography preference:** one compact selector controls UI text at 90%, 100%, 110%, or 120% and persists in the workspace; it never changes PDF page scale.
- **Copy constraint:** settings and empty states contain controls, status, and errors only. Repeated privacy/network explanations and implementation-detail banners are omitted.
- **Constraint:** ChatGPT consumer subscriptions are not treated as API credentials. Provider calls occur only after an explicit AI action or chat send.
- **Environment bootstrap:** a valid provider configuration supplied through `.env` or process environment replaces a stale or unreadable local provider value and is encrypted into the local provider store on first use. The secret never enters the app bundle; subsequent Finder launches reuse the encrypted copy.
- **Reading-action latency:** explicit selection/section/figure/table/equation actions and structured citation assessment use the provider's low-reasoning mode with bounded completion budgets; open-ended research chat keeps its deeper default. Citation assessment must emit its schema-valid JSON within the interactive card flow rather than spending an unbounded reasoning turn. Section requests include a bounded excerpt following the detected heading instead of sending the heading alone.
- **Streaming:** provider deltas cross a request-ID-scoped, Zod-validated IPC channel. The renderer coalesces visible text updates to one animation frame and commits the completed Markdown to workspace storage only once. The first token removes the slim loading track; cancellation or failure never leaves a partial response persisted as complete.
- **Context budgets:** short translation and title actions receive the smallest bounded context/completion budgets; figure, table, section, and open-ended research requests retain the paper overview, current section, local evidence, and exact question in that priority order.

### WorkspacePersistence
- **Transient state:** pan, zoom, sidebar resize, outline resize, and in-progress card geometry update the live workspace without entering undo history. A completed semantic edit or final pointer release creates one history checkpoint.
- **Storage:** rapid workspace changes are coalesced and the latest valid snapshot is saved after a short idle interval. Only one save may be in flight; a newer snapshot follows it rather than racing the database.
- **Render budget:** AI streaming text is local component state until completion. PDF page rendering, Markdown parsing, workspace serialization, and database writes never run once per token.

### Paper Chat Agent
- **Structure:** provider/model status, document-grounded message history, prompt input, send/close controls.
- **Placement:** is the default right sidebar for an open paper and never floats over the paper. Its header switches to the board index; the board-index header switches back to AI chat.
- **Behavior:** each message is explicitly submitted and includes the active paper identity plus only the bounded context supplied by the user interaction.

### ResearchSidebar Modes
- **Shell:** one 300px default resizable scrollable content pane plus a fixed 40px mode rail on the far right. The rail exposes `AI`, `Translation`, `Explanation`, `AI Card`, `Note`, `Post-it`, `Highlight`, and `Citations` as first-class modes; there is no aggregate `Board` mode or secondary filter-chip row.
- **Initial state:** the visible pane starts in `AI` mode because explanation and translation are the primary reading loop. This initial view performs no request; the first explicit AI-rail activation starts missing overview requests.
- **AI mode:** collapsible Keyword Dictionary, 3-Line Summary, Summary, and Discussion sections. The first explicit activation of the AI rail generates all missing overview sections concurrently; subsequent visits restore cached values immediately. Individual empty-state `Generate` buttons do not exist. Every generated section supports copy, regenerate, and explicit `Save to Board`.
- **Failure copy:** an unconfigured provider is labeled as setup-required; a configured provider request failure is labeled as retryable and never misreported as a missing key.
- **Overview context boundary:** overview extraction and the renderer/preload/main IPC schema share one 8,000-character limit. No producer may construct a context larger than the receiving boundary.
- **Card-category modes:** Translation, Explanation, AI Card, Note, Post-it, and Highlight each open a dedicated source-linked index containing only that card kind. Every rail item has its own icon and accessible name; a count badge appears only when its count is greater than zero. Selecting a row focuses the matching board card while the board remains the spatial canvas rather than the navigation container.
- **Translation panel:** each result is a readable comparison card: translated output is the dominant block, the source quote sits in a muted `원문` inset, and the page/action footer returns to the board location.
- **Explanation panel:** each section or figure explanation shows a two-line title, a multi-line grounded takeaway, and the cited source passage. It optimizes evidence recall, not generic card management.
- **AI Card panel:** figure/table/infographic analysis uses a larger visual-type tile and a structured multi-line preview so image-oriented outputs are distinguishable before opening the board card.
- **Note and Post-it panels:** notes use a quiet warm paper tint with their linked source; post-its use the stronger `--note` paper surface, preserve more handwritten content, and label the board action as editing rather than viewing.
- **Highlight panel:** saved source text is the content itself, rendered as a marker-like evidence strip with an `원문 위치 보기` action. It never wastes the panel on a title-only row.
- **Category empty states:** an empty category explains what the feature preserves and the user action that creates the first item. Empty panels never show an unexplained blank canvas.
- **Citations mode:** lists references extracted locally, then performs online identity resolution and AI assessment only after an explicit per-paper or batch action. It supports source/open-access links, board saving, citation-reason explanation, reading guidance, and cited-paper questions.

### Citation Triage Agent
- **Responsive citation cards:** the citation list has one shrinkable track across the full 260–520px sidebar range. Citation IDs never define card width. At 360px and below, the ID occupies its own row and the title/author/source block spans the card; titles, author lists, DOI/URL text, actions, and score breakdowns wrap inside the card without horizontal scrolling, clipping, or ellipsis-only loss.
- **Identity gate:** search multiple Semantic Scholar and Crossref candidates; accept only DOI-exact or strongly matching title/author/year evidence. Ambiguous candidates remain unresolved and are never scored as if verified.
- **AI evidence:** assess dependency on the cited work, methodological relevance, conceptual relevance, evidentiary importance, and context sufficiency from the current citation context plus verified metadata/abstract. Return schema-validated JSON; prose-only or malformed output fails closed.
- **Local score:** the renderer sums bounded component scores to 0–100 and assigns the final tier; the model cannot directly promote itself to a tier.
- **Score display:** every assessed citation shows `score/100`, a compact meter, and the five visible components: dependency 30, methodological 25, conceptual 20, evidentiary 15, and context sufficiency 10. Verified source/DOI links remain directly accessible from the assessment header.
- **Conservative distribution:** among verified assessments, at most 5% become `Deep Read`, the next 15% `Skim`, the next 25% `Abstract Only`, and the remaining majority `Pass`, with hard score gates of 88/68/42. Very small sets receive `Deep Read` only for an exceptional score of at least 96.
- **Tier meaning:** `Deep Read` names exact sections to study; `Skim` names the minimum sections/figures; `Abstract Only` requires abstract plus the citation context; `Pass` preserves the citation reason but recommends no additional reading.
- **Ordering:** tier, score, identity confidence, then number of independent citation contexts. Raw citation count is metadata, never the primary reading-value signal.

### Primitive Showcase
- Must exercise every component/variant/state at 920×640, 1280×800, and 1536×1024 before product-screen acceptance.

## 6. Motion & Interaction

| Interaction | Timing | Mechanism |
|---|---:|---|
| Button/selection feedback | 100–120ms | opacity + micro-scale |
| Card minimize/expand | 180ms | transform + opacity, interruptible |
| Sidebar collapse/expand | 180ms | transform, board viewport relayout after completion |
| Connector emphasis | 160ms | opacity/stroke only |
| Board pan/zoom | gesture-bound | direct manipulation, no queued tween |

- Spatial motion uses transforms; color/opacity use short easing.
- Reduced Motion removes nonessential interpolation but preserves all state changes and connectors.
- Pinch zoom is centered on cursor/focal point. Dragged cards stay under the pointer.
- Toolbar zoom is centered on the visible board area, preserving the current paper/card location instead of shifting the active page off-screen.

## 7. Depth & Surface

Strategy: tonal shift plus hairline. Board cards use `0 2px 10px rgb(25 35 45 / 8%)`; selected/moving cards may use `0 8px 24px rgb(25 35 45 / 12%)`. No gradients, glass layers, neon, or rounded-card nesting.

## 8. Accessibility Constraints & Accepted Debt

- Target WCAG 2.2 AA, visible 2px action-color focus, keyboard reachability, 200% text, increased contrast, reduced motion, and VoiceOver labels.
- Board objects use DOM reading order independent of visual coordinates; connectors are decorative while source-jump controls are semantic.
- Current accepted debt: exact PDF text-layer selection geometry and VoiceOver reading order require runtime verification against real mixed-layout PDFs before release.

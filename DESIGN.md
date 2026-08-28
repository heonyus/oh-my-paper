# Scourgify Design System

## 0. Research Log

- Primary visual contract: `.omo/frontend-design/mockups/hotebook-board-cards-metadata-sidebar-v1.png` (1536×1024, SHA-256 `78b7a1281ad31775f018e885b205b8a277bdd2c901213294b1b8adec7abbbf39`).
- Interaction evidence: `.omo/evidence/hotebook-rnr-verified.md` and the preserved private Record & Replay session.
- Component references: sanitized captures under `recording-review-2026-08-26/`; prior MarginLedger implementation is explicitly not a pixel or source-code base.
- Owner corrections: continuous vertical paper column; research cards remain on the infinite board; collapsible right sidebar is metadata/index only.
- Scourgify branding assets: `assets/branding/scourgify-logo-v2.png` (app mark) and `assets/branding/scourgify-wordmark-v1.png` (topbar wordmark).
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
- Left utility rail: 70px fixed; icon plus Korean label.
- Outline panel: optional 280px fixed screen region between the utility rail and board; controlled only by the top-left outline button.
- Metadata sidebar: 300–340px fixed screen region; collapses to 36px marker rail.
- Board viewport: remaining bounded region; owns pan/zoom gestures and never document scroll.
- Paper column: all pages share one X coordinate, ordered vertically with 12–20px gaps.
- Board world: minimum 4800×6400 logical pixels, expandable; zoom 38–150%.
- Pan: two-finger/trackpad wheel and hand-tool drag. Pinch or `Ctrl`/`Meta` wheel zooms around cursor.
- Cards: 280–340px default width, movable in board coordinates, never docked in metadata sidebar.
- No minimap is shown. Navigation uses page/card quick links and direct pan/zoom, avoiding a decorative control with no actionable state.

The paper column and cards transform together. Toolbar, rails, and metadata sidebar remain screen-fixed.

## 5. Components

### BoardViewport
- **Structure:** grid canvas, world transform, paper column, cards, SVG connector layer.
- **States:** empty, preparing, ready, panning, zooming, selection, restore-failed.
- **Accessibility:** keyboard pan/zoom/reset/fit; current zoom announced; motion is not required to locate content.

### PaperColumn
- **Structure:** continuous ordered PDF leaves, page IDs, source anchor overlays.
- **States:** validating, rendering, text-indexing, ready, password, damaged, OCR-needed.
- **Behavior:** current/near pages render first; all pages retain a single vertical axis.

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
- **Layout pipeline:** each page classifies full-width, single-column, and multi-column text zones before line merging. Page feature detection runs in a bounded Web Worker pool; low-confidence or structureless pages remain unmarked for a local layout-model fallback rather than exposing a guessed target.
- **Overlay lifecycle:** feature overlays live in a stable viewer-owned layer outside PDF.js page children, while their geometry stays page-local. PDF.js page replacement and zoom may refresh or rescale geometry but must never remove targets.
- **Zoom invariant & Cluster Layout:** Figure and Table actions are anchored inside the lower-right edge of their large targets. Equation actions are two icon-only controls placed entirely outside the detected math bounds; they prefer the nearest column margin and switch sides when that margin is clipped by the board viewport, so no formula glyph is obscured and the controls remain reachable. Feature outlines are 1 screen-pixel neutral dashed strokes; zoom changes enclosed PDF geometry without altering stroke weight or dash intervals.
- **Constraint:** overlays never cover the target content and disappear within 110–120ms after leaving both target and action. Idle sparkles never appear on table cells, figure labels, axis ticks, or body prose.

### FeatureExplanationCard
- **Structure:** feature-kind label, source title/caption, grounded Korean explanation, source-jump action.
- **States:** loading, complete, failed.
- **Behavior:** image-bearing targets send only the cropped local feature image plus page caption/context after explicit click; text targets send only the detected block and minimal context.

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
- **Variants:** translation, explanation, infographic, note, citation, quiz.
- **States:** loading, streaming, complete, failed, minimized, selected, moving, unresolved.
- **Behavior:** drag/minimize/close/follow-up; connector remains attached to source identity. A completed translation can be converted in place to a source-linked note while preserving its translated body and anchor.

### MetadataSidebar
- **Structure:** document title/authors/year/DOI/pages, current page/selection, a compact board index for translations, AI explanations, AI cards, notes, and citations, followed by tags.
- **Behavior:** every board-index row shows only kind, title, and source page; activating it pans to and selects the corresponding board card. The header opens the Paper Chat Agent in this same sidebar column.
- **States:** expanded, collapsed marker rail, metadata-review, empty.
- **Constraint:** never renders full research-card bodies.

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
- **Providers:** OpenAI API and OpenRouter API, each with an encrypted local key and user-selectable model ID.
- **Constraint:** ChatGPT consumer subscriptions are not treated as API credentials. Provider calls occur only after an explicit AI action or chat send.

### Paper Chat Agent
- **Structure:** provider/model status, document-grounded message history, prompt input, send/close controls.
- **Placement:** is the default right sidebar for an open paper and never floats over the paper. Its header switches to the board index; the board-index header switches back to AI chat.
- **Behavior:** each message is explicitly submitted and includes the active paper identity plus only the bounded context supplied by the user interaction.

### ResearchSidebar Modes
- **Shell:** one 440px scrollable content pane plus a fixed 52px mode rail on the far right. The three modes are `AI`, `Board`, and `Citations`; no fourth hidden mode exists.
- **AI mode:** collapsible Keyword Dictionary, 3-Line Summary, Summary, and Discussion sections. Every generated section supports copy, regenerate, and explicit `Save to Board`; importing/opening a PDF never generates them automatically.
- **Board mode:** compact source-linked index for translations, explanations, infographics, notes, highlights, and saved citation assessments. Filters and counts operate on local workspace cards; selecting a row focuses its board card.
- **Citations mode:** lists references extracted locally, then performs online identity resolution and AI assessment only after an explicit per-paper or batch action. It supports source/open-access links, board saving, citation-reason explanation, reading guidance, and cited-paper questions.

### Citation Triage Agent
- **Identity gate:** search multiple Semantic Scholar and Crossref candidates; accept only DOI-exact or strongly matching title/author/year evidence. Ambiguous candidates remain unresolved and are never scored as if verified.
- **AI evidence:** assess dependency on the cited work, methodological relevance, conceptual relevance, evidentiary importance, and context sufficiency from the current citation context plus verified metadata/abstract. Return schema-validated JSON; prose-only or malformed output fails closed.
- **Local score:** the renderer sums bounded component scores to 0–100 and assigns the final tier; the model cannot directly promote itself to a tier.
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

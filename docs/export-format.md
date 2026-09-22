# oh-my-paper selected export format

oh-my-paper exports one immutable selected-content snapshot to Markdown, HTML, DOCX, or PDF. Export construction never writes back to the canonical Markdown note. Destination selection, overwrite confirmation, staged filesystem writes, and partial-write recovery remain responsibilities of the calling interchange service.

## Integration API

```ts
const snapshot = createExportSnapshot(uncheckedInput)
const markdownBundle = exportMarkdown(snapshot)
const htmlFile = exportHtml(snapshot)
const renderer = new ElectronExportRenderer()
const docxFile = await exportDocx(snapshot, { renderMath: renderer.renderMath })
const pdfFile = await exportPdf(snapshot, { renderer, signal })
```

`createExportSnapshot` is the only untrusted-data boundary. `exportSnapshotInputSchema` accepts an explicit allowlist: selected record identity and provenance, source revision, Markdown, resolved bibliography, source availability, and local image bytes. It rejects unknown fields, including hidden state accidentally attached by a caller. It does not accept filesystem paths, credentials, memory/history, jobs, or arbitrary metadata.

Assets are bounded to 64 selected PNG, JPEG, or GIF images, 10 MiB each and 50 MiB total. The caller supplies bytes in memory and maps each source Markdown image URL to a portable filename. Export code does not read the filesystem or fetch a URL.

The snapshot removes unsafe link targets, private absolute paths, raw HTML, and credential-like values from the destination-bound copy. The original Markdown string and canonical note are untouched. Secret detection is deliberately conservative and cannot prove that authored prose contains no sensitive information, so the preview must expose `snapshot.limitations` before confirmation.

## Supported Markdown tree

The shared tree supports headings, paragraphs, emphasis, strong text, deletion, inline code, fenced code, block quotes, ordered and unordered lists, GFM tables, safe links, selected local images, inline/display math, thematic breaks, and `<!-- ohmypaper:page-break -->`.

Raw HTML is removed. Reference-style links/images and footnotes are currently flattened or omitted and reported as limitations. No exporter claims lossless Markdown formatting or DOCX round-trip import.

## Markdown

The Markdown bundle contains one `.md` file and an `assets/` entry for each selected image. YAML frontmatter records the snapshot revision plus stable selected record IDs, aliases, document version hashes, evidence anchors, semantic relations, review state, and provenance. Bibliography, sources, source availability, and export limitations remain readable in ordinary editors.

oh-my-paper-only source locators are preserved as text. They require the matching oh-my-paper collection and immutable document version; unavailable sources are not retargeted.

## HTML

HTML is a single static offline file. Images are embedded as data URLs, styles are inline, and math is emitted as KaTeX-generated MathML. Authored raw HTML and scripts never enter the result. The Content Security Policy denies all loading by default and permits only inline styles and embedded images. HTTP, HTTPS, and mail links require a deliberate click and carry `noreferrer noopener`; automatic network requests are not present.

## DOCX

DOCX uses editable Word paragraphs, runs, hyperlinks, headings, lists, and real tables. Table headers are marked to repeat across pages and rows are not forcibly split. Selected images remain image objects with alternative text.

Simple equations containing plain Unicode identifiers, numbers, and operators use editable OMML math runs. More complex LaTeX is rendered by the isolated Electron renderer and inserted as an image with the original LaTeX in alternative text plus a visible disclosure. This fallback is not editable math. Export fails with `ExportMathRendererRequiredError` rather than dropping unsupported math when no renderer is supplied.

## PDF

PDF is printed from the same static HTML through `ElectronExportRenderer`. It uses a unique non-persistent Electron session, disables Node integration, enables Chromium sandboxing and context isolation, denies HTTP, HTTPS, file, and FTP requests, rejects new windows/navigation, waits for fonts and images, and calls `webContents.printToPDF` with an A4 print stylesheet. The operation has a caller-visible timeout and cancellation signal, a 100 MiB output bound, and a PDF signature check.

The print stylesheet repeats table headers, avoids splitting images, rows, code blocks, and display equations where Chromium can honor the constraint, and supports explicit page breaks. Prose and MathML remain selectable; images are not used as a whole-document rendering shortcut.

## Known limitations

- Export redaction cannot identify every possible secret embedded in authored prose; preview remains mandatory.
- Raw HTML, footnotes, reference-style Markdown links/images, SVG, WebP, audio, video, and remote assets are unsupported.
- Complex DOCX equations are rendered images with LaTeX alternative text, not native editable equations.
- Browser pagination is bounded and practical, but cannot guarantee that every unusually large table row or equation fits on one page.
- A oh-my-paper-only source locator is descriptive outside the matching local collection and application.

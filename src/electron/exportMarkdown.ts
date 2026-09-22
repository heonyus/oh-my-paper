import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkStringify from "remark-stringify"
import { unified } from "unified"
import { stringify } from "yaml"
import { type ExportBundle, exportBundleSchema } from "../shared/exportSchemas"
import type { ExportSnapshot } from "./exportSnapshot"

const encoder = new TextEncoder()
const markdownProcessor = unified().use(remarkGfm).use(remarkMath).use(remarkStringify, {
  bullet: "-",
  fences: true,
})

export function exportFilenameBase(title: string): string {
  const base = title
    .normalize("NFC")
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
  return base || "ohmypaper-export"
}

function appendReferences(snapshot: ExportSnapshot, body: string): string {
  const bibliography = snapshot.bibliography.map((entry) => {
    const suffix = entry.url ? ` <${entry.url}>` : ""
    return `- [${entry.key}] ${entry.text}${suffix}`
  })
  const sources = snapshot.sources.map((source) => {
    const suffix = source.url ? ` <${source.url}>` : ""
    return `- ${source.label} — ${source.locator} (${source.availability})${suffix}`
  })
  const limitations = snapshot.limitations.map((item) => `- ${item.detail}`)
  return [
    body.trim(),
    bibliography.length ? `## Bibliography\n\n${bibliography.join("\n")}` : "",
    sources.length ? `## Sources\n\n${sources.join("\n")}` : "",
    limitations.length ? `## Export limitations\n\n${limitations.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function serializeExportMarkdown(snapshot: ExportSnapshot): string {
  const frontmatter = stringify({
    format: "ohmypaper-selected-export",
    version: 1,
    title: snapshot.title,
    revision: snapshot.revision,
    records: snapshot.records,
  }).trim()
  const body = markdownProcessor.stringify(snapshot.root)
  return `---\n${frontmatter}\n---\n\n${appendReferences(snapshot, body)}\n`
}

export function exportMarkdown(snapshot: ExportSnapshot): ExportBundle {
  const base = exportFilenameBase(snapshot.title)
  return exportBundleSchema.parse({
    files: [
      {
        relativePath: `${base}.md`,
        mediaType: "text/markdown",
        bytes: encoder.encode(serializeExportMarkdown(snapshot)),
      },
      ...snapshot.assets.map((asset) => ({
        relativePath: `assets/${asset.filename}`,
        mediaType: asset.mediaType,
        bytes: asset.bytes,
      })),
    ],
  })
}

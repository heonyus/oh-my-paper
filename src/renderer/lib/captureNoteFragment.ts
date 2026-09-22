import { markdownLanguage } from "@codemirror/lang-markdown"
import { type NoteFragment, noteFragmentSchema } from "../../shared/fragmentAnchors"
import type { KnowledgeNodeId } from "../../shared/knowledgeSchemas"

export async function captureNoteFragment(
  nodeId: KnowledgeNodeId,
  source: string,
  selection: { readonly from: number; readonly to: number },
): Promise<{ readonly body: string; readonly anchor: NoteFragment }> {
  const { from, to } = selection
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to <= from ||
    to > source.length ||
    to - from > 8_000
  ) {
    throw new Error("연결할 구절을 8,000자 이내로 선택하세요.")
  }
  let block = markdownLanguage.parser.parse(source).topNode.firstChild
  while (block && !(block.from <= from && block.to >= to)) block = block.nextSibling
  if (!block || block.name === "HTMLBlock") throw new Error("한 문단 안에서 구절을 선택하세요.")
  const preceding = source.slice(0, block.from)
  const existing = /<!-- ohmypaper:block:([a-f0-9-]{36}) -->\s*$/.exec(preceding)
  const blockId = existing?.[1] ?? crypto.randomUUID()
  const marker = existing ? "" : `<!-- ohmypaper:block:${blockId} -->\n\n`
  const body = `${preceding}${marker}${source.slice(block.from)}`
  const shiftedFrom = from + marker.length
  const shiftedTo = to + marker.length
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))
  const revision = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return {
    body,
    anchor: noteFragmentSchema.parse({
      id: crypto.randomUUID(),
      nodeId,
      blockId,
      revision,
      quote: source.slice(from, to),
      prefix: body.slice(Math.max(shiftedFrom - 32, preceding.length + marker.length), shiftedFrom),
      suffix: body.slice(shiftedTo, Math.min(shiftedTo + 32, block.to + marker.length)),
      from: shiftedFrom,
      to: shiftedTo,
    }),
  }
}

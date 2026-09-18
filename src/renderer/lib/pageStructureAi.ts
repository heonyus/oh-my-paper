import type { PageStructureOutput } from "../../shared/pageStructure"
import { pageStructureOutputSchema } from "../../shared/pageStructure"
import type { AiRequestRunner, DocumentRecord } from "../types"
import type { LocalPageTranslationBlock } from "./pageTranslationLayout"

const structureCache = new Map<string, readonly LocalPageTranslationBlock[]>()

export class PageStructureError extends Error {
  readonly name = "PageStructureError"

  constructor(readonly kind: "image_unavailable" | "input_too_large" | "malformed_output") {
    super(kind)
  }
}

function pageImageDataUrl(pageNumber: number): string {
  const canvas = document.querySelector<HTMLCanvasElement>(
    `.page[data-page-number="${pageNumber}"] .canvasWrapper canvas`,
  )
  if (!canvas || canvas.width <= 0 || canvas.height <= 0)
    throw new PageStructureError("image_unavailable")
  const scale = Math.min(1, 1_600 / Math.max(canvas.width, canvas.height))
  const output = document.createElement("canvas")
  output.width = Math.max(1, Math.round(canvas.width * scale))
  output.height = Math.max(1, Math.round(canvas.height * scale))
  const context = output.getContext("2d")
  if (!context) throw new PageStructureError("image_unavailable")
  context.drawImage(canvas, 0, 0, output.width, output.height)
  return output.toDataURL("image/jpeg", 0.72)
}

function requestJson(blocks: readonly LocalPageTranslationBlock[]): string {
  const value = JSON.stringify({
    blocks: blocks.map((block) => ({
      id: block.id,
      text: block.source.slice(0, 320),
      kindHint: block.structureKind,
      ...block.bounds,
    })),
  })
  if (value.length > 7_800) throw new PageStructureError("input_too_large")
  return value
}

function parseOutput(value: string): PageStructureOutput {
  try {
    return pageStructureOutputSchema.parse(JSON.parse(value))
  } catch (error) {
    if (error instanceof Error) throw new PageStructureError("malformed_output")
    throw error
  }
}

function validateCoverage(
  local: readonly LocalPageTranslationBlock[],
  output: PageStructureOutput,
): void {
  const expected = new Set(local.map((block) => block.id))
  const returned = output.blocks.flatMap((block) => block.sourceBlockIds)
  if (
    returned.length !== expected.size ||
    new Set(returned).size !== expected.size ||
    returned.some((id) => !expected.has(id)) ||
    new Set(output.blocks.map((block) => block.order)).size !== output.blocks.length
  ) {
    throw new PageStructureError("malformed_output")
  }
}

function mergedBounds(blocks: readonly LocalPageTranslationBlock[]) {
  const x = Math.min(...blocks.map((block) => block.bounds.x))
  const y = Math.min(...blocks.map((block) => block.bounds.y))
  const right = Math.max(...blocks.map((block) => block.bounds.x + block.bounds.width))
  const bottom = Math.max(...blocks.map((block) => block.bounds.y + block.bounds.height))
  return { x, y, width: right - x, height: bottom - y }
}

function mergeOutput(
  local: readonly LocalPageTranslationBlock[],
  output: PageStructureOutput,
): readonly LocalPageTranslationBlock[] {
  const byId = new Map(local.map((block) => [block.id, block] as const))
  return [...output.blocks]
    .sort((left, right) => left.order - right.order)
    .map((group) => {
      const sources = group.sourceBlockIds.flatMap((id) => {
        const block = byId.get(id)
        return block ? [block] : []
      })
      return {
        id: group.id,
        kind: group.kind === "title" || group.kind === "heading" ? "heading" : "body",
        source: sources
          .map((block) => block.source)
          .join(" ")
          .replace(/(?<=\p{Ll})-\s+(?=\p{Ll})/gu, ""),
        sourceItemIds: [...new Set(sources.flatMap((block) => block.sourceItemIds))],
        structureKind: group.kind,
        translation: group.markdown,
        bounds: mergedBounds(sources),
      }
    })
}

export function resolvePageStructureBlocks(
  local: readonly LocalPageTranslationBlock[],
  value: unknown,
): readonly LocalPageTranslationBlock[] {
  const output = pageStructureOutputSchema.parse(value)
  validateCoverage(local, output)
  return mergeOutput(local, output)
}

export async function refinePageTranslationStructure(input: {
  readonly document: DocumentRecord
  readonly page: number
  readonly localBlocks: readonly LocalPageTranslationBlock[]
  readonly onAiRequest: AiRequestRunner
}): Promise<readonly LocalPageTranslationBlock[]> {
  const key = `${input.document.id}:${input.page}:${input.localBlocks.map((block) => block.id).join(",")}`
  const cached = structureCache.get(key)
  if (cached) return cached
  try {
    const result = await input.onAiRequest({
      action: "page_structure",
      page: input.page,
      quote: requestJson(input.localBlocks),
      before: "",
      after: "",
      imageDataUrl: pageImageDataUrl(input.page),
    })
    const refined = resolvePageStructureBlocks(input.localBlocks, parseOutput(result))
    structureCache.set(key, refined)
    return refined
  } catch (error) {
    if (error instanceof Error) return input.localBlocks
    throw error
  }
}

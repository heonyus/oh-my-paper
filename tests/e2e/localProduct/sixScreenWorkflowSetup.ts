import { join } from "node:path"
import { expect, type Page } from "@playwright/test"
import type {
  BoardRecord,
  KnowledgeNode,
  PlacementRecord,
} from "../../../src/shared/knowledgeSchemas"
import type { DocumentRecord } from "../../../src/shared/schemas"
import { type MeasuredSourceAnchor, measureSourceAnchor } from "./sixScreenWorkflowHelpers"

export const sixScreenConceptTitle = "공유 개념 · 두 PDF 근거"
export const sixScreenNoteTitle = "두 PDF 근거 기록"

export interface SeededSixScreenWorkspace {
  readonly documents: readonly [DocumentRecord, DocumentRecord]
  readonly concept: KnowledgeNode
  readonly note: KnowledgeNode
  readonly board: BoardRecord
  readonly placements: readonly PlacementRecord[]
  readonly paperIds: readonly KnowledgeNode["id"][]
  readonly firstAnchor: MeasuredSourceAnchor
  readonly noteBody: string
}

export async function seedSixScreenWorkspace(page: Page): Promise<SeededSixScreenWorkspace> {
  await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
  const fixturePaths = [
    join(process.cwd(), "tests", "fixtures", "sample-paper.pdf"),
    join(process.cwd(), "tests", "fixtures", "document-ast", "structured-document.pdf"),
  ] as const
  const documents = await page.evaluate(async (paths) => {
    const imported = []
    for (const path of paths) {
      const result = await window.scourgify.importDocumentPath(path)
      if (!result) throw new Error(`Synthetic PDF import was cancelled: ${path}`)
      imported.push(result.document)
    }
    return imported
  }, fixturePaths)
  const firstDocument = documents[0]
  const secondDocument = documents[1]
  if (!firstDocument || !secondDocument) throw new Error("Two synthetic PDFs are required")
  await page.reload()
  await expect(page.getByText("2개 문서", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: `${firstDocument.title} 열기`, exact: true }).click()
  const firstAnchor = await measureSourceAnchor(page, "Scourgify")
  const concept = await page.evaluate(
    async ({ documentId, hash, anchor, title }) =>
      window.scourgify.knowledge.linkEvidence({
        documentId,
        hash,
        anchor,
        target: { type: "new", kind: "concept", title },
      }),
    {
      documentId: firstDocument.id,
      hash: firstDocument.hash,
      anchor: firstAnchor,
      title: sixScreenConceptTitle,
    },
  )
  await page.getByRole("button", { name: "라이브러리", exact: true }).click()
  await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
  await page.getByRole("button", { name: `${secondDocument.title} 열기`, exact: true }).click()
  const secondAnchor = await measureSourceAnchor(page, "Synthetic")
  await page.evaluate(
    async ({ documentId, hash, anchor, nodeId }) =>
      window.scourgify.knowledge.linkEvidence({
        documentId,
        hash,
        anchor,
        target: { type: "existing", nodeId },
      }),
    {
      documentId: secondDocument.id,
      hash: secondDocument.hash,
      anchor: secondAnchor,
      nodeId: concept.id,
    },
  )

  await page.getByRole("button", { name: "지식", exact: true }).click()
  await expect(page.getByRole("region", { name: "지식 항목 목록" })).toBeVisible()
  await page.getByRole("button", { name: "생성", exact: true }).click()
  const noteBody = `# ${sixScreenNoteTitle}\n\n동일한 개념을 두 문서의 원문에 고정했습니다.\n\n[[${concept.id}|${sixScreenConceptTitle}]]`
  await page.getByRole("textbox", { name: "제목 수정" }).fill(sixScreenNoteTitle)
  await page.getByRole("textbox", { name: "본문 내용 수정" }).fill(noteBody)
  await page.getByRole("button", { name: "저장", exact: true }).click()
  await expect(page.getByText("저장됨 · 자동 저장 안 함", { exact: true })).toBeVisible()
  const note = await page.evaluate(async (title) => {
    const nodes = await window.scourgify.knowledge.findNodes({ search: title })
    return nodes.find((node) => node.kind === "note" && node.title === title) ?? null
  }, sixScreenNoteTitle)
  if (!note) throw new Error("Saved synthetic note was not found")
  await page.evaluate(
    async ({ sourceId, targetId }) =>
      window.scourgify.knowledge.createRelation({
        sourceId,
        targetId,
        predicate: "interprets",
        provenance: { source: "user", model: null, extractorVersion: null },
        reviewState: "accepted",
      }),
    { sourceId: note.id, targetId: concept.id },
  )
  const paperIds = await page.evaluate(async () => {
    const nodes = await window.scourgify.knowledge.findNodes()
    return nodes
      .filter((node) => node.kind === "paper")
      .slice(0, 2)
      .map((node) => node.id)
  })
  if (paperIds.length !== 2) throw new Error("Two imported paper nodes are required")
  const board = await page.evaluate(() =>
    window.scourgify.knowledge.createBoard("공유 개념 프로젝트"),
  )
  const placements = await page.evaluate(
    async ({ boardId, nodeIds }) =>
      Promise.all(
        nodeIds.map((nodeId, index) =>
          window.scourgify.knowledge.createPlacement({
            boardId,
            nodeId,
            x: 80 + index * 320,
            y: 80,
            width: 280,
          }),
        ),
      ),
    { boardId: board.id, nodeIds: [concept.id, note.id] },
  )
  expect(placements).toHaveLength(2)
  return {
    documents: [firstDocument, secondDocument],
    concept,
    note,
    board,
    placements,
    paperIds,
    firstAnchor,
    noteBody,
  }
}

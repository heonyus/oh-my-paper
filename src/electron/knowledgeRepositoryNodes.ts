import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import {
  type KnowledgeNode,
  type KnowledgeNodeId,
  knowledgeNodeIdSchema,
  knowledgeNodeSchema,
} from "../shared/knowledgeSchemas"
import type { CreateNodeInput, NodeFilter, UpdateNodeInput } from "../shared/knowledgeTypes"
import { withKnowledgeSavepoint } from "./knowledgeDatabaseTransaction"
import { executeFindNodes } from "./knowledgeRepositoryQueries"
import { rowToNode } from "./knowledgeRepositoryRows"
import { cachedStatement } from "./knowledgeStatements"

export type CanonicalNoteProjection = {
  readonly get: (noteId: string) => { readonly body: string } | null
  readonly searchIds: (search: string, limit?: number) => readonly string[]
}

export class CanonicalNoteWriteError extends Error {
  readonly name = "CanonicalNoteWriteError"

  constructor(readonly operation: "create" | "update" | "delete") {
    super(`Canonical note ${operation} must use CollectionService`)
  }
}

export class KnowledgeNodeOperations {
  private canonicalWriteDepth = 0

  constructor(
    private readonly db: DatabaseSync,
    private readonly noteProjection?: CanonicalNoteProjection,
  ) {}

  withCanonicalWrite<T>(operation: () => T): T {
    this.canonicalWriteDepth += 1
    try {
      return operation()
    } finally {
      this.canonicalWriteDepth -= 1
    }
  }

  createNode(input: CreateNodeInput): KnowledgeNode {
    if (input.kind === "note" && this.noteProjection && this.canonicalWriteDepth === 0) {
      throw new CanonicalNoteWriteError("create")
    }
    return withKnowledgeSavepoint(this.db, () => {
      const id = input.id ?? knowledgeNodeIdSchema.parse(randomUUID())
      const now = new Date().toISOString()
      const node = knowledgeNodeSchema.parse({
        id,
        kind: input.kind,
        title: input.title,
        body: input.body ?? "",
        aliases: input.aliases ?? [],
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      })

      cachedStatement(
        this.db,
        `
      INSERT INTO knowledge_nodes (id, kind, title, body, aliases_json, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(
        node.id,
        node.kind,
        node.title,
        node.kind === "note" && this.noteProjection ? "" : node.body,
        JSON.stringify(node.aliases),
        JSON.stringify(node.metadata),
        node.createdAt,
        node.updatedAt,
      )

      cachedStatement(
        this.db,
        "INSERT INTO knowledge_nodes_fts (id, title, body, aliases) VALUES (?, ?, ?, ?)",
      ).run(
        node.id,
        node.title,
        node.kind === "note" && this.noteProjection ? "" : node.body,
        node.aliases.join(" "),
      )

      return node
    })
  }

  getNode(id: KnowledgeNodeId): KnowledgeNode | null {
    const raw = cachedStatement(this.db, "SELECT * FROM knowledge_nodes WHERE id = ?").get(id)
    if (!raw) return null
    return this.withProjectedBody(rowToNode(raw))
  }

  updateNode(input: UpdateNodeInput): KnowledgeNode {
    const current = this.getNode(input.id)
    if (
      current?.kind === "note" &&
      input.body !== undefined &&
      this.noteProjection &&
      this.canonicalWriteDepth === 0
    ) {
      throw new CanonicalNoteWriteError("update")
    }
    return withKnowledgeSavepoint(this.db, () => {
      const existing = this.getNode(input.id)
      if (!existing) throw new Error(`Node not found: ${input.id}`)
      if (input.expectedBody !== undefined && input.expectedBody !== existing.body) {
        throw new Error("본문이 다른 곳에서 변경되었습니다. 현재 편집 내용은 유지했습니다.")
      }

      const updated = knowledgeNodeSchema.parse({
        ...existing,
        title: input.title ?? existing.title,
        body: input.body ?? existing.body,
        aliases: input.aliases ?? existing.aliases,
        metadata: input.metadata ?? existing.metadata,
        updatedAt: new Date().toISOString(),
      })

      cachedStatement(
        this.db,
        `
      UPDATE knowledge_nodes
      SET title = ?, body = ?, aliases_json = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `,
      ).run(
        updated.title,
        updated.kind === "note" && this.noteProjection ? "" : updated.body,
        JSON.stringify(updated.aliases),
        JSON.stringify(updated.metadata),
        updated.updatedAt,
        updated.id,
      )

      cachedStatement(this.db, "DELETE FROM knowledge_nodes_fts WHERE id = ?").run(updated.id)
      cachedStatement(
        this.db,
        "INSERT INTO knowledge_nodes_fts (id, title, body, aliases) VALUES (?, ?, ?, ?)",
      ).run(
        updated.id,
        updated.title,
        updated.kind === "note" && this.noteProjection ? "" : updated.body,
        updated.aliases.join(" "),
      )

      return updated
    })
  }

  deleteNode(id: KnowledgeNodeId): boolean {
    if (
      this.getNode(id)?.kind === "note" &&
      this.noteProjection &&
      this.canonicalWriteDepth === 0
    ) {
      throw new CanonicalNoteWriteError("delete")
    }
    return withKnowledgeSavepoint(this.db, () => {
      const res = cachedStatement(this.db, "DELETE FROM knowledge_nodes WHERE id = ?").run(id)
      cachedStatement(this.db, "DELETE FROM knowledge_nodes_fts WHERE id = ?").run(id)
      return (res.changes ?? 0) > 0
    })
  }

  findNodes(filter?: NodeFilter): readonly KnowledgeNode[] {
    if (!this.noteProjection || !filter?.search) {
      return executeFindNodes(this.db, filter).map((node) => this.withProjectedBody(node))
    }
    const metadataMatches = executeFindNodes(this.db, { ...filter, limit: 100, offset: 0 })
    const noteMatches = this.noteProjection.searchIds(filter.search, 100).flatMap((id) => {
      const parsed = knowledgeNodeIdSchema.safeParse(id)
      if (!parsed.success) return []
      const note = this.getNode(parsed.data)
      return note ? [note] : []
    })
    const merged = new Map([...metadataMatches, ...noteMatches].map((node) => [node.id, node]))
    const offset = Math.max(0, filter.offset ?? 0)
    const limit = Math.min(100, Math.max(1, filter.limit ?? 50))
    return [...merged.values()]
      .filter((node) => !filter.kind || node.kind === filter.kind)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(offset, offset + limit)
  }

  private withProjectedBody(node: KnowledgeNode): KnowledgeNode {
    if (node.kind !== "note" || !this.noteProjection) return node
    const indexed = this.noteProjection.get(node.id)
    return indexed ? knowledgeNodeSchema.parse({ ...node, body: indexed.body }) : node
  }
}

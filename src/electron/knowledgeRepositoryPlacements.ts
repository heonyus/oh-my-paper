import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  type BoardId,
  type BoardRecord,
  boardIdSchema,
  boardRecordSchema,
  type ExternalMapping,
  externalMappingIdSchema,
  externalMappingSchema,
  type KnowledgeNodeId,
  knowledgeNodeIdSchema,
  type PlacementId,
  type PlacementRecord,
  placementIdSchema,
  placementRecordSchema,
} from "../shared/knowledgeSchemas"
import type { CreatePlacementInput, UpdatePlacementInput } from "../shared/knowledgeTypes"
import {
  boardRowSchema,
  externalMappingRowSchema,
  parseJsonSafe,
  placementRowSchema,
  rowToBoard,
  rowToPlacement,
} from "./knowledgeRepositoryRows"
import { cachedStatement } from "./knowledgeStatements"

export type CardPlacement = {
  readonly id: PlacementId
  readonly nodeId: KnowledgeNodeId
  readonly cardId: string | null
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number | null
  readonly minimized: boolean
}

const cardPlacementRowSchema = z.object({
  id: placementIdSchema,
  node_id: knowledgeNodeIdSchema,
  card_id: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number().nullable(),
  minimized: z.number(),
})

export class KnowledgePlacementOperations {
  constructor(private readonly db: DatabaseSync) {}

  listBoards(): readonly BoardRecord[] {
    const rawRows = cachedStatement(this.db, "SELECT * FROM boards ORDER BY created_at ASC").all()
    return rawRows.map((r) => rowToBoard(boardRowSchema.parse(r)))
  }

  createBoard(title: string, description = ""): BoardRecord {
    const board = boardRecordSchema.parse({
      id: boardIdSchema.parse(randomUUID()),
      title,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    cachedStatement(
      this.db,
      `
      INSERT INTO boards (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `,
    ).run(board.id, board.title, board.description, board.createdAt, board.updatedAt)
    return board
  }

  getBoard(id: BoardId): BoardRecord | null {
    const raw = cachedStatement(this.db, "SELECT * FROM boards WHERE id = ?").get(id)
    if (!raw) return null
    return rowToBoard(boardRowSchema.parse(raw))
  }

  getOrCreateDefaultBoard(): BoardRecord {
    const raw = cachedStatement(
      this.db,
      "SELECT * FROM boards ORDER BY created_at ASC LIMIT 1",
    ).get()
    if (raw) return rowToBoard(boardRowSchema.parse(raw))
    return this.createBoard("Default Board", "Main reading & research board")
  }

  createPlacement(input: CreatePlacementInput): PlacementRecord {
    const placement = placementRecordSchema.parse({
      id: input.id ?? placementIdSchema.parse(randomUUID()),
      boardId: input.boardId,
      nodeId: input.nodeId,
      cardId: input.cardId ?? null,
      x: input.x,
      y: input.y,
      width: input.width ?? 300,
      height: input.height ?? null,
      minimized: input.minimized ?? false,
      zIndex: input.zIndex ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    cachedStatement(
      this.db,
      `
      INSERT INTO placements (id, board_id, node_id, card_id, x, y, width, height, minimized, z_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      placement.id,
      placement.boardId,
      placement.nodeId,
      placement.cardId,
      placement.x,
      placement.y,
      placement.width,
      placement.height,
      placement.minimized ? 1 : 0,
      placement.zIndex,
      placement.createdAt,
      placement.updatedAt,
    )
    return placement
  }

  updatePlacement(input: UpdatePlacementInput): PlacementRecord {
    const existing = this.getPlacement(input.id)
    if (!existing) throw new Error(`Placement not found: ${input.id}`)

    const updated = placementRecordSchema.parse({
      ...existing,
      x: input.x ?? existing.x,
      y: input.y ?? existing.y,
      width: input.width ?? existing.width,
      height: input.height !== undefined ? input.height : existing.height,
      minimized: input.minimized ?? existing.minimized,
      zIndex: input.zIndex ?? existing.zIndex,
      updatedAt: new Date().toISOString(),
    })

    cachedStatement(
      this.db,
      `
      UPDATE placements
      SET x = ?, y = ?, width = ?, height = ?, minimized = ?, z_index = ?, updated_at = ?
      WHERE id = ?
    `,
    ).run(
      updated.x,
      updated.y,
      updated.width,
      updated.height,
      updated.minimized ? 1 : 0,
      updated.zIndex,
      updated.updatedAt,
      updated.id,
    )
    return updated
  }

  getPlacement(id: PlacementId): PlacementRecord | null {
    const raw = cachedStatement(this.db, "SELECT * FROM placements WHERE id = ?").get(id)
    if (!raw) return null
    return rowToPlacement(placementRowSchema.parse(raw))
  }

  deletePlacement(id: PlacementId): boolean {
    const res = cachedStatement(this.db, "DELETE FROM placements WHERE id = ?").run(id)
    return (res.changes ?? 0) > 0
  }

  findPlacementsForBoard(boardId: BoardId): readonly PlacementRecord[] {
    const rawRows = cachedStatement(
      this.db,
      "SELECT * FROM placements WHERE board_id = ? ORDER BY z_index ASC",
    ).all(boardId)
    return rawRows.map((r) => rowToPlacement(placementRowSchema.parse(r)))
  }

  /** The board's placements in `findPlacementsForBoard` order, with only what a save compares. */
  findCardPlacements(boardId: BoardId): readonly CardPlacement[] {
    const rawRows = cachedStatement(
      this.db,
      `SELECT id, node_id, card_id, x, y, width, height, minimized
       FROM placements WHERE board_id = ? ORDER BY z_index ASC`,
    ).all(boardId)
    return rawRows.map((raw) => {
      const row = cardPlacementRowSchema.parse(raw)
      return {
        id: row.id,
        nodeId: row.node_id,
        cardId: row.card_id,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        minimized: Boolean(row.minimized),
      }
    })
  }

  findPlacementsForNode(nodeId: KnowledgeNodeId): readonly PlacementRecord[] {
    const rawRows = cachedStatement(this.db, "SELECT * FROM placements WHERE node_id = ?").all(
      nodeId,
    )
    return rawRows.map((r) => rowToPlacement(placementRowSchema.parse(r)))
  }

  createExternalMapping(
    mapping: Omit<ExternalMapping, "id" | "createdAt"> & { id?: string; createdAt?: string },
  ): ExternalMapping {
    const id = externalMappingIdSchema.parse(mapping.id ?? randomUUID())
    const parsed = externalMappingSchema.parse({
      ...mapping,
      id,
      createdAt: mapping.createdAt ?? new Date().toISOString(),
    })

    cachedStatement(
      this.db,
      `
      INSERT INTO external_mappings (id, node_id, system, external_id, is_full_text_reviewed, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      parsed.id,
      parsed.nodeId,
      parsed.system,
      parsed.externalId,
      parsed.isFullTextReviewed ? 1 : 0,
      JSON.stringify(parsed.metadata),
      parsed.createdAt,
    )
    return parsed
  }

  getExternalMapping(system: string, externalId: string): ExternalMapping | null {
    const raw = cachedStatement(
      this.db,
      "SELECT * FROM external_mappings WHERE system = ? AND external_id = ?",
    ).get(system, externalId)
    if (!raw) return null
    const row = externalMappingRowSchema.parse(raw)
    return externalMappingSchema.parse({
      id: row.id,
      nodeId: row.node_id,
      system: row.system,
      externalId: row.external_id,
      isFullTextReviewed: Boolean(row.is_full_text_reviewed),
      metadata: parseJsonSafe(row.metadata_json),
      createdAt: row.created_at,
    })
  }
}

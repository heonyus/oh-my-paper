// @vitest-environment node
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  collectionManifestSchema,
  collectionRelativePathSchema,
  noteIdSchema,
} from "../../../src/shared/collectionSchemas"

describe("collection schemas", () => {
  it("parses the current portable manifest and distinct note identity", () => {
    const collectionId = randomUUID()
    const noteId = randomUUID()

    expect(
      collectionManifestSchema.parse({
        format: "scourgify-collection",
        schemaVersion: 1,
        collectionId,
      }),
    ).toEqual({ format: "scourgify-collection", schemaVersion: 1, collectionId })
    expect(noteIdSchema.parse(noteId)).toBe(noteId)
  })

  it.each(["../outside.md", "/tmp/outside.md", "notes/../../outside.md", "notes\\x.md"])(
    "rejects unsafe portable path %s",
    (path) => {
      expect(collectionRelativePathSchema.safeParse(path).success).toBe(false)
    },
  )
})

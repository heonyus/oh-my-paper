import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  AccountCollectionRegistry,
  AccountCollectionRegistryError,
} from "../../../src/electron/accountCollectionRegistry"
import { accountIdSchema } from "../../../src/shared/accountSchemas"
import { collectionIdSchema } from "../../../src/shared/collectionSchemas"

const roots: string[] = []
const accountA = accountIdSchema.parse("7efde20f-22e4-4ac8-93e0-b441421589c1")
const accountB = accountIdSchema.parse("fbcd2de7-4ae8-4d93-83cd-e2134e6a2a0a")
const collectionA = collectionIdSchema.parse("32951f92-4b19-4e24-9df0-55bbef20a07c")
const collectionB = collectionIdSchema.parse("b6116621-1aa9-43bc-84f1-c49f630e164b")

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-account-registry-"))
  roots.push(root)
  let current = collectionA
  let failTarget: string | null = null
  const principals: (typeof accountA)[] = []
  const switchStore = async (
    collectionRoot: string,
    _indexFile: string,
    accountId: typeof accountA,
  ): Promise<void> => {
    principals.push(accountId)
    const next = basename(dirname(collectionRoot))
    current = collectionIdSchema.parse(next)
    if (next === failTarget) throw new Error("switch failed")
  }
  const registry = new AccountCollectionRegistry(
    root,
    () => ({ collectionService: { files: { manifest: { collectionId: current } } } }),
    switchStore,
  )
  return {
    root,
    registry,
    current: () => current,
    principals,
    select: (collectionId: typeof collectionA) => {
      current = collectionId
    },
    fail: (collectionId: typeof collectionA) => {
      failTarget = collectionId
    },
  }
}

describe("account collection registry", () => {
  it("binds a first unowned collection and rejects reassignment", async () => {
    const app = await harness()
    await app.registry.bindUnownedToAccount(accountA)

    await expect(app.registry.currentAccountId()).resolves.toBe(accountA)
    await expect(app.registry.bindUnownedToAccount(accountB)).rejects.toEqual(
      new AccountCollectionRegistryError("owner_conflict"),
    )
  })

  it("switches to the account preferred collection and updates the pointer last", async () => {
    const app = await harness()
    await app.registry.bindUnownedToAccount(accountA)
    app.select(collectionB)
    await app.registry.bindUnownedToAccount(accountB)
    app.select(collectionA)

    await app.registry.openForAccount(accountB, "open_existing_for_account")

    expect(app.current()).toBe(collectionB)
    expect(app.principals).toEqual([accountB])
    expect(JSON.parse(await readFile(join(app.root, "active-collection.json"), "utf8"))).toEqual({
      schemaVersion: 1,
      collectionId: collectionB,
    })
  })

  it("restores the prior registry and store when switching fails", async () => {
    const app = await harness()
    await app.registry.bindUnownedToAccount(accountA)
    app.select(collectionB)
    await app.registry.bindUnownedToAccount(accountB)
    app.select(collectionA)
    await mkdir(app.root, { recursive: true })
    const pointer = JSON.stringify({ schemaVersion: 1, collectionId: collectionA })
    await writeFile(join(app.root, "active-collection.json"), pointer)
    app.fail(collectionB)

    await expect(
      app.registry.openForAccount(accountB, "open_existing_for_account"),
    ).rejects.toThrow("switch failed")
    expect(app.current()).toBe(collectionA)
    expect(app.principals).toEqual([accountB, accountA])
    expect(await readFile(join(app.root, "active-collection.json"), "utf8")).toBe(pointer)
    await expect(app.registry.currentAccountId()).resolves.toBe(accountA)
  })
})

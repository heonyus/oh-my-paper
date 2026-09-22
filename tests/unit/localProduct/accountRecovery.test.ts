import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  AccountDirtySaveListener,
  AccountIpcListener,
  AccountIpcRegistrar,
} from "../../../src/electron/accountGate"
import {
  AccountRecoveryError,
  AccountRecoveryStore,
} from "../../../src/electron/accountRecoveryStore"
import { registerAccountRecoveryIpc } from "../../../src/electron/registerAccountRecoveryIpc"
import {
  accountRecoveryDraftSchema,
  accountRecoveryEntrySchema,
  accountRecoveryListChannel,
  accountRecoveryReadChannel,
  accountRecoveryRecordSchema,
} from "../../../src/shared/accountIpc"
import { accountIdSchema } from "../../../src/shared/accountSchemas"

const roots: string[] = []
const accountId = accountIdSchema.parse("7efde20f-22e4-4ac8-93e0-b441421589c1")
const otherAccountId = accountIdSchema.parse("fbcd2de7-4ae8-4d93-83cd-e2134e6a2a0a")
const draft = accountRecoveryDraftSchema.parse({
  nodeId: "b6116621-1aa9-43bc-84f1-c49f630e164b",
  title: "Unsaved note",
  body: "retained editor bytes",
  expectedBody: "previous bytes",
  aliases: [],
  capturedAt: "2026-09-06T00:00:00.000Z",
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("account recovery IPC", () => {
  it("writes a new recovery-only file below the captured account and node", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-account-recovery-"))
    roots.push(root)
    const listeners: AccountDirtySaveListener[] = []
    const handlers = new Map<string, AccountIpcListener>()
    const capturedAccountId = vi.fn(async () => accountId)
    const ipc: AccountIpcRegistrar = {
      handle: (channel, listener) => {
        handlers.set(channel, listener)
      },
      handlePublic: vi.fn(),
      handleDirtySave: (_channel, _account, next) => {
        listeners.push(next)
      },
      removeHandler: vi.fn(),
    }
    registerAccountRecoveryIpc(ipc, root, capturedAccountId)
    const listener = listeners[0]
    if (!listener) throw new Error("recovery listener was not registered")

    await listener(Object.create(null), accountId, draft)

    const directory = join(root, accountId, draft.nodeId)
    const files = await readdir(directory)
    expect(files).toHaveLength(1)
    expect(
      accountRecoveryRecordSchema.parse(
        JSON.parse(await readFile(join(directory, files[0] ?? ""), "utf8")),
      ).draft,
    ).toEqual(draft)
    const list = handlers.get(accountRecoveryListChannel)
    const read = handlers.get(accountRecoveryReadChannel)
    if (!list || !read) throw new Error("recovery read handlers were not registered")
    const entries = accountRecoveryEntrySchema
      .array()
      .parse(await list(Object.create(null), { limit: 1 }))
    const entry = entries[0]?.recoveryId
    if (!entry) throw new Error("saved recovery was not listed")
    await expect(
      read(Object.create(null), { nodeId: draft.nodeId, recoveryId: entry }),
    ).resolves.toMatchObject({ draft })
    expect(capturedAccountId).toHaveBeenCalledTimes(2)
  })

  it("lists a bounded set and restores bytes only for the same account", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-account-recovery-"))
    roots.push(root)
    const store = new AccountRecoveryStore(root)
    const first = await store.save(accountId, draft)
    await store.save(accountId, { ...draft, capturedAt: "2026-09-06T00:01:00.000Z" })
    await store.save(accountId, { ...draft, capturedAt: "2026-09-06T00:02:00.000Z" })

    await expect(store.list(accountId, { limit: 2 })).resolves.toHaveLength(2)
    await expect(
      store.read(accountId, { nodeId: draft.nodeId, recoveryId: first.recoveryId }),
    ).resolves.toMatchObject({ draft })
    await expect(
      store.read(otherAccountId, { nodeId: draft.nodeId, recoveryId: first.recoveryId }),
    ).rejects.toEqual(new AccountRecoveryError("not_found"))
  })

  it("rejects a symlinked account directory before creating node directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-account-recovery-"))
    const outside = await mkdtemp(join(tmpdir(), "ohmypaper-account-recovery-outside-"))
    roots.push(root, outside)
    await symlink(outside, join(root, accountId))
    const store = new AccountRecoveryStore(root)

    await expect(store.save(accountId, draft)).rejects.toEqual(
      new AccountRecoveryError("invalid_storage"),
    )
    await expect(readdir(outside)).resolves.toEqual([])
  })

  it("durably stores a schema-valid maximum multibyte draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-account-recovery-"))
    roots.push(root)
    const store = new AccountRecoveryStore(root)
    const largeDraft = accountRecoveryDraftSchema.parse({
      ...draft,
      body: "한".repeat(2_000_000),
      expectedBody: "글".repeat(2_000_000),
    })

    const saved = await store.save(accountId, largeDraft)
    await expect(
      store.read(accountId, { nodeId: draft.nodeId, recoveryId: saved.recoveryId }),
    ).resolves.toMatchObject({ draft: largeDraft })
  })
})

import { constants } from "node:fs"
import { lstat, mkdir, open, opendir, realpath } from "node:fs/promises"
import { basename, join } from "node:path"
import { z } from "zod"
import {
  type AccountRecoveryDraft,
  type AccountRecoveryEntry,
  type AccountRecoveryReadRequest,
  type AccountRecoveryRecord,
  accountRecoveryDraftSchema,
  accountRecoveryEntrySchema,
  accountRecoveryIdSchema,
  accountRecoveryListQuerySchema,
  accountRecoveryReadRequestSchema,
  accountRecoveryRecordByteLimit,
  accountRecoveryRecordSchema,
} from "../shared/accountIpc"
import { type AccountId, accountIdSchema } from "../shared/accountSchemas"
import { knowledgeNodeIdSchema } from "../shared/knowledgeSchemas"
import { replaceDurably } from "./collectionJournal"

const MAX_NODE_DIRECTORIES = 256
const MAX_FILE_ENTRIES = 512
type Candidate = {
  readonly nodeId: AccountRecoveryReadRequest["nodeId"]
  readonly recoveryId: AccountRecoveryReadRequest["recoveryId"]
  readonly modifiedAt: number
  readonly bytes: number
}

export class AccountRecoveryError extends Error {
  readonly name = "AccountRecoveryError"
  constructor(readonly kind: "invalid_storage" | "not_found" | "too_large") {
    super(kind)
  }
}

export class AccountRecoveryStore {
  constructor(readonly root: string) {}

  async save(accountIdValue: AccountId, draftValue: AccountRecoveryDraft) {
    const accountId = accountIdSchema.parse(accountIdValue)
    const draft = accountRecoveryDraftSchema.parse(draftValue)
    const recoveryId = accountRecoveryIdSchema.parse(crypto.randomUUID())
    const directory = await secureDirectory(this.root, [accountId, draft.nodeId], true)
    const record = accountRecoveryRecordSchema.parse({ recoveryId, draft })
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
    if (bytes.byteLength > accountRecoveryRecordByteLimit) {
      throw new AccountRecoveryError("too_large")
    }
    await replaceDurably(join(directory, `${recoveryId}.json`), bytes)
    return entryOf(record, bytes.byteLength)
  }

  async list(
    accountIdValue: AccountId,
    queryValue: unknown,
  ): Promise<readonly AccountRecoveryEntry[]> {
    const accountId = accountIdSchema.parse(accountIdValue)
    const query = accountRecoveryListQuerySchema.parse(queryValue)
    const candidates = await this.candidates(accountId)
    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
    const entries: AccountRecoveryEntry[] = []
    for (const candidate of candidates.slice(0, query.limit)) {
      const record = await this.read(accountId, {
        nodeId: candidate.nodeId,
        recoveryId: candidate.recoveryId,
      })
      entries.push(entryOf(record, candidate.bytes))
    }
    return entries
  }

  async read(
    accountIdValue: AccountId,
    requestValue: AccountRecoveryReadRequest,
  ): Promise<AccountRecoveryRecord> {
    const accountId = accountIdSchema.parse(accountIdValue)
    const request = accountRecoveryReadRequestSchema.parse(requestValue)
    const directory = await secureDirectory(this.root, [accountId, request.nodeId], false)
    const file = join(directory, `${request.recoveryId}.json`)
    let handle: Awaited<ReturnType<typeof open>> | null = null
    try {
      if (!(await lstat(file)).isFile()) throw new AccountRecoveryError("not_found")
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
      const buffer = Buffer.alloc(accountRecoveryRecordByteLimit + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0)
      if (bytesRead > accountRecoveryRecordByteLimit) {
        throw new AccountRecoveryError("too_large")
      }
      const record = accountRecoveryRecordSchema.parse(
        JSON.parse(buffer.subarray(0, bytesRead).toString()),
      )
      if (record.recoveryId !== request.recoveryId || record.draft.nodeId !== request.nodeId) {
        throw new AccountRecoveryError("invalid_storage")
      }
      return record
    } catch (error) {
      if (error instanceof AccountRecoveryError) throw error
      if (isMissing(error)) throw new AccountRecoveryError("not_found")
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        throw new AccountRecoveryError("invalid_storage")
      }
      throw error
    } finally {
      await handle?.close()
    }
  }

  private async candidates(accountId: AccountId): Promise<Candidate[]> {
    let accountDirectory: string
    try {
      accountDirectory = await secureDirectory(this.root, [accountId], false)
    } catch (error) {
      if (error instanceof AccountRecoveryError && error.kind === "not_found") return []
      throw error
    }
    const candidates: Candidate[] = []
    let scannedAccountEntries = 0
    let scannedFiles = 0
    for await (const nodeEntry of await opendir(accountDirectory)) {
      if (scannedAccountEntries >= MAX_NODE_DIRECTORIES || scannedFiles >= MAX_FILE_ENTRIES) break
      scannedAccountEntries += 1
      if (!nodeEntry.isDirectory()) continue
      const node = knowledgeNodeIdSchema.safeParse(nodeEntry.name)
      if (!node.success) continue
      const nodeDirectory = await secureDirectory(this.root, [accountId, node.data], false)
      for await (const fileEntry of await opendir(nodeDirectory)) {
        if (scannedFiles >= MAX_FILE_ENTRIES) break
        scannedFiles += 1
        if (!fileEntry.isFile()) continue
        if (!fileEntry.name.endsWith(".json")) continue
        const recoveryId = accountRecoveryIdSchema.safeParse(basename(fileEntry.name, ".json"))
        if (!recoveryId.success) continue
        const metadata = await lstat(join(nodeDirectory, fileEntry.name))
        if (metadata.size > accountRecoveryRecordByteLimit) continue
        candidates.push({
          nodeId: node.data,
          recoveryId: recoveryId.data,
          modifiedAt: metadata.mtimeMs,
          bytes: metadata.size,
        })
      }
    }
    return candidates
  }
}

function entryOf(record: AccountRecoveryRecord, bytes: number): AccountRecoveryEntry {
  return accountRecoveryEntrySchema.parse({
    recoveryId: record.recoveryId,
    nodeId: record.draft.nodeId,
    title: record.draft.title,
    capturedAt: record.draft.capturedAt,
    bytes,
  })
}

async function secureDirectory(root: string, segments: readonly string[], create: boolean) {
  if (create) await mkdir(root, { recursive: true, mode: 0o700 })
  let directory: string
  try {
    const rootMetadata = await lstat(root)
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
      throw new AccountRecoveryError("invalid_storage")
    }
    directory = await realpath(root)
  } catch (error) {
    if (error instanceof AccountRecoveryError) throw error
    if (isMissing(error)) throw new AccountRecoveryError("not_found")
    throw error
  }
  for (const segment of segments) {
    const next = join(directory, segment)
    try {
      const metadata = await lstat(next)
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new AccountRecoveryError("invalid_storage")
      }
    } catch (error) {
      if (!isMissing(error) || !create) {
        if (error instanceof AccountRecoveryError) throw error
        if (isMissing(error)) throw new AccountRecoveryError("not_found")
        throw error
      }
      await mkdir(next, { mode: 0o700 })
    }
    if ((await realpath(next)) !== next) throw new AccountRecoveryError("invalid_storage")
    directory = next
  }
  return directory
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

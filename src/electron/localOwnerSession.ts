import { randomUUID } from "node:crypto"
import { mkdir, open, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import {
  type AccountId,
  type AccountStatus,
  accountIdSchema,
  accountStatusSchema,
} from "../shared/accountSchemas"
import {
  type AccountAuthorization,
  AccountAuthorizationError,
  type AccountSessionController,
} from "./accountSessionTypes"

export const LOCAL_ACCESS_FILE_MAX_BYTES = 4 * 1_024

const localOwnerAccessSchema = z
  .object({ version: z.literal(1), mode: z.literal("local"), accountId: accountIdSchema })
  .strict()

export type LocalOwnerAccess = z.infer<typeof localOwnerAccessSchema>

export class LocalOwnerAccessError extends Error {
  readonly name = "LocalOwnerAccessError"

  constructor(readonly kind: "malformed" | "oversized" | "unreadable") {
    super(kind)
  }
}

export class LocalOwnerSessionError extends Error {
  readonly name = "LocalOwnerSessionError"

  constructor(readonly kind: "remote_grant" | "switch_collection" | "logout") {
    super(kind)
  }
}

export async function readLocalOwnerAccess(userDataRoot: string): Promise<LocalOwnerAccess | null> {
  const filePath = join(userDataRoot, "local-access.json")
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(filePath, "r")
    const buffer = Buffer.alloc(LOCAL_ACCESS_FILE_MAX_BYTES + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0)
    if (bytesRead > LOCAL_ACCESS_FILE_MAX_BYTES) {
      throw new LocalOwnerAccessError("oversized")
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead))
    return localOwnerAccessSchema.parse(JSON.parse(text))
  } catch (error) {
    if (isFileError(error, "ENOENT")) return null
    if (error instanceof LocalOwnerAccessError) throw error
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof z.ZodError) {
      throw new LocalOwnerAccessError("malformed")
    }
    if (error instanceof Error && "code" in error) {
      throw new LocalOwnerAccessError("unreadable")
    }
    throw error
  } finally {
    await handle?.close()
  }
}

export async function ensureLocalOwnerAccess(userDataRoot: string): Promise<LocalOwnerAccess> {
  const existing = await readLocalOwnerAccess(userDataRoot)
  if (existing) return existing
  const accountId = accountIdSchema.parse(randomUUID())
  const access: LocalOwnerAccess = { version: 1, mode: "local", accountId }
  const filePath = join(userDataRoot, "local-access.json")
  await mkdir(userDataRoot, { recursive: true, mode: 0o700 })
  await writeFile(filePath, `${JSON.stringify(access, null, 2)}\n`, { mode: 0o600 })
  return access
}

export function createLocalOwnerSession(
  accountIdValue: AccountId,
  onStatusChanged?: (status: AccountStatus) => void,
): AccountSessionController {
  const accountId = accountIdSchema.parse(accountIdValue)
  const status = (): AccountStatus => accountStatusSchema.parse({ state: "local", accountId })
  const publish = (): AccountStatus => {
    const localStatus = status()
    onStatusChanged?.(localStatus)
    return localStatus
  }
  return {
    initialize: async () => publish(),
    status,
    acceptGrant: async () => {
      throw new LocalOwnerSessionError("remote_grant")
    },
    refresh: async () => status(),
    logout: async () => {
      throw new LocalOwnerSessionError("logout")
    },
    switchCollection: async () => {
      throw new LocalOwnerSessionError("switch_collection")
    },
    authorize: async (authorization: AccountAuthorization = { kind: "protected" }) => {
      switch (authorization.kind) {
        case "protected":
          return
        case "dirty_save":
          if (authorization.accountId === accountId) return
          throw new AccountAuthorizationError("locked")
        default:
          return assertNever(authorization)
      }
    },
  }
}

function isFileError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

function assertNever(value: never): never {
  return value
}

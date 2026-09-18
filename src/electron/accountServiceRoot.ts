import { mkdir, open, readFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { z } from "zod"
import {
  type AccountId,
  type AccountStatus,
  accountIdSchema,
  accountStatusSchema,
} from "../shared/accountSchemas"

const legacyOwnerSchema = z.object({ version: z.literal(1), accountId: accountIdSchema }).strict()

export type AccountServiceRoot = {
  readonly accountId: AccountId
  readonly kind: "isolated" | "legacy" | "local"
  readonly root: string
}

export function accountRemountRequiresReload(
  currentAccountId: AccountId | null,
  nextAccountId: AccountId,
  collectionChanged: boolean,
): boolean {
  return collectionChanged || (currentAccountId !== null && currentAccountId !== nextAccountId)
}

export class AccountServiceRootError extends Error {
  readonly name = "AccountServiceRootError"
  constructor(readonly kind: "legacy_missing" | "legacy_owner_conflict" | "registry_corrupt") {
    super(kind)
  }
}

export async function resolveAccountServiceRoot(
  userDataRoot: string,
  statusValue: AccountStatus,
): Promise<AccountServiceRoot | null> {
  const status = accountStatusSchema.parse(statusValue)
  if (status.state === "local") {
    return {
      accountId: status.accountId,
      kind: "local",
      root: join(userDataRoot, "scourgify"),
    }
  }
  const accountId = serviceAccountId(status)
  if (!accountId) return null
  return resolveAccountServiceRootForAccount(userDataRoot, accountId)
}

export async function resolveAccountServiceRootForAccount(
  userDataRoot: string,
  accountIdValue: AccountId,
): Promise<AccountServiceRoot> {
  const accountId = accountIdSchema.parse(accountIdValue)
  const legacyOwner = await readLegacyOwner(userDataRoot)
  if (legacyOwner === accountId) {
    return { accountId, kind: "legacy", root: join(userDataRoot, "scourgify") }
  }
  const root = join(userDataRoot, "account", "services", accountId)
  await mkdir(root, { recursive: true, mode: 0o700 })
  return { accountId, kind: "isolated", root }
}

export async function resolveUnboundServiceRoot(userDataRoot: string): Promise<string> {
  const root = join(userDataRoot, "account", "services", "unbound")
  await mkdir(root, { recursive: true, mode: 0o700 })
  return root
}

export async function bindLegacyAccountServiceRoot(
  userDataRoot: string,
  accountIdValue: AccountId,
): Promise<void> {
  const accountId = accountIdSchema.parse(accountIdValue)
  const legacyRoot = join(userDataRoot, "scourgify")
  try {
    if (!(await stat(legacyRoot)).isDirectory()) throw new AccountServiceRootError("legacy_missing")
  } catch (error) {
    if (error instanceof AccountServiceRootError) throw error
    if (isFileError(error, "ENOENT")) throw new AccountServiceRootError("legacy_missing")
    throw error
  }
  const ownerFile = legacyOwnerFile(userDataRoot)
  await mkdir(dirname(ownerFile), { recursive: true, mode: 0o700 })
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(ownerFile, "wx", 0o600)
    await handle.writeFile(
      `${JSON.stringify(legacyOwnerSchema.parse({ version: 1, accountId }))}\n`,
    )
    await handle.sync()
  } catch (error) {
    if (!isFileError(error, "EEXIST")) throw error
    const owner = await readLegacyOwner(userDataRoot)
    if (owner !== accountId) throw new AccountServiceRootError("legacy_owner_conflict")
  } finally {
    await handle?.close()
  }
}

function serviceAccountId(status: AccountStatus): AccountId | null {
  switch (status.state) {
    case "local":
      return status.accountId
    case "authenticated":
      return status.account.id
    case "locked":
      return status.dirtySaveAccountId
    case "switch_required":
      return status.currentAccountId
    case "credentials_needed":
    case "signed_out":
      return null
    default:
      return assertNever(status)
  }
}

async function readLegacyOwner(userDataRoot: string): Promise<AccountId | null> {
  try {
    const value = legacyOwnerSchema.parse(
      JSON.parse(await readFile(legacyOwnerFile(userDataRoot), "utf8")),
    )
    return value.accountId
  } catch (error) {
    if (isFileError(error, "ENOENT")) return null
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new AccountServiceRootError("registry_corrupt")
    }
    throw error
  }
}

function legacyOwnerFile(userDataRoot: string): string {
  return join(userDataRoot, "account", "legacy-service-owner.json")
}

function isFileError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

function assertNever(value: never): never {
  return value
}

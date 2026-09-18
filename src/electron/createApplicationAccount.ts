import { join } from "node:path"
import type { AccountId, AccountStatus } from "../shared/accountSchemas"
import { AccountCollectionRegistry } from "./accountCollectionRegistry"
import { AccountCredentialStore } from "./accountCredentials"
import { AccountSession } from "./accountSession"
import { type AccountSessionController, unavailableAccountSession } from "./accountSessionTypes"
import { createAccountTransport, parseAccountClientConfig } from "./accountTransport"
import { GoogleLogin } from "./googleLogin"
import {
  createLocalOwnerSession,
  ensureLocalOwnerAccess,
  readLocalOwnerAccess,
} from "./localOwnerSession"
import type { WorkspaceStore } from "./workspaceStore"

export type CreateApplicationAccountOptions = {
  readonly userDataRoot: string
  readonly getStore: () => WorkspaceStore | null
  readonly switchStore: (
    collectionRoot: string,
    indexFile: string,
    accountId: AccountId,
  ) => Promise<void>
  readonly prepareAuthenticatedAccount?: (accountId: AccountId) => Promise<void>
  readonly onStatusChanged: (status: AccountStatus) => void
}

export type ApplicationAccount = {
  readonly session: AccountSessionController
  readonly login: GoogleLogin | null
  readonly dispose: () => Promise<void>
}

export async function createApplicationAccount(
  options: CreateApplicationAccountOptions,
): Promise<ApplicationAccount> {
  let localAccess = await readLocalOwnerAccess(options.userDataRoot)
  if (!localAccess) {
    try {
      localAccess = await ensureLocalOwnerAccess(options.userDataRoot)
    } catch {
      // Allow fallback if directory is read-only or in virtual test harness
    }
  }
  if (localAccess) {
    const session = createLocalOwnerSession(localAccess.accountId, options.onStatusChanged)
    await session.initialize()
    return { session, login: null, dispose: async () => undefined }
  }
  const config = configuredAccountClient()
  if (!config) return unavailableAccount(options.onStatusChanged)
  const registry = new AccountCollectionRegistry(
    options.userDataRoot,
    options.getStore,
    (collectionRoot, indexFile, accountId) =>
      options.switchStore(collectionRoot, indexFile, accountId),
  )
  const transport = createAccountTransport(config)
  const prepare = options.prepareAuthenticatedAccount
    ? { prepareAuthenticatedAccount: options.prepareAuthenticatedAccount }
    : {}
  const session = new AccountSession({
    credentials: new AccountCredentialStore(join(options.userDataRoot, "account")),
    transport,
    issuer: config.issuer,
    collectionSwitch: registry,
    ...prepare,
    onStatusChanged: options.onStatusChanged,
  })
  const login = new GoogleLogin(config, transport)
  await session.initialize()
  return {
    session,
    login,
    dispose: async () => {
      login.cancel()
      await registry.dispose()
    },
  }
}

function configuredAccountClient() {
  const {
    SCOURGIFY_ACCOUNT_SERVICE_ORIGIN: serviceOrigin,
    SCOURGIFY_ACCOUNT_ISSUER: issuer,
    SCOURGIFY_GOOGLE_CLIENT_ID: googleClientId,
  } = process.env
  if (!serviceOrigin || !issuer || !googleClientId) return null
  try {
    return parseAccountClientConfig({ serviceOrigin, issuer, googleClientId })
  } catch {
    return null
  }
}

function unavailableAccount(onStatusChanged: (status: AccountStatus) => void): ApplicationAccount {
  const session = unavailableAccountSession("service_not_configured")
  onStatusChanged(session.status())
  return { session, login: null, dispose: async () => undefined }
}

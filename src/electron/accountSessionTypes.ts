import type {
  AccountCredentialVault,
  AccountId,
  AccountRefreshTrigger,
  AccountSessionGrant,
  AccountStatus,
  CollectionSwitchChoice,
} from "../shared/accountSchemas"
import { accountStatusSchema } from "../shared/accountSchemas"
import type { AccountCredentialPersistence } from "./accountCredentials"
import type { AccountTransport } from "./accountTransport"

export class AccountAuthorizationError extends Error {
  readonly name = "AccountAuthorizationError"
  constructor(readonly kind: "credentials_needed" | "locked" | "switch_required") {
    super(kind)
  }
}

export type AccountLockReason = "expired" | "clock_rollback" | "revoked"

export type AccountAuthorization =
  | { readonly kind: "protected" }
  | { readonly kind: "dirty_save"; readonly accountId: AccountId }

export type CollectionAccountSwitch = {
  readonly currentAccountId: () => Promise<AccountId | null>
  readonly bindUnownedToAccount: (accountId: AccountId) => Promise<void>
  readonly openForAccount: (
    accountId: AccountId,
    choice: Exclude<CollectionSwitchChoice, "cancel">,
  ) => Promise<void>
}

export type AccountSessionController = {
  readonly initialize: () => Promise<AccountStatus>
  readonly status: () => AccountStatus
  readonly acceptGrant: (grant: AccountSessionGrant) => Promise<AccountStatus>
  readonly refresh: (trigger: AccountRefreshTrigger) => Promise<AccountStatus>
  readonly logout: () => Promise<void>
  readonly switchCollection: (choice: CollectionSwitchChoice) => Promise<AccountStatus>
  readonly authorize: (authorization?: AccountAuthorization) => Promise<void>
}

export type AccountSessionOptions = {
  readonly credentials: AccountCredentialPersistence
  readonly transport: AccountTransport
  readonly issuer: string
  readonly clock?: () => number
  readonly collectionSwitch: CollectionAccountSwitch
  readonly prepareAuthenticatedAccount?: (accountId: AccountId) => Promise<void>
  readonly onStatusChanged?: (status: AccountStatus) => void
}

export function emptyAccountVault(): AccountCredentialVault {
  return { version: 1, active: null, lastTrustedTime: 0, revokedSessionIds: [] }
}

export function unavailableAccountSession(
  reason: "service_not_configured" | "keychain_unavailable",
): AccountSessionController {
  const status = accountStatusSchema.parse({ state: "credentials_needed", reason })
  const deny = async (): Promise<never> => {
    throw new AccountAuthorizationError("credentials_needed")
  }
  return {
    initialize: async () => status,
    status: () => status,
    acceptGrant: deny,
    refresh: deny,
    logout: deny,
    switchCollection: deny,
    authorize: deny,
  }
}

import type {
  AccountId,
  AccountSessionGrant,
  AccountSessionId,
  AccountStatus,
} from "../shared/accountSchemas"
import { AccountJwtError, type VerifiedAccountGrant } from "./accountJwt"
import type { CollectionAccountSwitch } from "./accountSessionTypes"

export async function restoreAccountGrant(input: {
  readonly grant: AccountSessionGrant
  readonly revokedSessionIds: readonly AccountSessionId[]
  readonly now: number
  readonly collectionSwitch: CollectionAccountSwitch
  readonly verify: () => Promise<VerifiedAccountGrant>
  readonly prepareAuthenticatedAccount: ((accountId: AccountId) => Promise<void>) | undefined
}): Promise<AccountStatus> {
  try {
    const verified = await input.verify()
    if (input.revokedSessionIds.includes(verified.sessionId)) {
      return {
        state: "locked",
        reason: "revoked",
        dirtySaveAccountId: input.grant.account.id,
      }
    }
    if (input.grant.offlineLeaseExpiresAt <= input.now) {
      return {
        state: "locked",
        reason: "expired",
        dirtySaveAccountId: input.grant.account.id,
      }
    }
    const currentAccountId = await input.collectionSwitch.currentAccountId()
    if (!currentAccountId) {
      await input.collectionSwitch.bindUnownedToAccount(input.grant.account.id)
    } else if (currentAccountId !== input.grant.account.id) {
      return {
        state: "switch_required",
        currentAccountId,
        nextAccount: input.grant.account,
      }
    }
    await input.prepareAuthenticatedAccount?.(input.grant.account.id)
    return {
      state: "authenticated",
      account: input.grant.account,
      connection: "offline",
      offlineLeaseExpiresAt: input.grant.offlineLeaseExpiresAt,
    }
  } catch (error) {
    if (error instanceof AccountJwtError) {
      return { state: "credentials_needed", reason: "credential_corrupt" }
    }
    throw error
  }
}

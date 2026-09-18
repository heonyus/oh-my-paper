import {
  type AccountCredentialVault,
  type AccountId,
  type AccountRefreshTrigger,
  type AccountSessionGrant,
  type AccountStatus,
  accountStatusSchema,
  type CollectionSwitchChoice,
  collectionSwitchChoiceSchema,
} from "../shared/accountSchemas"
import { AccountCredentialError } from "./accountCredentials"
import type { VerifiedAccountGrant } from "./accountJwt"
import { verifyAccountSessionGrant } from "./accountJwt"
import { renewAccountGrant } from "./accountSessionRenewal"
import { restoreAccountGrant } from "./accountSessionRestore"
import {
  type AccountAuthorization,
  AccountAuthorizationError,
  type AccountLockReason,
  type AccountSessionController,
  type AccountSessionOptions,
  emptyAccountVault,
} from "./accountSessionTypes"
import { AccountTransportError } from "./accountTransport"

const MATERIAL_CLOCK_ROLLBACK_SECONDS = 5 * 60

export class AccountSession implements AccountSessionController {
  readonly #clock: () => number
  #vault: AccountCredentialVault = emptyAccountVault()
  #status: AccountStatus = { state: "signed_out" }
  #pendingGrant: AccountSessionGrant | null = null
  #statusBeforeSwitch: AccountStatus = { state: "signed_out" }
  #maxObservedTime = 0

  constructor(private readonly options: AccountSessionOptions) {
    this.#clock = options.clock ?? (() => Math.floor(Date.now() / 1_000))
  }

  async initialize(): Promise<AccountStatus> {
    if (!(await this.options.credentials.available())) {
      return this.setStatus({ state: "credentials_needed", reason: "keychain_unavailable" })
    }
    try {
      this.#vault = (await this.options.credentials.load()) ?? emptyAccountVault()
    } catch (error) {
      if (error instanceof AccountCredentialError) {
        return this.setStatus({
          state: "credentials_needed",
          reason: error.kind === "keychain_unavailable" ? error.kind : "credential_corrupt",
        })
      }
      throw error
    }
    this.#maxObservedTime = Math.max(this.#clock(), this.#vault.lastTrustedTime)
    if (!this.#vault.active) return this.setStatus({ state: "signed_out" })
    if (this.clockRolledBack()) {
      return this.lock("clock_rollback", this.#vault.active.account.id)
    }
    return this.restore(this.#vault.active)
  }

  status(): AccountStatus {
    return accountStatusSchema.parse(this.#status)
  }

  async acceptGrant(grant: AccountSessionGrant): Promise<AccountStatus> {
    const verified = await this.verifyGrant(grant)
    if (this.#vault.revokedSessionIds.includes(verified.sessionId)) {
      return this.lock("revoked", grant.account.id)
    }
    const currentAccountId = await this.options.collectionSwitch.currentAccountId()
    if (!currentAccountId) return this.activate(grant, verified, "online", true)
    if (currentAccountId && currentAccountId !== grant.account.id) {
      this.#pendingGrant = grant
      this.#statusBeforeSwitch = this.#status
      return this.setStatus({
        state: "switch_required",
        currentAccountId,
        nextAccount: grant.account,
      })
    }
    return this.activate(grant, verified, "online", false)
  }

  async refresh(triggerValue: AccountRefreshTrigger): Promise<AccountStatus> {
    const current = await this.activeVerified()
    const outcome = await renewAccountGrant({
      trigger: triggerValue,
      current,
      now: this.#clock(),
      transport: this.options.transport,
      verify: (grant) => this.verifyGrant(grant),
    })
    if (outcome.kind === "current") return this.status()
    if (outcome.kind === "renewed") {
      return this.activate(outcome.grant, outcome.verified, "online", false)
    }
    if (outcome.kind === "revoked") {
      return this.revoke(current.verified.sessionId, current.grant.account.id)
    }
    return this.setStatus({
      state: "authenticated",
      account: current.grant.account,
      connection: "offline",
      offlineLeaseExpiresAt: current.grant.offlineLeaseExpiresAt,
    })
  }

  async logout(): Promise<void> {
    const active = this.#vault.active
    if (!active) {
      this.setStatus({ state: "signed_out" })
      return
    }
    const verified = await this.verifyGrant(active)
    let transportError: AccountTransportError | null = null
    try {
      await this.options.transport.logout(active.renewalToken)
    } catch (error) {
      if (error instanceof AccountTransportError) transportError = error
      else throw error
    }
    await this.persistRevoked(verified.sessionId)
    this.setStatus({ state: "locked", reason: "revoked", dirtySaveAccountId: active.account.id })
    if (transportError) throw transportError
  }

  async switchCollection(choiceValue: CollectionSwitchChoice): Promise<AccountStatus> {
    const choice = collectionSwitchChoiceSchema.parse(choiceValue)
    const pending = this.#pendingGrant
    if (!pending || this.#status.state !== "switch_required") {
      throw new AccountAuthorizationError("switch_required")
    }
    if (choice === "cancel") {
      this.#pendingGrant = null
      return this.setStatus(this.#statusBeforeSwitch)
    }
    await this.options.collectionSwitch.openForAccount(pending.account.id, choice)
    if ((await this.options.collectionSwitch.currentAccountId()) !== pending.account.id) {
      throw new AccountAuthorizationError("locked")
    }
    this.#pendingGrant = null
    return this.activate(pending, await this.verifyGrant(pending), "online", false)
  }

  async authorize(authorization: AccountAuthorization = { kind: "protected" }): Promise<void> {
    if (authorization.kind === "dirty_save" && this.#status.state === "locked") {
      if (authorization.accountId === this.#status.dirtySaveAccountId) return
    }
    if (this.#status.state === "credentials_needed") {
      throw new AccountAuthorizationError("credentials_needed")
    }
    if (this.#status.state === "switch_required") {
      throw new AccountAuthorizationError("switch_required")
    }
    const current = await this.activeVerified()
    if (
      authorization.kind === "dirty_save" &&
      authorization.accountId !== current.grant.account.id
    ) {
      throw new AccountAuthorizationError("locked")
    }
    await this.persistObservedTime()
  }

  private async restore(grant: AccountSessionGrant): Promise<AccountStatus> {
    const status = await restoreAccountGrant({
      grant,
      revokedSessionIds: this.#vault.revokedSessionIds,
      now: this.#clock(),
      collectionSwitch: this.options.collectionSwitch,
      verify: () => this.verifyGrant(grant),
      prepareAuthenticatedAccount: this.options.prepareAuthenticatedAccount,
    })
    if (status.state === "switch_required") {
      this.#pendingGrant = grant
      this.#statusBeforeSwitch = { state: "signed_out" }
    }
    return this.setStatus(status)
  }

  private async activeVerified() {
    const grant = this.#vault.active
    if (!grant || this.#status.state !== "authenticated") {
      throw new AccountAuthorizationError("locked")
    }
    if (this.clockRolledBack()) {
      await this.lock("clock_rollback", grant.account.id)
      throw new AccountAuthorizationError("locked")
    }
    if (grant.offlineLeaseExpiresAt <= this.#clock()) {
      await this.lock("expired", grant.account.id)
      throw new AccountAuthorizationError("locked")
    }
    const verified = await this.verifyGrant(grant)
    if (this.#vault.revokedSessionIds.includes(verified.sessionId)) {
      await this.lock("revoked", grant.account.id)
      throw new AccountAuthorizationError("locked")
    }
    return { grant, verified }
  }

  private verifyGrant(grant: AccountSessionGrant): Promise<VerifiedAccountGrant> {
    return verifyAccountSessionGrant(grant, this.options.issuer, this.#clock())
  }

  private async activate(
    grant: AccountSessionGrant,
    verified: VerifiedAccountGrant,
    connection: "online" | "offline",
    bindUnowned: boolean,
  ): Promise<AccountStatus> {
    this.#vault = {
      ...this.#vault,
      active: grant,
      lastTrustedTime: Math.max(this.#vault.lastTrustedTime, verified.verifiedAt),
    }
    this.#maxObservedTime = Math.max(this.#maxObservedTime, verified.verifiedAt, this.#clock())
    await this.options.credentials.save(this.#vault)
    if (bindUnowned) await this.options.collectionSwitch.bindUnownedToAccount(grant.account.id)
    const alreadyPrepared =
      this.#status.state === "authenticated" && this.#status.account.id === grant.account.id
    if (!alreadyPrepared) await this.options.prepareAuthenticatedAccount?.(grant.account.id)
    return this.setStatus({
      state: "authenticated",
      account: grant.account,
      connection,
      offlineLeaseExpiresAt: grant.offlineLeaseExpiresAt,
    })
  }

  private async revoke(sessionId: VerifiedAccountGrant["sessionId"], accountId: AccountId) {
    await this.persistRevoked(sessionId)
    return this.lock("revoked", accountId)
  }

  private async persistRevoked(sessionId: VerifiedAccountGrant["sessionId"]): Promise<void> {
    const revokedSessionIds = [
      sessionId,
      ...this.#vault.revokedSessionIds.filter((id) => id !== sessionId),
    ].slice(0, 32)
    this.#vault = { ...this.#vault, active: null, revokedSessionIds }
    await this.options.credentials.save(this.#vault)
  }

  private async persistObservedTime(): Promise<void> {
    const now = this.#clock()
    this.#maxObservedTime = Math.max(this.#maxObservedTime, now)
    if (now < this.#vault.lastTrustedTime + MATERIAL_CLOCK_ROLLBACK_SECONDS) return
    this.#vault = { ...this.#vault, lastTrustedTime: now }
    await this.options.credentials.save(this.#vault)
  }

  private clockRolledBack(): boolean {
    return this.#clock() + MATERIAL_CLOCK_ROLLBACK_SECONDS < this.#maxObservedTime
  }

  private async lock(reason: AccountLockReason, accountId: AccountId): Promise<AccountStatus> {
    return this.setStatus({ state: "locked", reason, dirtySaveAccountId: accountId })
  }

  private setStatus(status: AccountStatus): AccountStatus {
    this.#status = accountStatusSchema.parse(status)
    this.options.onStatusChanged?.(this.#status)
    return this.#status
  }
}

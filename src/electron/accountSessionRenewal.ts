import {
  type AccountRefreshTrigger,
  type AccountSessionGrant,
  accountRefreshTriggerSchema,
} from "../shared/accountSchemas"
import { AccountJwtError, type VerifiedAccountGrant } from "./accountJwt"
import { type AccountTransport, AccountTransportError } from "./accountTransport"

const REVERIFY_SECONDS = 24 * 60 * 60

export type RenewalOutcome =
  | { readonly kind: "current" }
  | {
      readonly kind: "renewed"
      readonly grant: AccountSessionGrant
      readonly verified: VerifiedAccountGrant
    }
  | { readonly kind: "offline" }
  | { readonly kind: "revoked" }

export async function renewAccountGrant(input: {
  readonly trigger: AccountRefreshTrigger
  readonly current: {
    readonly grant: AccountSessionGrant
    readonly verified: VerifiedAccountGrant
  }
  readonly now: number
  readonly transport: AccountTransport
  readonly verify: (grant: AccountSessionGrant) => Promise<VerifiedAccountGrant>
}): Promise<RenewalOutcome> {
  const trigger = accountRefreshTriggerSchema.parse(input.trigger)
  const shouldRenew =
    trigger === "reconnect" ||
    input.current.grant.accessExpiresAt <= input.now ||
    input.current.verified.verifiedAt + REVERIFY_SECONDS <= input.now
  if (!shouldRenew) return { kind: "current" }
  try {
    const grant = await input.transport.renew(input.current.grant.renewalToken)
    const verified = await input.verify(grant)
    if (
      verified.accountId !== input.current.verified.accountId ||
      verified.sessionId !== input.current.verified.sessionId ||
      grant.renewalExpiresAt !== input.current.grant.renewalExpiresAt
    ) {
      throw new AccountJwtError("invalid")
    }
    return { kind: "renewed", grant, verified }
  } catch (error) {
    if (error instanceof AccountTransportError && error.kind === "network") {
      return { kind: "offline" }
    }
    if (error instanceof AccountTransportError && error.kind === "unauthorized") {
      return { kind: "revoked" }
    }
    throw error
  }
}

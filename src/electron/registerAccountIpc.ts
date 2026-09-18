import { accountIpcChannels } from "../shared/accountIpc"
import {
  accountRefreshTriggerSchema,
  accountStatusSchema,
  collectionSwitchChoiceSchema,
} from "../shared/accountSchemas"
import type { AccountIpcRegistrar } from "./accountGate"
import { AccountAuthorizationError, type AccountSessionController } from "./accountSessionTypes"
import type { GoogleLogin } from "./googleLogin"

export function registerAccountIpc(
  ipc: AccountIpcRegistrar,
  session: AccountSessionController,
  login: GoogleLogin | null,
): () => void {
  ipc.handlePublic(accountIpcChannels.status, () => accountStatusSchema.parse(session.status()))
  ipc.handlePublic(accountIpcChannels.login, async () => {
    if (!login) throw new AccountAuthorizationError("credentials_needed")
    return accountStatusSchema.parse(await session.acceptGrant(await login.login()))
  })
  ipc.handlePublic(accountIpcChannels.loginCancel, () => login?.cancel())
  ipc.handlePublic(accountIpcChannels.refresh, async (_event, value: unknown) =>
    accountStatusSchema.parse(await session.refresh(accountRefreshTriggerSchema.parse(value))),
  )
  ipc.handlePublic(accountIpcChannels.logout, () => session.logout())
  ipc.handlePublic(accountIpcChannels.switchCollection, async (_event, value: unknown) =>
    accountStatusSchema.parse(
      await session.switchCollection(collectionSwitchChoiceSchema.parse(value)),
    ),
  )
  return () => {
    ipc.removeHandler(accountIpcChannels.status)
    ipc.removeHandler(accountIpcChannels.login)
    ipc.removeHandler(accountIpcChannels.loginCancel)
    ipc.removeHandler(accountIpcChannels.refresh)
    ipc.removeHandler(accountIpcChannels.logout)
    ipc.removeHandler(accountIpcChannels.switchCollection)
  }
}

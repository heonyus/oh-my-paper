import {
  accountRecoveryDraftSchema,
  accountRecoveryListChannel,
  accountRecoveryListQuerySchema,
  accountRecoveryReadChannel,
  accountRecoveryReadRequestSchema,
  accountRecoverySaveChannel,
} from "../shared/accountIpc"
import type { AccountId } from "../shared/accountSchemas"
import type { AccountIpcRegistrar } from "./accountGate"
import { AccountRecoveryStore } from "./accountRecoveryStore"
import { AccountAuthorizationError } from "./accountSessionTypes"

export function registerAccountRecoveryIpc(
  ipc: AccountIpcRegistrar,
  recoveryRoot: string,
  capturedAccountId: () => Promise<AccountId | null>,
): () => void {
  const store = new AccountRecoveryStore(recoveryRoot)
  ipc.handleDirtySave(
    accountRecoverySaveChannel,
    capturedAccountId,
    async (_event, accountId, value: unknown) => {
      await store.save(accountId, accountRecoveryDraftSchema.parse(value))
    },
  )
  ipc.handle(accountRecoveryListChannel, async (_event, value: unknown) =>
    store.list(
      await requireAccountId(capturedAccountId),
      accountRecoveryListQuerySchema.parse(value),
    ),
  )
  ipc.handle(accountRecoveryReadChannel, async (_event, value: unknown) =>
    store.read(
      await requireAccountId(capturedAccountId),
      accountRecoveryReadRequestSchema.parse(value),
    ),
  )
  return () => {
    ipc.removeHandler(accountRecoverySaveChannel)
    ipc.removeHandler(accountRecoveryListChannel)
    ipc.removeHandler(accountRecoveryReadChannel)
  }
}

async function requireAccountId(getAccountId: () => Promise<AccountId | null>): Promise<AccountId> {
  const accountId = await getAccountId()
  if (!accountId) throw new AccountAuthorizationError("locked")
  return accountId
}

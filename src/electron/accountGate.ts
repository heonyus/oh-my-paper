import type { IpcMainInvokeEvent } from "electron"
import { accountIpcChannels, accountRecoverySaveChannel } from "../shared/accountIpc"
import type { AccountId } from "../shared/accountSchemas"
import { ipcChannels } from "../shared/ipcChannels"
import {
  type AccountAuthorization,
  AccountAuthorizationError,
  type AccountSessionController,
} from "./accountSessionTypes"

const publicChannels: ReadonlySet<string> = new Set([
  accountIpcChannels.status,
  accountIpcChannels.login,
  accountIpcChannels.loginCancel,
  accountIpcChannels.refresh,
  accountIpcChannels.logout,
  accountIpcChannels.switchCollection,
  ipcChannels.providerSaveKey,
  ipcChannels.providerSaveConfig,
  ipcChannels.providerSaveMode,
  ipcChannels.providerStatus,
  ipcChannels.documentOcrSaveKey,
  ipcChannels.documentOcrStatus,
  ipcChannels.codexStatus,
  ipcChannels.codexLoginStart,
  ipcChannels.codexLoginCancel,
  ipcChannels.codexLogout,
  ipcChannels.openExternal,
])
const dirtySaveChannels: ReadonlySet<string> = new Set([
  ipcChannels.workspaceSave,
  ipcChannels.workspaceFlush,
  accountRecoverySaveChannel,
])

export class AccountGateRegistrationError extends Error {
  readonly name = "AccountGateRegistrationError"
  constructor(
    readonly kind:
      | "public_channel_not_allowed"
      | "dirty_save_channel_not_allowed"
      | "untrusted_sender",
  ) {
    super(kind)
  }
}

export type AccountIpcListener = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown | Promise<unknown>

export type AccountDirtySaveListener = (
  event: IpcMainInvokeEvent,
  accountId: AccountId,
  ...args: unknown[]
) => unknown | Promise<unknown>

export type AccountIpcRegistrar = {
  readonly handle: (channel: string, listener: AccountIpcListener) => void
  readonly handlePublic: (channel: string, listener: AccountIpcListener) => void
  readonly handleDirtySave: (
    channel: string,
    accountId: () => Promise<AccountId | null>,
    listener: AccountDirtySaveListener,
  ) => void
  readonly removeHandler: (channel: string) => void
}

export type AccountIpcMainRegistration = {
  readonly handle: (channel: string, listener: AccountIpcListener) => void
  readonly removeHandler: (channel: string) => void
}

export type GlobalAccountIpcMain = {
  handle: AccountIpcMainRegistration["handle"]
}

export type AccountSenderPredicate = (event: IpcMainInvokeEvent) => boolean
export type AccountTransitionPredicate = () => boolean

export function installAccountGate(
  ipc: AccountIpcMainRegistration,
  session: AccountSessionController,
  senderAllowed: AccountSenderPredicate,
  transitionActive: AccountTransitionPredicate = () => false,
): AccountIpcRegistrar {
  return {
    handle: (channel, listener) => {
      ipc.handle(channel, async (event, ...args: unknown[]) => {
        requireTrustedSender(event, senderAllowed)
        await authorizeAccountOperation(session, transitionActive)
        return listener(event, ...args)
      })
    },
    handlePublic: (channel, listener) => {
      if (!publicChannels.has(channel)) {
        throw new AccountGateRegistrationError("public_channel_not_allowed")
      }
      ipc.handle(channel, (event, ...args) => {
        requireTrustedSender(event, senderAllowed)
        requirePublicTransitionChannel(channel, transitionActive)
        return listener(event, ...args)
      })
    },
    handleDirtySave: (channel, accountId, listener) => {
      if (!dirtySaveChannels.has(channel)) {
        throw new AccountGateRegistrationError("dirty_save_channel_not_allowed")
      }
      ipc.handle(channel, async (event, ...args: unknown[]) => {
        requireTrustedSender(event, senderAllowed)
        const capturedAccountId = await accountId()
        if (!capturedAccountId) throw new AccountAuthorizationError("locked")
        await authorizeAccountOperation(session, transitionActive, {
          kind: "dirty_save",
          accountId: capturedAccountId,
        })
        return listener(event, capturedAccountId, ...args)
      })
    },
    removeHandler: (channel) => ipc.removeHandler(channel),
  }
}

export function installGlobalAccountGate(
  ipc: GlobalAccountIpcMain,
  session: AccountSessionController,
  dirtySaveAccountId: () => Promise<AccountId | null>,
  senderAllowed: AccountSenderPredicate,
  transitionActive: AccountTransitionPredicate = () => false,
): () => void {
  const priorHandle = ipc.handle
  const originalHandle = priorHandle.bind(ipc)
  const guardedHandle: GlobalAccountIpcMain["handle"] = (channel, listener) => {
    originalHandle(channel, async (event, ...args: unknown[]) => {
      requireTrustedSender(event, senderAllowed)
      if (publicChannels.has(channel)) {
        requirePublicTransitionChannel(channel, transitionActive)
        return listener(event, ...args)
      }
      if (dirtySaveChannels.has(channel)) {
        const accountId = await dirtySaveAccountId()
        if (!accountId) throw new AccountAuthorizationError("locked")
        await authorizeAccountOperation(session, transitionActive, {
          kind: "dirty_save",
          accountId,
        })
      } else {
        await authorizeAccountOperation(session, transitionActive)
      }
      return listener(event, ...args)
    })
  }
  ipc.handle = guardedHandle
  return () => {
    if (ipc.handle === guardedHandle) ipc.handle = priorHandle
  }
}

export async function authorizeAccountOperation(
  session: AccountSessionController,
  transitionActive: AccountTransitionPredicate,
  authorization?: AccountAuthorization,
): Promise<void> {
  requireTransitionComplete(transitionActive)
  if (authorization) await session.authorize(authorization)
  else await session.authorize()
}

function requirePublicTransitionChannel(
  channel: string,
  transitionActive: AccountTransitionPredicate,
): void {
  if (!transitionActive() || channel === accountIpcChannels.status) return
  throw new AccountAuthorizationError("locked")
}

function requireTransitionComplete(transitionActive: AccountTransitionPredicate): void {
  if (transitionActive()) throw new AccountAuthorizationError("locked")
}

function requireTrustedSender(
  event: IpcMainInvokeEvent,
  senderAllowed: AccountSenderPredicate,
): void {
  if (!senderAllowed(event)) throw new AccountGateRegistrationError("untrusted_sender")
}

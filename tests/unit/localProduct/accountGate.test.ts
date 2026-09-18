import type { IpcMain } from "electron"
import { describe, expect, it, vi } from "vitest"
import {
  AccountGateRegistrationError,
  type AccountIpcListener,
  authorizeAccountOperation,
  installGlobalAccountGate,
} from "../../../src/electron/accountGate"
import type { AccountSessionController } from "../../../src/electron/accountSessionTypes"
import { AccountAuthorizationError } from "../../../src/electron/accountSessionTypes"
import { accountIpcChannels, accountRecoverySaveChannel } from "../../../src/shared/accountIpc"
import { accountIdSchema, accountStatusSchema } from "../../../src/shared/accountSchemas"
import { ipcChannels } from "../../../src/shared/ipcChannels"

const accountId = accountIdSchema.parse("7efde20f-22e4-4ac8-93e0-b441421589c1")

function acceptsElectronIpc(ipc: IpcMain, session: AccountSessionController): () => void {
  return installGlobalAccountGate(
    ipc,
    session,
    async () => null,
    () => true,
  )
}

function harness(
  options: {
    readonly trusted?: boolean
    readonly dirtyAccount?: boolean
    readonly transitioning?: boolean
  } = {},
) {
  const handlers = new Map<string, AccountIpcListener>()
  const originalHandle = vi.fn((channel: string, listener: AccountIpcListener) => {
    handlers.set(channel, listener)
  })
  const ipc = { handle: originalHandle }
  const authorize = vi.fn(async () => undefined)
  const session = {
    initialize: async () => accountStatusSchema.parse({ state: "signed_out" }),
    status: () => accountStatusSchema.parse({ state: "signed_out" }),
    acceptGrant: async () => {
      throw new Error("unused")
    },
    refresh: async () => {
      throw new Error("unused")
    },
    logout: async () => undefined,
    switchCollection: async () => {
      throw new Error("unused")
    },
    authorize,
  }
  const restore = installGlobalAccountGate(
    ipc,
    session,
    async () => (options.dirtyAccount === false ? null : accountId),
    () => options.trusted !== false,
    () => options.transitioning === true,
  )
  return { authorize, handlers, ipc, originalHandle, restore, session }
}

async function invoke(
  handlers: ReadonlyMap<string, AccountIpcListener>,
  channel: string,
): Promise<unknown> {
  const listener = handlers.get(channel)
  if (!listener) throw new Error(`missing handler: ${channel}`)
  return listener(Object.create(null))
}

describe("global account gate", () => {
  it("accepts Electron's ipcMain interface without an adapter", () => {
    expect(typeof acceptsElectronIpc).toBe("function")
  })

  it("protects every future registration by default without recursive handle calls", async () => {
    const gate = harness()
    gate.ipc.handle("documents:private", () => "protected")

    await expect(invoke(gate.handlers, "documents:private")).resolves.toBe("protected")
    expect(gate.authorize).toHaveBeenCalledWith()
    expect(gate.originalHandle).toHaveBeenCalledTimes(1)
  })

  it("allows only fixed public channels after validating the sender", async () => {
    const gate = harness()
    gate.ipc.handle("account:status", () => "public")

    await expect(invoke(gate.handlers, "account:status")).resolves.toBe("public")
    expect(gate.authorize).not.toHaveBeenCalled()

    const untrusted = harness({ trusted: false })
    untrusted.ipc.handle("account:status", () => "leak")
    await expect(invoke(untrusted.handlers, "account:status")).rejects.toEqual(
      new AccountGateRegistrationError("untrusted_sender"),
    )
  })

  it("limits dirty-save grace to the captured unlocked account", async () => {
    const gate = harness()
    gate.ipc.handle(ipcChannels.workspaceSave, () => "saved")
    await expect(invoke(gate.handlers, ipcChannels.workspaceSave)).resolves.toBe("saved")
    expect(gate.authorize).toHaveBeenCalledWith({ kind: "dirty_save", accountId })

    gate.ipc.handle(accountRecoverySaveChannel, () => "recovered")
    await expect(invoke(gate.handlers, accountRecoverySaveChannel)).resolves.toBe("recovered")
    expect(gate.authorize).toHaveBeenLastCalledWith({ kind: "dirty_save", accountId })

    const unknown = harness({ dirtyAccount: false })
    unknown.ipc.handle(ipcChannels.workspaceFlush, () => "saved")
    await expect(invoke(unknown.handlers, ipcChannels.workspaceFlush)).rejects.toEqual(
      new AccountAuthorizationError("locked"),
    )
  })

  it("allows status but denies old application handlers during an account transition", async () => {
    const gate = harness({ transitioning: true })
    gate.ipc.handle(accountIpcChannels.status, () => "status")
    gate.ipc.handle(ipcChannels.providerStatus, () => "old-provider")
    gate.ipc.handle("documents:private", () => "old-document")

    await expect(invoke(gate.handlers, accountIpcChannels.status)).resolves.toBe("status")
    await expect(invoke(gate.handlers, ipcChannels.providerStatus)).rejects.toEqual(
      new AccountAuthorizationError("locked"),
    )
    await expect(invoke(gate.handlers, "documents:private")).rejects.toEqual(
      new AccountAuthorizationError("locked"),
    )
  })

  it("denies a non-IPC account operation before session authorization during transition", async () => {
    const gate = harness()

    await expect(authorizeAccountOperation(gate.session, () => true)).rejects.toEqual(
      new AccountAuthorizationError("locked"),
    )
    expect(gate.authorize).not.toHaveBeenCalled()
  })

  it("restores only while it still owns the global handle hook", () => {
    const gate = harness()
    gate.restore()
    expect(gate.ipc.handle).toBe(gate.originalHandle)

    const replaced = harness()
    const laterHandle = vi.fn()
    replaced.ipc.handle = laterHandle
    replaced.restore()
    expect(replaced.ipc.handle).toBe(laterHandle)
  })
})

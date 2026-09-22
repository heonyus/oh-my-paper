import { join } from "node:path"
import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron"
import { accountIpcChannels } from "../shared/accountIpc"
import type { AccountId, AccountStatus } from "../shared/accountSchemas"
import {
  authorizeAccountOperation,
  installAccountGate,
  installGlobalAccountGate,
} from "./accountGate"
import {
  accountRemountRequiresReload,
  resolveAccountServiceRoot,
  resolveAccountServiceRootForAccount,
  resolveUnboundServiceRoot,
} from "./accountServiceRoot"
import { registerApplicationIpc } from "./applicationIpc"
import { createApplicationWindow, isApplicationUrl } from "./applicationWindow"
import { collectionAssetScheme } from "./collectionAssetProtocol"
import { collectionIndexFile } from "./collectionPaths"
import {
  type ApplicationAccount,
  type CreateApplicationAccountOptions,
  createApplicationAccount,
} from "./createApplicationAccount"
import { openApplicationStore } from "./openApplicationStore"
import { registerAccountIpc } from "./registerAccountIpc"
import { registerAccountRecoveryIpc } from "./registerAccountRecoveryIpc"
import { WorkspaceStore } from "./workspaceStore"

export type DesktopApplicationOptions = {
  readonly userDataRoot: string
  readonly electronDirectory?: string
  readonly createAccount?: (options: CreateApplicationAccountOptions) => Promise<ApplicationAccount>
}

export async function startDesktopApplication(options: DesktopApplicationOptions): Promise<void> {
  app.setPath("userData", options.userDataRoot)
  protocol.registerSchemesAsPrivileged([collectionAssetScheme])
  await app.whenReady()
  const directory = options.electronDirectory ?? __dirname
  let store: WorkspaceStore | null = await openApplicationStore(options.userDataRoot)
  let serviceRoot = join(options.userDataRoot, "ohmypaper")
  let serviceAccountId: AccountId | null = null
  let disposeApplication: (() => Promise<void>) | null = null
  let account: ApplicationAccount | null = null
  let reloadAfterSwitch = false
  let transitionActive = false
  let transitionQueue = Promise.resolve()
  const isTransitioning = (): boolean => transitionActive
  const publish = (status: AccountStatus): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (reloadAfterSwitch && status.state === "authenticated") window.webContents.reload()
      else window.webContents.send(accountIpcChannels.statusChanged, status)
    }
    if (status.state === "authenticated") reloadAfterSwitch = false
  }
  const authorize = async (): Promise<void> => {
    if (!account) throw new Error("Account initialization pending")
    await authorizeAccountOperation(account.session, isTransitioning)
  }
  const mount = (): void => {
    if (!store) throw new Error("Collection is not open")
    disposeApplication = registerApplicationIpc(store, serviceRoot, authorize)
  }
  const transition = (operation: () => Promise<void>): Promise<void> => {
    const result = transitionQueue
      .catch(() => undefined)
      .then(async () => {
        transitionActive = true
        try {
          await operation()
        } finally {
          transitionActive = false
        }
      })
    transitionQueue = result.catch(() => undefined)
    return result
  }
  const remount = async (
    collectionRoot: string,
    indexFile: string,
    nextServiceRoot: string,
    nextAccountId: AccountId,
    reload: boolean,
  ): Promise<void> => {
    const previousDispose = disposeApplication
    const previousStore = store
    disposeApplication = null
    store = null
    if (previousDispose) await previousDispose()
    else await previousStore?.close()
    store = await WorkspaceStore.openCollection(collectionRoot, indexFile)
    serviceRoot = nextServiceRoot
    serviceAccountId = nextAccountId
    mount()
    reloadAfterSwitch = reloadAfterSwitch || reload
  }
  const prepareAuthenticatedAccount = (accountId: AccountId): Promise<void> =>
    transition(async () => {
      const service = await resolveAccountServiceRootForAccount(options.userDataRoot, accountId)
      if (serviceAccountId === accountId && disposeApplication) return
      if (!disposeApplication) {
        serviceRoot = service.root
        serviceAccountId = accountId
        return
      }
      const collection = store?.collectionService
      if (!collection) throw new Error("Account collection is unavailable")
      await remount(
        collection.collectionRoot,
        collectionIndexFile(options.userDataRoot, collection.files.manifest.collectionId),
        service.root,
        accountId,
        accountRemountRequiresReload(serviceAccountId, accountId, false),
      )
    })
  account = await (options.createAccount ?? createApplicationAccount)({
    userDataRoot: options.userDataRoot,
    getStore: () => {
      if (!store) throw new Error("Collection is switching")
      return store
    },
    onStatusChanged: publish,
    prepareAuthenticatedAccount,
    switchStore: async (root, indexFile, targetAccountId) => {
      await transition(async () => {
        const service = await resolveAccountServiceRootForAccount(
          options.userDataRoot,
          targetAccountId,
        )
        const collectionChanged = store?.collectionService?.collectionRoot !== root
        if (!collectionChanged && serviceAccountId === targetAccountId) return
        await remount(
          root,
          indexFile,
          service.root,
          targetAccountId,
          accountRemountRequiresReload(serviceAccountId, targetAccountId, collectionChanged),
        )
      })
    },
  })
  const session = account.session
  const initializedService = await resolveAccountServiceRoot(options.userDataRoot, session.status())
  if (initializedService) {
    serviceRoot = initializedService.root
    serviceAccountId = initializedService.accountId
  } else {
    serviceRoot = await resolveUnboundServiceRoot(options.userDataRoot)
  }
  const trustedSender = (event: Electron.IpcMainInvokeEvent): boolean =>
    event.senderFrame === event.sender.mainFrame &&
    isApplicationUrl(event.senderFrame.url, directory)
  const dirtyOwner = async (): Promise<AccountId | null> => {
    const status = session.status()
    switch (status.state) {
      case "local":
        return status.accountId
      case "authenticated":
        return status.account.id
      case "locked":
        return status.dirtySaveAccountId
      case "switch_required":
        return status.currentAccountId
      default:
        return null
    }
  }
  const removeGate = installGlobalAccountGate(
    ipcMain,
    session,
    dirtyOwner,
    trustedSender,
    isTransitioning,
  )
  const gatedIpc = installAccountGate(ipcMain, session, trustedSender, isTransitioning)
  const disposeRecovery = registerAccountRecoveryIpc(
    gatedIpc,
    join(options.userDataRoot, "account", "draft-recovery"),
    dirtyOwner,
  )
  const disposeAccountIpc = registerAccountIpc(gatedIpc, session, account.login)
  mount()
  app.once("will-quit", (event) => {
    event.preventDefault()
    void (async () => {
      await disposeApplication?.()
      disposeAccountIpc()
      disposeRecovery()
      removeGate()
      await account?.dispose()
      app.quit()
    })().catch(() =>
      dialog.showErrorBox(
        "종료 확인 필요",
        "자료 저장 상태를 확인하지 못했습니다. 원본 폴더와 복구 이력을 확인해 주세요.",
      ),
    )
  })
  createApplicationWindow(directory)
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createApplicationWindow(directory)
  })
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })
}

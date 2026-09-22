import type { AccountSessionController } from "../../../src/electron/accountSessionTypes"
import { startDesktopApplication } from "../../../src/electron/startDesktopApplication"
import { accountStatusSchema } from "../../../src/shared/accountSchemas"
import { installScholarlyGraphFixture } from "./scholarlyGraphFixture"

const {
  OH_MY_PAPER_QA_USER_DATA_ROOT: userDataRoot,
  OH_MY_PAPER_QA_ELECTRON_DIRECTORY: electronDirectory,
  OH_MY_PAPER_QA_SCHOLARLY_FIXTURE: scholarlyFixture,
} = process.env

if (!userDataRoot || !electronDirectory) {
  throw new Error("Synthetic Electron QA requires temporary user-data and built artifact paths")
}

if (scholarlyFixture === "1") installScholarlyGraphFixture()

const authenticated = accountStatusSchema.parse({
  state: "authenticated",
  account: {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    displayName: "Synthetic QA",
  },
  connection: "offline",
  offlineLeaseExpiresAt: 4_102_444_800,
})

const session: AccountSessionController = {
  initialize: async () => authenticated,
  status: () => authenticated,
  acceptGrant: async () => authenticated,
  refresh: async () => authenticated,
  logout: async () => undefined,
  switchCollection: async () => authenticated,
  authorize: async () => undefined,
}

void startDesktopApplication({
  userDataRoot,
  electronDirectory,
  createAccount: async ({ onStatusChanged }) => {
    onStatusChanged(authenticated)
    return { session, login: null, dispose: async () => undefined }
  },
})

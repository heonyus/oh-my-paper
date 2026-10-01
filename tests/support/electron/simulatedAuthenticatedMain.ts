import { access, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { resolveAccountServiceRootForAccount } from "../../../src/electron/accountServiceRoot"
import type { AccountSessionController } from "../../../src/electron/accountSessionTypes"
import { ProviderService } from "../../../src/electron/providerService"
import { startDesktopApplication } from "../../../src/electron/startDesktopApplication"
import { accountIdSchema, accountStatusSchema } from "../../../src/shared/accountSchemas"
import { DEFAULT_OPENROUTER_MODEL } from "../../../src/shared/providerModels"
import { installScholarlyGraphFixture } from "./scholarlyGraphFixture"

const {
  OH_MY_PAPER_QA_USER_DATA_ROOT: userDataRoot,
  OH_MY_PAPER_QA_ELECTRON_DIRECTORY: electronDirectory,
  OH_MY_PAPER_QA_SCHOLARLY_FIXTURE: scholarlyFixture,
  OH_MY_PAPER_QA_SYNTHETIC_PROVIDER: syntheticProvider,
} = process.env

if (!userDataRoot || !electronDirectory) {
  throw new Error("Synthetic Electron QA requires temporary user-data and built artifact paths")
}

if (scholarlyFixture === "1") installScholarlyGraphFixture()

const accountId = accountIdSchema.parse("0f8fad5b-d9cb-469f-a165-70867728950e")

const authenticated = accountStatusSchema.parse({
  state: "authenticated",
  account: {
    id: accountId,
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

// Without a saved mode the app defaults to the ChatGPT subscription, whose login lives in the
// temporary profile's own codex-home and is never present, so the settings dialog stays locked.
// Specs that need the library seed an API-mode provider with a synthetic, non-working key.
async function seedSyntheticProvider(root: string): Promise<void> {
  const modeFile = join(root, "ai-mode.json")
  if (
    await access(modeFile).then(
      () => true,
      () => false,
    )
  )
    return
  await new ProviderService(root).saveConfig({
    provider: "openrouter",
    apiKey: "synthetic-e2e-key-not-a-real-credential",
    model: DEFAULT_OPENROUTER_MODEL,
  })
  await writeFile(modeFile, JSON.stringify({ mode: "api" }))
}

void startDesktopApplication({
  userDataRoot,
  electronDirectory,
  createAccount: async ({ onStatusChanged }) => {
    if (syntheticProvider === "1") {
      const service = await resolveAccountServiceRootForAccount(userDataRoot, accountId)
      await seedSyntheticProvider(service.root)
    }
    onStatusChanged(authenticated)
    return { session, login: null, dispose: async () => undefined }
  },
})

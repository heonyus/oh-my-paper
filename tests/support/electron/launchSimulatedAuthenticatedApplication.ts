import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { type ElectronApplication, _electron as electron } from "@playwright/test"
import { build } from "esbuild"

export const simulatedAuthenticationMode = "simulated-auth-not-live-google"

export interface SimulatedAuthenticatedApplication {
  readonly application: ElectronApplication
  readonly authMode: typeof simulatedAuthenticationMode
  readonly userDataRoot: string
  readonly close: () => Promise<void>
}

export interface SimulatedAuthenticatedLaunchOptions {
  readonly environment?: Readonly<NodeJS.ProcessEnv>
  readonly userDataRoot?: string
  /** Seed the temporary profile with a synthetic API-mode provider so the app opens unlocked. */
  readonly configuredProvider?: boolean
}

export async function launchSimulatedAuthenticatedApplication(
  options: SimulatedAuthenticatedLaunchOptions = {},
): Promise<SimulatedAuthenticatedApplication> {
  const projectRoot = process.cwd()
  const electronDirectory = resolve(projectRoot, "dist-electron/electron")
  const rendererEntry = resolve(electronDirectory, "../../dist/index.html")
  const pdfJsModule = resolve(projectRoot, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-simulated-auth-"))
  const userDataRoot = options.userDataRoot ?? join(temporaryRoot, "user-data")
  const entry = join(temporaryRoot, "simulated-auth-main.js")

  try {
    await Promise.all([
      access(join(electronDirectory, "preload.js")),
      access(rendererEntry),
      access(pdfJsModule),
    ])
    await build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["tests/support/electron/simulatedAuthenticatedMain.ts"],
      external: ["electron"],
      format: "cjs",
      outfile: entry,
      platform: "node",
      plugins: [
        {
          name: "absolute-pdfjs-external",
          setup(context) {
            context.onResolve({ filter: /^pdfjs-dist\/legacy\/build\/pdf\.mjs$/ }, () => ({
              external: true,
              path: pdfJsModule,
            }))
          },
        },
      ],
      target: "node22",
    })
    const application = await electron.launch({
      args: [entry],
      env: {
        ...process.env,
        ...options.environment,
        OH_MY_PAPER_QA_ELECTRON_DIRECTORY: electronDirectory,
        OH_MY_PAPER_QA_USER_DATA_ROOT: userDataRoot,
        ...(options.configuredProvider ? { OH_MY_PAPER_QA_SYNTHETIC_PROVIDER: "1" } : {}),
      },
    })
    return {
      application,
      authMode: simulatedAuthenticationMode,
      userDataRoot,
      close: async () => {
        try {
          await application.close()
        } finally {
          await rm(temporaryRoot, { force: true, recursive: true })
        }
      },
    }
  } catch (error) {
    await rm(temporaryRoot, { force: true, recursive: true })
    throw error
  }
}

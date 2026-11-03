import { intro, log, outro } from "@clack/prompts"
import type { WebServerConfig } from "../server/config"
import {
  ensureOcrInstall,
  recordOcrDeclined,
  startMeaningModelFetchInBackground,
} from "./environment"
import { t } from "./messages"
import { readOnboardingState } from "./onboarding"
import { banner, bold, gray, inverse } from "./style"
import { packageVersion } from "./version"

/**
 * Setup without a single question, for installs no one can answer (an AI agent, a script) and
 * `oh-my-paper onboard --yes`: what the wizard prepares on its own, with its defaults. Signing in
 * to AI is left for the person, and it never asks for or gives a GitHub star.
 */
export async function runHeadlessSetup(
  config: WebServerConfig,
  options: { readonly ocr: boolean },
): Promise<void> {
  process.stdout.write(`${banner(packageVersion())}\n`)
  intro(inverse(` ${t("headless.title")} `))
  log.info(gray(t("headless.intro")))

  startMeaningModelFetchInBackground()
  log.success(gray(t("ocr.meaningModel")))
  // An engine that is ready or on its way is left alone, as in the wizard. Otherwise it starts
  // installing, or with --no-ocr is declined the way the wizard's "no" is, so updates and app
  // starts do not install it either.
  const ocr = await ensureOcrInstall(options.ocr ? {} : { start: recordOcrDeclined })
  if (ocr === "ready") log.success(t("ocr.ready"))
  else if (ocr === "installing") log.success(t("ocr.installing"))
  else if (ocr === "declined") log.info(gray(t("headless.ocrDeclined")))
  else if (options.ocr) log.success(`${t("ocr.started")}\n${gray(t("ocr.startedHint"))}`)
  else log.info(gray(t("ocr.skipped")))

  const connected = await readOnboardingState(config).then(
    (state) => state.configured,
    () => false,
  )
  if (connected) log.success(t("doctor.aiOk"))
  else log.warn(t("headless.aiLeft", { app: bold("oh-my-paper") }))
  outro(t("wizard.readyLater", { app: bold("oh-my-paper") }))
}

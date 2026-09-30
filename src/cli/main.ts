import { spawnSync } from "node:child_process"
import { access } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { intro, log, note, outro, spinner, taskLog } from "@clack/prompts"
import { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"
import { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import {
  describePaddleInstallProgress,
  paddleInstallPaths,
  readPaddleInstallProgress,
} from "../electron/paddleInstallState"
import { readWebServerConfig, type WebServerConfig } from "../server/config"
import { checkEnvironment, ensureOcrInstall } from "./environment"
import { cliLocale } from "./locale"
import { t } from "./messages"
import { readOnboardingState, runOnboarding } from "./onboarding"
import { portOpen, startApp } from "./startApp"
import { banner, bold, gray, inverse, link } from "./style"
import { appUrl, quickstart } from "./tutorial"
import {
  buildSummary,
  describeUpdateLine,
  fitLine,
  gitSummary,
  isNpmFetchLine,
  npmSummary,
  plainLine,
  runStreaming,
  type StepResult,
  syncToUpstream,
} from "./updateProgress"
import { packageVersion, readPackageVersion } from "./version"

const appRoot = fileURLToPath(new URL("../..", import.meta.url))
async function doctor(config: WebServerConfig): Promise<void> {
  process.stdout.write(`${banner(packageVersion())}\n`)
  intro(inverse(` ${t("doctor.title")} `))
  const subscription = new CodexSubscriptionAdapter({ appRoot: config.dataDir })
  const claude = new ClaudeSubscriptionAdapter({ appRoot: config.dataDir })
  const checking = spinner()
  checking.start(t("doctor.checking"))
  try {
    const [report, state, codex, claudeStatus, running] = await Promise.all([
      checkEnvironment(config, subscription.isAvailable),
      readOnboardingState(config),
      subscription.getStatus(),
      claude.getStatus(),
      portOpen(config.host, config.port),
    ])
    const models = codex.authenticated ? await subscription.listModels() : []
    const built = await access(join(config.staticDir, "index.html")).then(
      () => true,
      () => false,
    )
    checking.stop(t("doctor.checked"))

    const [major = 0] = process.versions.node.split(".").map(Number)
    const line = (ok: boolean, text: string, fix?: string): void => {
      if (ok) log.success(text)
      else log.warn(fix ? `${text}\n${gray(`→ ${fix}`)}` : text)
    }
    line(major >= 22, `Node.js ${process.versions.node}`, t("doctor.installNode"))
    line(report.nodeModules, t("doctor.deps"), "npm install")
    line(built, t("doctor.web"), "npm run build:web")
    line(report.codexRuntime, t("doctor.codex"), "npm install")
    line(
      codex.authenticated,
      codex.authenticated
        ? t("doctor.chatgpt", {
            email: codex.account && "email" in codex.account ? String(codex.account.email) : "",
            models: models.map((model) => model.id).join(", "),
          })
        : t("doctor.chatgptNone"),
      "oh-my-paper onboard",
    )
    if (claudeStatus.available) {
      line(
        claudeStatus.authenticated,
        claudeStatus.authenticated
          ? t("doctor.claude", {
              detail: [claudeStatus.subscriptionType, claudeStatus.email]
                .filter(Boolean)
                .join(" · "),
            })
          : t("doctor.claudeNone"),
        "oh-my-paper onboard",
      )
    } else log.info(gray(t("doctor.claudeMissing")))
    line(
      state.configured,
      state.configured ? t("doctor.aiOk") : t("doctor.aiNone"),
      "oh-my-paper onboard",
    )
    if (report.ocrInstalling) {
      const progress = describePaddleInstallProgress(
        readPaddleInstallProgress(homedir()),
        cliLocale,
      )
      log.info(
        `${t("doctor.ocrInstalling", { progress })}\n${gray(t("doctor.log", { path: paddleInstallPaths(homedir()).log }))}`,
      )
    } else line(report.ocrReady, t("doctor.ocr"), "npm run setup:paddle-vl")
    log.info(
      `${running ? t("doctor.running") : t("doctor.stopped")} · ${link(appUrl(config.host, config.port))}`,
    )
    log.info(t("doctor.data", { path: config.dataDir }))
    outro(state.configured ? t("doctor.ready") : t("doctor.connectAi"))
  } finally {
    subscription.dispose()
    claude.dispose()
  }
}

type UpdateStep = {
  readonly title: string
  readonly run: (onLine: (line: string) => void) => Promise<StepResult>
  readonly summary: (lines: readonly string[]) => string | null
  /** Lists the commits that arrived once the step is done. */
  readonly listsCommits?: boolean
}

function gitOutput(args: readonly string[]): string {
  return spawnSync("git", args, { cwd: appRoot, encoding: "utf8" }).stdout.trim()
}

async function update(): Promise<void> {
  process.stdout.write(`${banner(packageVersion())}\n`)
  intro(inverse(` ${t("update.title")} `))
  const before = gitOutput(["rev-parse", "HEAD"])
  const newCommits = (): readonly string[] => {
    const after = gitOutput(["rev-parse", "HEAD"])
    if (!before || after === before) return []
    return gitOutput(["log", "--no-merges", "--format=%s", `${before}..${after}`])
      .split("\n")
      .filter(Boolean)
  }
  let replaced = false
  const npm = (args: readonly string[]) => (onLine: (line: string) => void) =>
    runStreaming("npm", args, { cwd: appRoot, onLine })
  const steps: readonly UpdateStep[] = [
    {
      title: t("update.fetch"),
      run: async (onLine) => {
        const result = await syncToUpstream(appRoot, onLine)
        replaced = result.replaced
        return result
      },
      summary: () =>
        replaced
          ? t("update.replaced")
          : gitSummary(before, gitOutput(["rev-parse", "HEAD"]), newCommits().length),
      listsCommits: true,
    },
    {
      title: t("update.deps"),
      run: npm(["ci", "--no-audit", "--no-fund", "--loglevel=http", "--foreground-scripts"]),
      summary: npmSummary,
    },
    { title: t("update.build"), run: npm(["run", "build:web"]), summary: buildSummary },
  ]
  // clack divides by the width to erase the rolling log, so a terminal that reports none gets
  // only the step lines.
  const columns = process.stdout.columns ?? 0
  const rolling = columns > 0
  for (const step of steps) {
    const task = taskLog({ title: `${step.title}…`, limit: 5 })
    const result = await step.run((line) => {
      const shown = rolling ? describeUpdateLine(line) : null
      if (shown) task.message(fitLine(shown, columns))
    })
    if (!result.ok) {
      task.error(t("update.failed", { step: step.title }), { showLog: false })
      const tail = result.lines
        .filter((line) => !isNpmFetchLine(line))
        .map(plainLine)
        .filter(Boolean)
        .slice(-12)
      if (tail.length > 0) log.message(tail.map((line) => gray(line)).join("\n"))
      outro(t("update.notFinished"))
      process.exitCode = 1
      return
    }
    const summary = step.summary(result.lines)
    task.success(summary ? `${step.title} ${gray(`· ${summary}`)}` : step.title)
    if (step.listsCommits && !replaced) {
      const commits = newCommits()
      if (commits.length > 0) {
        const width = columns || 80
        const shown = commits.slice(0, 5).map((subject) => gray(`• ${fitLine(subject, width)}`))
        if (commits.length > 5) shown.push(gray(t("update.more", { count: commits.length - 5 })))
        log.message(shown.join("\n"))
      }
    }
  }
  // A computer that never got the OCR engine, or whose install stopped, gets it now.
  const ocr = await ensureOcrInstall()
  if (ocr === "started")
    log.success(`${t("update.ocrStarted")} ${gray(t("update.ocrStartedHint"))}`)
  else if (ocr === "installing")
    log.info(
      `${t("update.ocrInstalling")} ${gray(`· ${describePaddleInstallProgress(readPaddleInstallProgress(homedir()), cliLocale)}`)}`,
    )
  outro(t("update.done", { version: readPackageVersion() }))
}

function help(config: WebServerConfig): void {
  process.stdout.write(`${banner(packageVersion())}\n`)
  const command = (name: string, text: string): string => `  ${bold(name.padEnd(30))}${text}`
  process.stdout.write(
    [
      bold(t("help.usage")),
      command("oh-my-paper", t("help.start")),
      command("oh-my-paper onboard", t("help.onboard")),
      command("oh-my-paper doctor", t("help.doctor")),
      command("oh-my-paper update", t("help.update")),
      command("oh-my-paper start --no-open", t("help.noOpen")),
      "",
    ].join("\n"),
  )
  note(quickstart(appUrl(config.host, config.port), config.dataDir), t("help.quickstart"))
}

async function main(): Promise<void> {
  const [command = "start", ...rest] = process.argv.slice(2)
  const config = readWebServerConfig()
  switch (command) {
    case "start":
      await startApp(config, !rest.includes("--no-open"))
      return
    case "onboard":
    case "setup": {
      const outcome = await runOnboarding(config)
      if (outcome.launch) await startApp(config, true)
      return
    }
    case "doctor":
      await doctor(config)
      return
    case "update":
      await update()
      return
    case "-v":
    case "--version":
    case "version":
      process.stdout.write(`${packageVersion()}\n`)
      return
    case "help":
    case "-h":
    case "--help":
      help(config)
      return
    default:
      if (command === "--no-open") {
        await startApp(config, false)
        return
      }
      process.stderr.write(`${t("help.unknown", { command })}\n\n`)
      help(config)
      process.exitCode = 1
  }
}

void main()

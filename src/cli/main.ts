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
} from "./updateProgress"
import { packageVersion, readPackageVersion } from "./version"

const appRoot = fileURLToPath(new URL("../..", import.meta.url))
async function doctor(config: WebServerConfig): Promise<void> {
  process.stdout.write(`${banner(packageVersion())}\n`)
  intro(inverse(" 진단 "))
  const subscription = new CodexSubscriptionAdapter({ appRoot: config.dataDir })
  const claude = new ClaudeSubscriptionAdapter({ appRoot: config.dataDir })
  const checking = spinner()
  checking.start("확인하는 중…")
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
    checking.stop("확인 완료")

    const [major = 0] = process.versions.node.split(".").map(Number)
    const line = (ok: boolean, text: string, fix?: string): void => {
      if (ok) log.success(text)
      else log.warn(fix ? `${text}\n${gray(`→ ${fix}`)}` : text)
    }
    line(major >= 22, `Node.js ${process.versions.node}`, "Node.js 22 이상을 설치하세요")
    line(report.nodeModules, "의존성", "npm install")
    line(built, "웹 앱 빌드", "npm run build:web")
    line(report.codexRuntime, "ChatGPT 로그인 런타임 (Codex)", "npm install")
    line(
      codex.authenticated,
      codex.authenticated
        ? `ChatGPT 구독 · ${codex.account && "email" in codex.account ? codex.account.email : ""} · 모델 ${models.map((model) => model.id).join(", ")}`
        : "ChatGPT 구독 로그인 안 됨",
      "oh-my-paper onboard",
    )
    if (claudeStatus.available) {
      line(
        claudeStatus.authenticated,
        claudeStatus.authenticated
          ? `Claude 구독 · ${[claudeStatus.subscriptionType, claudeStatus.email].filter(Boolean).join(" · ")}`
          : "Claude Code 로그인 안 됨",
        "oh-my-paper onboard",
      )
    } else log.info(gray("Claude Code CLI 없음 (선택)"))
    line(state.configured, state.configured ? "AI 연결됨" : "AI 연결 없음", "oh-my-paper onboard")
    if (report.ocrInstalling) {
      const progress = describePaddleInstallProgress(readPaddleInstallProgress(homedir()))
      log.info(
        `OCR 엔진 설치 중 ${progress} (백그라운드)\n${gray(`→ 로그 ${paddleInstallPaths(homedir()).log}`)}`,
      )
    } else line(report.ocrReady, "OCR 엔진 (선택)", "npm run setup:paddle-vl")
    log.info(`${running ? "실행 중" : "꺼져 있음"} · ${link(appUrl(config.host, config.port))}`)
    log.info(`데이터 ${config.dataDir}`)
    outro(state.configured ? "사용할 준비가 됐습니다" : "oh-my-paper onboard 로 AI를 연결하세요")
  } finally {
    subscription.dispose()
    claude.dispose()
  }
}

type UpdateStep = {
  readonly title: string
  readonly command: string
  readonly args: readonly string[]
  readonly summary: (lines: readonly string[]) => string | null
}

function gitOutput(args: readonly string[]): string {
  return spawnSync("git", args, { cwd: appRoot, encoding: "utf8" }).stdout.trim()
}

/** Each step streams its output as a dim rolling log, then leaves one summary line. */
async function update(): Promise<void> {
  process.stdout.write(`${banner(packageVersion())}\n`)
  intro(inverse(" 업데이트 "))
  const before = gitOutput(["rev-parse", "HEAD"])
  const newCommits = (): readonly string[] => {
    const after = gitOutput(["rev-parse", "HEAD"])
    if (!before || after === before) return []
    return gitOutput(["log", "--no-merges", "--format=%s", `${before}..${after}`])
      .split("\n")
      .filter(Boolean)
  }
  const steps: readonly UpdateStep[] = [
    {
      title: "최신 코드 받기",
      command: "git",
      args: ["pull", "--ff-only", "--progress"],
      summary: () => gitSummary(before, gitOutput(["rev-parse", "HEAD"]), newCommits().length),
    },
    {
      title: "의존성 설치",
      command: "npm",
      args: ["ci", "--no-audit", "--no-fund", "--loglevel=http", "--foreground-scripts"],
      summary: npmSummary,
    },
    { title: "웹 앱 빌드", command: "npm", args: ["run", "build:web"], summary: buildSummary },
  ]
  // clack divides by the width to erase the rolling log, so a terminal that reports none gets
  // only the step lines.
  const columns = process.stdout.columns ?? 0
  const rolling = columns > 0
  for (const step of steps) {
    const task = taskLog({ title: `${step.title}…`, limit: 5 })
    const result = await runStreaming(step.command, step.args, {
      cwd: appRoot,
      onLine: (line) => {
        const shown = rolling ? describeUpdateLine(line) : null
        if (shown) task.message(fitLine(shown, columns))
      },
    })
    if (!result.ok) {
      task.error(`${step.title} 실패`, { showLog: false })
      const tail = result.lines
        .filter((line) => !isNpmFetchLine(line))
        .map(plainLine)
        .filter(Boolean)
        .slice(-12)
      if (tail.length > 0) log.message(tail.map((line) => gray(line)).join("\n"))
      outro("업데이트를 마치지 못했습니다")
      process.exitCode = 1
      return
    }
    const summary = step.summary(result.lines)
    task.success(summary ? `${step.title} ${gray(`· ${summary}`)}` : step.title)
    if (step.command === "git") {
      const commits = newCommits()
      if (commits.length > 0) {
        const width = columns || 80
        const shown = commits.slice(0, 5).map((subject) => gray(`• ${fitLine(subject, width)}`))
        if (commits.length > 5) shown.push(gray(`  외 ${commits.length - 5}개`))
        log.message(shown.join("\n"))
      }
    }
  }
  // A computer that never got the OCR engine, or whose install stopped, gets it now.
  const ocr = await ensureOcrInstall()
  if (ocr === "started")
    log.success(
      `문서 분석 엔진(OCR)이 없어서 뒤에서 설치를 시작했어요 ${gray("· 앱은 바로 쓸 수 있고, 진행 상황은 oh-my-paper doctor")}`,
    )
  else if (ocr === "installing")
    log.info(
      `문서 분석 엔진(OCR)은 뒤에서 설치하고 있어요 ${gray(`· ${describePaddleInstallProgress(readPaddleInstallProgress(homedir()))}`)}`,
    )
  outro(`v${readPackageVersion()} — 실행 중인 앱은 다시 시작하면 적용됩니다`)
}

function help(config: WebServerConfig): void {
  process.stdout.write(`${banner(packageVersion())}\n`)
  const command = (name: string, text: string): string => `  ${bold(name.padEnd(30))}${text}`
  process.stdout.write(
    [
      bold("사용법"),
      command("oh-my-paper", "앱을 시작하고 브라우저를 엽니다 (처음이면 설정부터)"),
      command("oh-my-paper onboard", "설정 마법사 — AI 연결, OCR, 사용법"),
      command("oh-my-paper doctor", "환경과 연결 상태를 점검합니다"),
      command("oh-my-paper update", "최신 버전으로 업데이트합니다"),
      command("oh-my-paper start --no-open", "브라우저를 열지 않고 시작합니다"),
      "",
    ].join("\n"),
  )
  note(quickstart(appUrl(config.host, config.port), config.dataDir), "빠른 시작")
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
      process.stderr.write(`알 수 없는 명령: ${command}\n\n`)
      help(config)
      process.exitCode = 1
  }
}

void main()

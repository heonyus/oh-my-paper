import { spawnSync } from "node:child_process"
import { isCancel, log, select } from "@clack/prompts"
import { readGithubStarAnswer, saveGithubStarAnswer } from "../server/githubStarStore"
import { GITHUB_REPO_URL, type GithubStarAnswer } from "../shared/githubStar"
import { t } from "./messages"
import { openBrowser } from "./openBrowser"
import { gray, link } from "./style"

type Terminal = { readonly isTTY?: boolean }

/** Someone can answer a prompt only with a terminal on both ends and outside CI. */
export function canPrompt(
  input: Terminal = process.stdin,
  output: Terminal = process.stdout,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const { CI: ci } = environment
  const inCi = ci !== undefined && ci !== "" && ci !== "0" && ci !== "false"
  return Boolean(input.isTTY && output.isTTY) && !inCi
}

/** The person's own GitHub CLI login, used to star only after they chose to. */
export type GithubCli = {
  /** `gh` is installed and holds a github.com login. */
  readonly loggedIn: () => boolean
  readonly star: () => boolean
}

const STAR_ENDPOINT = `/user/starred${new URL(GITHUB_REPO_URL).pathname}`

export const githubCli: GithubCli = {
  loggedIn: () =>
    spawnSync("gh", ["auth", "token", "--hostname", "github.com"], {
      stdio: "ignore",
      timeout: 5_000,
    }).status === 0,
  star: () =>
    spawnSync("gh", ["api", "--method", "PUT", STAR_ENDPOINT, "--silent"], {
      stdio: "ignore",
      timeout: 15_000,
    }).status === 0,
}

/**
 * The wizard's one optional ask after the tour. Choosing the star stars the repository with the
 * person's own `gh` login, or opens the GitHub page when there is none or starring fails. It is
 * asked once per data folder and skipped silently without a terminal.
 */
export async function offerGithubStar(
  dataDir: string,
  interactive = canPrompt(),
  gh: GithubCli = githubCli,
): Promise<void> {
  if (!interactive) return
  try {
    if ((await readGithubStarAnswer(dataDir)) !== null) return
  } catch {
    return
  }
  const direct = gh.loggedIn()
  const choice = await select({
    message: t("star.ask"),
    options: [
      direct
        ? {
            value: "starred" as const,
            label: t("star.star"),
            hint: t("star.starHint"),
          }
        : {
            value: "opened" as const,
            label: t("star.open"),
            hint: t("star.openHint"),
          },
      { value: "skipped" as const, label: t("star.skip"), hint: t("star.skipHint") },
    ],
  })
  const picked: GithubStarAnswer = isCancel(choice) ? "skipped" : choice
  const answer: GithubStarAnswer = picked === "starred" && !gh.star() ? "opened" : picked
  // A failed save only means the wizard may ask once more.
  await saveGithubStarAnswer(dataDir, answer).catch(() => undefined)
  if (answer === "starred") {
    log.success(t("star.starred"))
  } else if (answer === "opened") {
    openBrowser(GITHUB_REPO_URL)
    const lead = picked === "starred" ? t("star.openedFallback") : t("star.thanks")
    log.success(`${t("star.pressStar", { lead })}\n${link(GITHUB_REPO_URL)}`)
  } else {
    log.info(gray(t("star.skipped")))
  }
}

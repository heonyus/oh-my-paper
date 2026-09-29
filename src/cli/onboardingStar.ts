import { isCancel, log, select } from "@clack/prompts"
import { readGithubStarAnswer, saveGithubStarAnswer } from "../server/githubStarStore"
import { GITHUB_REPO_URL } from "../shared/githubStar"
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

/**
 * The wizard's one optional ask after the tour: open the GitHub page so the person can star it
 * themselves. It is asked once per data folder and skipped silently without a terminal.
 */
export async function offerGithubStar(dataDir: string, interactive = canPrompt()): Promise<void> {
  if (!interactive) return
  try {
    if ((await readGithubStarAnswer(dataDir)) !== null) return
  } catch {
    return
  }
  const choice = await select({
    message: "oh-my-paper가 도움이 된다면 GitHub에서 ⭐ 하나 부탁드려요",
    options: [
      {
        value: "opened" as const,
        label: "⭐ GitHub 열고 별 달기",
        hint: "브라우저에서 저장소 페이지가 열려요",
      },
      { value: "skipped" as const, label: "괜찮아요, 건너뛸게요", hint: "다시 묻지 않아요" },
    ],
  })
  const answer = isCancel(choice) ? "skipped" : choice
  // A failed save only means the wizard may ask once more.
  await saveGithubStarAnswer(dataDir, answer).catch(() => undefined)
  if (answer === "opened") {
    openBrowser(GITHUB_REPO_URL)
    log.success(`고마워요! 열린 페이지에서 Star를 눌러 주세요\n${link(GITHUB_REPO_URL)}`)
  } else {
    log.info(gray("건너뛰었어요 — 다시 묻지 않을게요"))
  }
}

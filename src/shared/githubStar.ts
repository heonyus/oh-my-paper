import { z } from "zod"

/** The project page. The app stars it only when the person chooses to, with their own `gh` login. */
export const GITHUB_REPO_URL = "https://github.com/heonyus/oh-my-paper"

/**
 * The setup wizard's answer to its one star invitation: starred with the person's `gh` login,
 * GitHub was opened, or it was skipped.
 */
export const githubStarAnswerSchema = z.enum(["starred", "opened", "skipped"])

export const githubStarStatusSchema = z.object({
  answer: githubStarAnswerSchema.nullable(),
})

export type GithubStarAnswer = z.infer<typeof githubStarAnswerSchema>
export type GithubStarStatus = z.infer<typeof githubStarStatusSchema>

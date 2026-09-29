import { z } from "zod"

/** The project page; people star it there themselves, the app never stars on anyone's behalf. */
export const GITHUB_REPO_URL = "https://github.com/heonyus/oh-my-paper"

/** The setup wizard's answer to its one star invitation: GitHub was opened, or it was skipped. */
export const githubStarAnswerSchema = z.enum(["opened", "skipped"])

export const githubStarStatusSchema = z.object({
  answer: githubStarAnswerSchema.nullable(),
})

export type GithubStarAnswer = z.infer<typeof githubStarAnswerSchema>
export type GithubStarStatus = z.infer<typeof githubStarStatusSchema>

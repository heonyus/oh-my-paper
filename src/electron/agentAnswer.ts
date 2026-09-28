import type { AgentContextDoc, AgentMessage, AgentMode, AgentPaper } from "../shared/agentChat"
import { type AgentCompletionMessage, answerLanguage } from "./agentCompletion"
import type { SearchBrief } from "./paperSearchBrief"

export type AnswerPaper = { readonly paper: AgentPaper; readonly abstract: string | null }

const sharedRules = [
  "- Ground every paper-specific claim in the SEARCH RESULTS or ATTACHED LIBRARY PAPERS below.",
  "- Cite search results as [n] and attached library papers as [L1], [L2]... Only cite numbers that exist. Never invent papers, authors, numbers or findings.",
  "- Each search result was screened for relevance; its 'why relevant' note says what it contributes.",
  "- If the results do not support a claim, say so plainly instead of guessing.",
  "- Use Markdown. Do not add a bibliography; the app shows the paper cards itself.",
]

function quickSystemPrompt(question: string): string {
  return [
    "You are oh-my-paper's research agent: you find, explain and discuss academic papers.",
    `Answer in ${answerLanguage(question)}.`,
    ...sharedRules,
    "- Be concise: a short direct answer, then the most relevant papers with one line each on what they contribute. Group them when there are clear themes.",
    "- If the request was vague, state in one short line how you interpreted it.",
    "- If few or no results are relevant, say so and suggest one or two more specific ways to ask.",
  ].join("\n")
}

function deepSystemPrompt(question: string): string {
  return [
    "You are oh-my-paper's deep research agent. Write a literature review report from the screened papers below.",
    `Write the whole report in ${answerLanguage(question)}, including headings.`,
    ...sharedRules,
    "Structure the report with these sections (translate the headings):",
    "1. Summary: 3-5 sentences answering the request directly.",
    "2. Scope: how the request was interpreted and any assumptions.",
    "3. Research directions: group the papers into 2-5 themes; for each theme explain the core idea, how the approaches differ, and cite the papers.",
    "4. Key papers: the 5-8 most important papers, one or two lines each on their contribution.",
    "5. Trade-offs and open problems: limitations, disagreements and gaps visible in these papers.",
    "6. Reading order: a suggested order to read the key papers, with a short reason for each.",
    "Base statements on titles, abstracts and the relevance notes; do not claim details you cannot see.",
  ].join("\n")
}

function metaLine(parts: readonly (string | number | null)[]): string {
  return parts.filter((part) => part !== null && part !== "").join(", ")
}

function answerInput(input: {
  readonly question: string
  readonly brief: SearchBrief
  readonly contextDocs: readonly AgentContextDoc[]
  readonly papers: readonly AnswerPaper[]
  readonly searchNote: string
}): string {
  const parts = [`QUESTION:\n${input.question}`]
  if (input.brief.interpretation) parts.push(`INTERPRETATION:\n${input.brief.interpretation}`)
  if (input.contextDocs.length > 0) {
    parts.push(
      `ATTACHED LIBRARY PAPERS:\n${input.contextDocs
        .map(
          (doc, index) =>
            `[L${index + 1}] "${doc.title}" (${metaLine([doc.authors.slice(0, 3).join(", "), doc.year ?? "n.d."])})\nexcerpt: ${doc.excerpt}`,
        )
        .join("\n\n")}`,
    )
  }
  const results = input.papers.map(({ paper, abstract }, index) => {
    const meta = metaLine([
      paper.authors.slice(0, 3).join(", "),
      paper.year ?? "n.d.",
      paper.venue,
      paper.citationCount === null ? null : `cited ${paper.citationCount}`,
    ])
    const why = paper.reason ? `\nwhy relevant: ${paper.reason}` : ""
    const text = abstract ? `\nabstract: ${abstract.slice(0, 900)}` : ""
    return `[${index + 1}] "${paper.title}" (${meta})${why}${text}`
  })
  parts.push(
    results.length > 0
      ? `SEARCH RESULTS (${input.searchNote}):\n${results.join("\n\n")}`
      : `SEARCH RESULTS: none were relevant (${input.searchNote}).`,
  )
  return parts.join("\n\n")
}

export function answerMessages(input: {
  readonly mode: AgentMode
  readonly question: string
  readonly history: readonly AgentMessage[]
  readonly brief: SearchBrief
  readonly contextDocs: readonly AgentContextDoc[]
  readonly papers: readonly AnswerPaper[]
  readonly searchNote: string
}): AgentCompletionMessage[] {
  return [
    {
      role: "system",
      content:
        input.mode === "deep"
          ? deepSystemPrompt(input.question)
          : quickSystemPrompt(input.question),
    },
    ...input.history.map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: answerInput(input) },
  ]
}

/** Drops citation markers that point outside the numbered results the model was given. */
export function sanitizeCitations(text: string, paperCount: number, libraryCount: number): string {
  return text
    .replace(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/gu, (match, body: string) => {
      const numbers = body.split(/\s*[,–-]\s*/u).map(Number)
      const valid = numbers.filter((value) => value >= 1 && value <= paperCount)
      if (valid.length === numbers.length) return match
      return valid.length > 0 ? `[${valid.join(", ")}]` : ""
    })
    .replace(/\[L(\d+)\]/gu, (match, value: string) =>
      Number(value) >= 1 && Number(value) <= libraryCount ? match : "",
    )
}

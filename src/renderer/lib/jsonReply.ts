/** Parses a model reply that should be JSON, tolerating a Markdown code fence around it. */
export function parseJsonReply(value: string): unknown {
  return JSON.parse(
    value
      .trim()
      .replace(/^```(?:json)?\s*/iu, "")
      .replace(/\s*```$/u, "")
      .trim(),
  )
}

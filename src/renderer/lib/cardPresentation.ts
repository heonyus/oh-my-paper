const genericSuffix = /\s*(?:해설|분석|카드)$/u

export function conciseCardTitle(value: string, fallback: string): string {
  const first = value
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,3}\s+/u, "")
        .replace(/^[-*]\s+/u, "")
        .trim(),
    )
    .find(Boolean)
  const source = (first ?? fallback).replace(genericSuffix, "").trim()
  return source.length > 42 ? `${source.slice(0, 41).trim()}…` : source || fallback
}

export function parsedCardResponse(
  value: string,
  fallbackTitle: string,
): { readonly title: string; readonly body: string } {
  const lines = value.trim().split("\n")
  const heading = lines[0]?.match(/^#\s+(.+)$/u)
  if (!heading?.[1]) return { title: conciseCardTitle(value, fallbackTitle), body: value.trim() }
  return {
    title: conciseCardTitle(heading[1], fallbackTitle),
    body: lines.slice(1).join("\n").trim(),
  }
}

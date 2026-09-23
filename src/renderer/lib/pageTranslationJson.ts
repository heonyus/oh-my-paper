import { pageTranslationResponseSchema } from "../../shared/pageTranslationProtocol"

const delimitedBlockPattern = /^\s*@@([A-Za-z0-9._:-]+)@@(?:\s?(.*))?\s*$/u

const echoedWrapperTagPattern =
  /^\s*<\/?(?:CURRENT_PAGE|PAPER_CONTEXT|CURRENT_SECTION|SOURCE_EVIDENCE|LOCAL_BEFORE|LOCAL_AFTER|USER_QUESTION_OR_TARGET)\s*>\s*$/u

// Hy-MT sometimes emits the literal word "translation" as a block's content by
// copying the `@@ID@@ translation` template. Treat that placeholder as missing
// so the block falls through to the retry path instead of being cached.
export function isPlaceholderPageTranslation(markdown: string): boolean {
  return markdown.trim().toLowerCase() === "translation"
}

function escapedControlCharacter(character: string): string {
  switch (character) {
    case "\b":
      return "\\\\b"
    case "\f":
      return "\\\\f"
    case "\n":
      return "\\\\n"
    case "\r":
      return "\\\\r"
    case "\t":
      return "\\\\t"
    default:
      return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  }
}

function repairJsonStringControls(value: string): string {
  let repaired = ""
  let insideString = false
  let escaped = false
  for (const character of value) {
    if (!insideString) {
      repaired += character
      if (character === '"') insideString = true
      continue
    }
    if (escaped) {
      repaired += character
      escaped = false
      continue
    }
    if (character === "\\") {
      repaired += character
      escaped = true
      continue
    }
    if (character === '"') {
      repaired += character
      insideString = false
      continue
    }
    repaired += character.charCodeAt(0) < 32 ? escapedControlCharacter(character) : character
  }
  return repaired
}

function parseDelimitedPageTranslation(value: string) {
  const translations: Array<{ id: string; markdown: string }> = []
  let currentId: string | undefined
  let currentLines: string[] = []

  function finishCurrent(): void {
    if (!currentId) return
    const markdown = currentLines.join("\n").trim()
    if (markdown.length > 0 && !isPlaceholderPageTranslation(markdown))
      translations.push({ id: currentId, markdown })
  }

  for (const line of value.replace(/^```(?:text|markdown)?\s*$/gim, "").split("\n")) {
    const match = delimitedBlockPattern.exec(line)
    if (match) {
      finishCurrent()
      currentId = match[1]
      currentLines = match[2] ? [match[2]] : []
      continue
    }
    if (currentId && !echoedWrapperTagPattern.test(line)) currentLines.push(line)
  }
  finishCurrent()

  if (translations.length === 0) return null
  try {
    return pageTranslationResponseSchema.parse({ translations })
  } catch (error) {
    if (error instanceof Error) return null
    throw error
  }
}

export function parsePageTranslationResponse(value: string) {
  try {
    return pageTranslationResponseSchema.parse(JSON.parse(value))
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
  const repaired = repairJsonStringControls(value)
  if (repaired !== value) {
    try {
      return pageTranslationResponseSchema.parse(JSON.parse(repaired))
    } catch (error) {
      if (!(error instanceof Error)) throw error
    }
  }
  return parseDelimitedPageTranslation(value)
}

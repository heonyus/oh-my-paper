import { pageTranslationResponseSchema } from "../../shared/pageTranslationProtocol"

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

export function parsePageTranslationResponse(value: string) {
  try {
    return pageTranslationResponseSchema.parse(JSON.parse(value))
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
  const repaired = repairJsonStringControls(value)
  if (repaired === value) return null
  try {
    return pageTranslationResponseSchema.parse(JSON.parse(repaired))
  } catch (error) {
    if (error instanceof Error) return null
    throw error
  }
}

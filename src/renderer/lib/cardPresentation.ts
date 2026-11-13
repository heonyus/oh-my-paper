import { z } from "zod"
import type { BoardCard, Workspace } from "../types"
import { interruptedCardBody } from "./structureCardState"

const genericSuffix = /\s*(?:해설|분석|카드)$/u
/** However many the model lists, in whichever of the shapes models answer in. */
const wordTranslationSchema = z.union([
  z.object({ meanings: z.array(z.string()).min(1) }).transform((value) => value.meanings),
  z.object({ meaning: z.string() }).transform((value) => [value.meaning]),
  z.array(z.string()).min(1),
])
const MEANINGS_SHOWN = 3

export function translationSelectionTitle(value: string): string | null {
  const trimmed = value.trim().replace(/^["'`]+|["'`.,;:!?]+$/gu, "")
  return /^[A-Za-z][A-Za-z'-]*$/u.test(trimmed) ? trimmed : null
}

/** A word or a phrase of a few English words: a translation of it is a word translation. */
export function shortEnglishSelection(value: string): boolean {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length > 60) return false
  const words = normalized.split(" ")
  return (
    words.length <= 5 && words.every((word) => /^[A-Za-z0-9][A-Za-z0-9'’-]*[.,;:!?]?$/u.test(word))
  )
}

export function translationCardTitle(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ")
  const word = translationSelectionTitle(normalized)
  if (word) return word
  return shortEnglishSelection(normalized) ? normalized : "문단 번역"
}

function cleanMeaning(value: string): string {
  return value
    .replace(/^\s*\d+[.)]\s*/u, "")
    .replace(/[*_"']/gu, "")
    .replace(/[.。]\s*$/u, "")
    .trim()
}

function parsedJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * The meanings in the JSON a model was asked for. Models wrap it in a code fence, lead up to
 * it with a line of their own or add a remark after it, and list more meanings than asked;
 * none of that loses the meanings.
 */
function jsonMeanings(value: string): readonly string[] {
  const unfenced = value.trim().replace(/^```(?:json)?\s*|\s*```$/gu, "")
  const embedded = unfenced.match(/\{[\s\S]*\}|\[[\s\S]*\]/u)?.[0]
  for (const candidate of [unfenced, embedded]) {
    if (!candidate) continue
    const result = wordTranslationSchema.safeParse(parsedJson(candidate))
    if (!result.success) continue
    const meanings = result.data.map(cleanMeaning).filter(Boolean)
    if (meanings.length > 0) return meanings.slice(0, MEANINGS_SHOWN)
  }
  return []
}

const korean = /[가-힣]/u

/** The Korean a line of prose offers as meanings: after a label, or in brackets after the word. */
function proseMeanings(line: string): readonly string[] {
  const bracketed = [...line.matchAll(/\(([^()]*)\)/gu)].map((match) => match[1] ?? "")
  const plain = line.replace(/\([^()]*\)/gu, " ")
  const afterLabel = plain.split(":").at(-1) ?? ""
  for (const candidate of [afterLabel, plain, ...bracketed]) {
    const meanings = candidate
      .split(/[,/·]/u)
      .map(cleanMeaning)
      .filter((meaning) => korean.test(meaning))
    if (meanings.length > 0) return meanings.slice(0, MEANINGS_SHOWN)
  }
  return []
}

function legacyMeanings(value: string): readonly string[] {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const numbered = lines
    .map((line) => line.match(/^\d+[.)]\s*(.+)$/u)?.[1])
    .filter((line): line is string => Boolean(line))
    .map(cleanMeaning)
    .filter(Boolean)
  if (numbered.length > 0) return numbered.slice(0, MEANINGS_SHOWN)
  const boldKorean = [...value.matchAll(/\*\*([^*]+)\*\*/gu)]
    .map((match) => match[1] ?? "")
    .filter((match) => korean.test(match))
    .flatMap((match) => match.split(/[,/·]/u))
    .map(cleanMeaning)
    .filter(Boolean)
  if (boldKorean.length > 0) return boldKorean.slice(0, MEANINGS_SHOWN)
  for (const line of lines) {
    const meanings = proseMeanings(line)
    if (meanings.length > 0) return meanings
  }
  // Nothing Korean to pick out (a term the model left as it is, a gloss in another language):
  // what it said is still an answer, and showing it beats showing nothing.
  const said = cleanMeaning(lines[0] ?? "")
  return said ? [said] : []
}

/** The meanings a word translation card lists, in order, without their numbering or emphasis. */
export function translationMeanings(body: string): readonly string[] {
  const lines = body.trim().split("\n")
  const meanings = lines.map((line) => line.match(/^\s*\d+[.)]\s*(.+)$/u)?.[1])
  if (meanings.length === 0 || meanings.some((meaning) => !meaning)) return []
  return meanings.map((meaning) => (meaning ?? "").replace(/\*\*/gu, "").trim()).filter(Boolean)
}

function formatMeanings(meanings: readonly string[]): string {
  return meanings
    .map((meaning, index) => `${index + 1}. ${index === 0 ? `**${meaning}**` : meaning}`)
    .join("\n")
}

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

export function parsedTranslationResponse(
  value: string,
  selectedText: string,
): { readonly title: string; readonly body: string } {
  const title = translationCardTitle(selectedText)
  // An answer with nothing in it is no translation: the card says so and can ask again.
  if (!value.trim()) return { title, body: interruptedCardBody }
  if (!shortEnglishSelection(selectedText)) return { title, body: value.trim() }
  const fromJson = jsonMeanings(value)
  const meanings = fromJson.length > 0 ? fromJson : legacyMeanings(value)
  return { title, body: meanings.length > 0 ? formatMeanings(meanings) : interruptedCardBody }
}

/** A translation that never arrived, or arrived empty: there is nothing to show but a retry. */
export function translationMissing(card: Pick<BoardCard, "body" | "loading">): boolean {
  return !card.loading && (card.body.trim() === "" || card.body === interruptedCardBody)
}

export function normalizeWorkspaceTranslations(workspace: Workspace): Workspace {
  let changed = false
  const cards = workspace.cards.map((card): BoardCard => {
    if (card.kind === "note" && card.title.trim() === "번역 주석") {
      changed = true
      return { ...card, kind: "highlight" }
    }
    if (card.kind !== "translation" || card.loading || card.body === interruptedCardBody)
      return card
    // Saved before an empty answer was told apart from a translation: an empty card.
    if (!card.body.trim()) {
      changed = true
      return { ...card, body: interruptedCardBody }
    }
    const parsed = parsedTranslationResponse(card.body, card.anchor.quote)
    if (parsed.title === card.title && parsed.body === card.body) return card
    changed = true
    return { ...card, ...parsed }
  })
  return changed ? { ...workspace, cards } : workspace
}

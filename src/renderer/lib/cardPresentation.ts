import { z } from "zod"
import type { BoardCard, Workspace } from "../types"
import { interruptedCardBody } from "./structureCardState"

const genericSuffix = /\s*(?:해설|분석|카드)$/u
const wordTranslationSchema = z.object({
  meanings: z.array(z.string().trim().min(1)).min(1).max(3),
})

export function translationSelectionTitle(value: string): string | null {
  const trimmed = value.trim().replace(/^["'`]+|["'`.,;:!?]+$/gu, "")
  return /^[A-Za-z][A-Za-z'-]*$/u.test(trimmed) ? trimmed : null
}

function shortEnglishSelection(value: string): boolean {
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

function legacyMeanings(value: string): readonly string[] {
  const numbered = value
    .split("\n")
    .map((line) => line.match(/^\s*\d+[.)]\s*(.+)$/u)?.[1])
    .filter((line): line is string => Boolean(line))
    .map(cleanMeaning)
    .filter(Boolean)
  if (numbered.length > 0) return numbered.slice(0, 3)
  const boldKorean = [...value.matchAll(/\*\*([^*]+)\*\*/gu)]
    .map((match) => match[1] ?? "")
    .filter((match) => /[가-힣]/u.test(match))
    .flatMap((match) => match.split(/[,/·]/u))
    .map(cleanMeaning)
    .filter(Boolean)
  if (boldKorean.length > 0) return boldKorean.slice(0, 3)
  const concise = value.split(/\n|\(/u)[0]?.split(":").at(-1) ?? ""
  return concise
    .split(/[,/·]/u)
    .map(cleanMeaning)
    .filter((meaning) => /[가-힣]/u.test(meaning))
    .slice(0, 3)
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
  if (!shortEnglishSelection(selectedText)) return { title, body: value.trim() }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    parsed = null
  }
  const result = wordTranslationSchema.safeParse(parsed)
  const meanings = result.success ? result.data.meanings.map(cleanMeaning) : legacyMeanings(value)
  return { title, body: formatMeanings(meanings) }
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
    const parsed = parsedTranslationResponse(card.body, card.anchor.quote)
    if (parsed.title === card.title && parsed.body === card.body) return card
    changed = true
    return { ...card, ...parsed }
  })
  return changed ? { ...workspace, cards } : workspace
}

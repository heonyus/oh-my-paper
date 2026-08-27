import { cropFeatureImage } from "./pdfFeatureDom"
import type { DetectedStructure } from "./structureDetector"

const latexSymbolMap = {
  "∼": "\\sim",
  "~": "\\sim",
  "≤": "\\le",
  "≥": "\\ge",
  "≈": "\\approx",
  "±": "\\pm",
  "×": "\\times",
  "÷": "\\div",
  "∞": "\\infty",
  "∑": "\\sum",
  "∫": "\\int",
  "√": "\\sqrt",
  "∆": "\\Delta",
  Δ: "\\Delta",
  θ: "\\theta",
  σ: "\\sigma",
  μ: "\\mu",
  φ: "\\phi",
  π: "\\pi",
} as const

const subscriptMap = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "₊": "+",
  "₋": "-",
  "₌": "=",
  "₍": "(",
  "₎": ")",
  ᵢ: "i",
  ⱼ: "j",
  ₐ: "a",
  ₑ: "e",
  ₙ: "n",
  ₓ: "x",
} as const

type LatexSymbol = keyof typeof latexSymbolMap
type SubscriptCharacter = keyof typeof subscriptMap

function isLatexSymbol(character: string): character is LatexSymbol {
  return character in latexSymbolMap
}

function isSubscriptCharacter(character: string): character is SubscriptCharacter {
  return character in subscriptMap
}

function replaceSubscripts(input: string): string {
  let output = ""
  let index = 0
  while (index < input.length) {
    const character = input[index]
    if (!character || !isSubscriptCharacter(character)) {
      output += character ?? ""
      index += 1
      continue
    }
    let token = ""
    while (index < input.length) {
      const next = input[index]
      if (!next || !isSubscriptCharacter(next)) break
      token += subscriptMap[next]
      index += 1
    }
    output += token.length === 1 ? `_${token}` : `_{${token}}`
  }
  return output
}

function recoverSpacedSubscripts(input: string): string {
  return input
    .replace(/\b([A-Za-z])\s+([ijkntm])\s*-\s*(\d+)\b/gu, "$1_{$2-$3}")
    .replace(/\b([A-Za-z])\s+([ijkntm])\b/gu, "$1_$2")
}

export function equationToLatex(equation: string): string {
  const normalized = recoverSpacedSubscripts(
    replaceSubscripts(equation.trim()).replaceAll("−", "-"),
  )
  let latex = ""
  for (const character of normalized) {
    latex += isLatexSymbol(character) ? latexSymbolMap[character] : character
  }
  return latex.replace(/\s+/gu, " ").trim()
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(",")
  if (!header || !body) throw new Error("invalid data url")
  const bytes = Uint8Array.from(atob(body), (character) => character.charCodeAt(0))
  const mime = header.match(/^data:([^;]+);base64$/u)?.[1] ?? "image/png"
  return new Blob([bytes], { type: mime })
}

export async function copyFeature(
  pageElement: HTMLElement,
  structure: DetectedStructure,
): Promise<void> {
  if (structure.kind === "equation") {
    await navigator.clipboard.writeText(equationToLatex(structure.quote))
    return
  }
  const imageDataUrl = cropFeatureImage(pageElement, {
    kind: structure.kind === "section" ? "heading" : structure.kind,
    pageNumber: structure.page,
    rect: structure.bounds,
    label: structure.title,
    context: structure.quote,
    priority: 1,
    sourceSpanIds: [],
  })
  if (!imageDataUrl) throw new Error("feature image unavailable")
  const blob = dataUrlToBlob(imageDataUrl)
  if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
    return
  }
  await navigator.clipboard.writeText(structure.quote)
}

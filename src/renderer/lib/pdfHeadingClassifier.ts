import type { PdfTextSpan } from "./pdfFeatureDetection"
import { normalizeExtractedPdfText } from "./pdfTextLines"

const NAMED_SECTIONS =
  /^(?:Abstract|Introduction|Background|Related\s+Works?|Methodology|Methods|Framework|Approach|Model|Architecture|System|Experiments|Experimental\s+Setup|Results|Evaluation|Discussion|Analysis|Ablation(?:\s+Stud(?:y|ies))?|Conclusions?|Future\s+Work|Limitations|Ethical\s+Considerations|Broader\s+Impacts?|References|Bibliography|Appendix|Appendices|Acknowledgements?)$/iu

const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)\.?\s+(.{3,120})$/u
const APPENDIX_HEADING = /^([A-Z])((?:\.\d+)*)\.?\s+(.{3,140})$/u
const HEADING_TITLE = /^[A-Z][A-Za-z0-9&,:;/()'’+\-\s]{2,140}$/u

export type HeadingLevel = "heading" | "subheading"

function validHeadingTitle(value: string): boolean {
  const title = value.trim()
  if (!HEADING_TITLE.test(title)) return false
  if (/[=∑∫√≤≥±≈∼~]/u.test(title)) return false
  if (/[.?!]$/u.test(title) && title.length > 48) return false
  return (title.match(/[A-Za-z]{2,}/gu)?.length ?? 0) >= 1
}

function hasHeadingCapitalization(value: string): boolean {
  const words = value.match(/[A-Za-z][A-Za-z0-9'-]*/gu) ?? []
  if (words.length <= 5) return true
  const capitalized = words.filter((word) => /^[A-Z]/u.test(word)).length
  return capitalized / words.length >= 0.35
}

export function normalizedHeadingText(value: string): string {
  const leadingAppendix = value.trim().match(/^([A-Z])\s+([A-Z][A-Z\s&,:;/()'’+-]{3,140})$/u)
  const normalized =
    leadingAppendix?.[1] && leadingAppendix[2]
      ? `${leadingAppendix[1]} ${normalizeExtractedPdfText(leadingAppendix[2])}`
      : normalizeExtractedPdfText(value)
  return normalized.replace(/\s+([,:;])/gu, "$1")
}

export function headingLevel(value: string): HeadingLevel | null {
  const text = normalizedHeadingText(value)
  if (NAMED_SECTIONS.test(text)) return "heading"
  const numbered = text.match(NUMBERED_HEADING)
  if (numbered?.[1] && numbered[2] && Number(numbered[1].split(".")[0]) <= 99) {
    if (!validHeadingTitle(numbered[2]) || !hasHeadingCapitalization(numbered[2])) return null
    return numbered[1].includes(".") ? "subheading" : "heading"
  }
  const appendix = text.match(APPENDIX_HEADING)
  if (!appendix?.[1] || !appendix[3] || !validHeadingTitle(appendix[3])) return null
  return appendix[2] ? "subheading" : "heading"
}

export function isSectionHeadingSpan(span: PdfTextSpan, pageWidth: number): boolean {
  const level = headingLevel(span.text)
  if (!level) return false
  const normalizedSize = (span.fontSize * 600) / pageWidth
  const minimumWidth = pageWidth * 0.075
  if (span.width < minimumWidth) return false
  return normalizedSize >= (level === "subheading" ? 8.4 : 8.8)
}

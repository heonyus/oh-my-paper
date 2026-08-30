import type { PageOverlayState } from "./pdfOverlayAnalysis"
import type { BibliographyMap } from "./structureDetector"

export function enrichOverlayCitations(
  pages: Readonly<Record<number, PageOverlayState>>,
  bibliography: BibliographyMap,
): Readonly<Record<number, PageOverlayState>> {
  return Object.fromEntries(
    Object.entries(pages).map(([key, value]) => [
      key,
      {
        ...value,
        structures: value.structures.map((structure) => {
          if (structure.kind !== "citation") return structure
          const numericKey = structure.quote.match(/\[(\d+)/u)?.[1]
          const authorYear = structure.quote.match(
            /([A-Z][A-Za-z-]+)(?:\s+et al\.)?,?\s+(\d{4}[a-z]?)/u,
          )
          const citationKey =
            numericKey ??
            (authorYear?.[1] && authorYear[2]
              ? `${authorYear[1].toLowerCase()}-${authorYear[2]}`
              : undefined)
          const reference = citationKey ? bibliography[citationKey] : undefined
          return reference ? { ...structure, reference } : structure
        }),
      },
    ]),
  )
}

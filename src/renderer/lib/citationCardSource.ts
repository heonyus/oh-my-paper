import type { CitationPaper } from "../../shared/ipc"
import type { BoardCard } from "../../shared/schemas"

export type CitationCardSource = {
  readonly sourceUrl: string | null
  readonly sourceMeta: NonNullable<BoardCard["sourceMeta"]>
}

export function citationCardSource(paper: CitationPaper): CitationCardSource {
  return {
    sourceUrl:
      paper.openAccessUrl ??
      paper.url ??
      (paper.doi
        ? `https://doi.org/${paper.doi}`
        : paper.paperId.startsWith("https://")
          ? paper.paperId
          : null),
    sourceMeta: {
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      venue: paper.venue,
      abstract: paper.abstract,
      doi: paper.doi,
      url: paper.url,
      citationCount: paper.citationCount,
    },
  }
}

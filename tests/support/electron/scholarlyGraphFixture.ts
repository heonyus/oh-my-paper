import { MockAgent, setGlobalDispatcher } from "undici"

const id = (index: number): string => `https://openalex.org/W${100 + index}`

const papers = Array.from({ length: 24 }, (_, index) => ({
  id: id(index),
  title:
    index === 0
      ? "Synthetic evidence networks for research"
      : `Synthetic study ${index}: 연구 근거와 평가 조건의 비교`,
  publication_year: index === 23 ? null : 2014 + (index % 12),
  doi: `https://doi.org/10.5555/scourgify-qa-${index}`,
  authorships: [{ author: { display_name: `Researcher ${index}` } }],
  cited_by_count: index === 23 ? null : index === 0 ? 42 : (index * 17) % 120,
  primary_location: { landing_page_url: `https://example.org/synthetic-paper-${index}` },
  abstract_inverted_index: {
    Synthetic: [0],
    metadata: [1],
    for: [2],
    deterministic: [3],
    graph: [4],
    interaction: [5],
    testing: [6],
  },
  referenced_works:
    index === 0
      ? Array.from({ length: 11 }, (_, offset) => id(offset + 1))
      : index >= 12
        ? [id(0), id(index - 10)]
        : [id(Math.max(1, index - 1))].filter((value) => value !== id(index)),
  related_works: Array.from({ length: 8 }, (_, offset) => id((index + offset + 1) % 24)),
}))

export function installScholarlyGraphFixture(): void {
  const mock = new MockAgent()
  mock.disableNetConnect()
  mock
    .get("https://api.openalex.org")
    .intercept({ method: "GET", path: /^\/works/ })
    .reply(({ path }) => {
      const url = new URL(path, "https://api.openalex.org")
      const recordId = decodeURIComponent(url.pathname.slice("/works/".length))
      if (url.pathname !== "/works") {
        const paper = papers.find(
          (candidate) => candidate.id.endsWith(`/${recordId}`) || candidate.doi === recordId,
        )
        return { statusCode: paper ? 200 : 404, data: JSON.stringify(paper ?? {}) }
      }
      const filter = url.searchParams.get("filter") ?? ""
      const citedId = filter.startsWith("cites:") ? filter.slice("cites:".length) : null
      const result = citedId
        ? papers.filter((paper) =>
            paper.referenced_works.some((reference) => reference.endsWith(citedId)),
          )
        : filter.startsWith("ids.openalex:") || filter.startsWith("openalex:")
          ? papers.filter(
              (paper) =>
                filter.includes(paper.id) || filter.includes(paper.id.split("/").at(-1) ?? ""),
            )
          : papers
      const limit = Number(url.searchParams.get("per-page") ?? 25)
      return {
        statusCode: 200,
        data: JSON.stringify({ meta: { count: result.length }, results: result.slice(0, limit) }),
      }
    })
    .persist()
  setGlobalDispatcher(mock)
}

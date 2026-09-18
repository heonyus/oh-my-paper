import { selectCitationPaper } from "../electron/citationMatching"
import { parseJson, parsePapers } from "../electron/citationProviderParsers"
import { citationLookupRequestSchema, citationLookupResultSchema } from "../shared/ipc"
import { findOwnedDocument } from "./documentStore"
import { HttpError, json } from "./http"
import type { WebDocumentId } from "./schemas"

export async function lookupDocumentCitation(
  request: Request,
  env: Env,
  userId: string,
  documentId: WebDocumentId,
): Promise<Response> {
  if (!(await findOwnedDocument(env.DB, userId, documentId)))
    throw new HttpError(404, "document_not_found")
  const input = citationLookupRequestSchema.parse(await request.json())
  const query = [input.doi, input.title, input.authors, input.year, input.context]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ")
    .slice(0, 500)
  if (!query)
    return json(
      citationLookupResultSchema.parse({ status: "not_found", paper: null, query: input.key }),
    )
  const params = new URLSearchParams({
    query,
    limit: "5",
    fields: "paperId,title,authors,year,venue,abstract,externalIds,url,openAccessPdf,citationCount",
  })
  const response = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
  )
  if (!response.ok)
    return json(citationLookupResultSchema.parse({ status: "not_found", paper: null, query }))
  const match = selectCitationPaper(parsePapers(parseJson(await response.text())), input)
  return json(
    citationLookupResultSchema.parse(
      match
        ? {
            status: "found",
            paper: match.paper,
            match: {
              score: match.score,
              signals: match.signals,
              candidatesCompared: match.candidatesCompared,
            },
            query,
          }
        : { status: "not_found", paper: null, query },
    ),
  )
}

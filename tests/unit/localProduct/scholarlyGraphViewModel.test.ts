import { describe, expect, it } from "vitest"
import {
  axisAvailability,
  edgeIsAdjacent,
  graphPositions,
  pushGraphHistory,
} from "../../../src/renderer/components/discovery/scholarlyGraphViewModel"
import { scholarlyGraphResultSchema } from "../../../src/shared/scholarlyGraphSchemas"

const article = (id: string, year: number | null, citationCount: number | null) => ({
  id: `https://openalex.org/${id}`,
  provider: "openalex" as const,
  title: `Paper ${id}`,
  authors: [`Author ${id}`],
  year,
  citationCount,
  doi: null,
  sourceUrl: `https://openalex.org/${id}`,
  abstract: null,
})

const historyResult = scholarlyGraphResultSchema.parse({
  status: "complete",
  provider: "openalex",
  seedIds: ["https://openalex.org/A"],
  nodes: [article("A", 2024, 3)],
  edges: [],
  directions: [
    {
      direction: "related",
      status: "success",
      resultCount: 0,
      totalResults: 0,
      truncated: false,
      error: null,
    },
  ],
  truncated: false,
})

describe("scholarlyGraphViewModel", () => {
  it("only advertises axes when the response has enough real values", () => {
    expect(axisAvailability([article("A", 2024, null), article("B", null, 12)])).toEqual({
      year: false,
      citationCount: false,
    })
    expect(axisAvailability([article("A", 2024, 3), article("B", 2020, 12)])).toEqual({
      year: true,
      citationCount: true,
    })
  })

  it("maps known metadata and separates unknown values without hiding adjacency", () => {
    const result = scholarlyGraphResultSchema.parse({
      status: "complete",
      provider: "openalex",
      seedIds: ["https://openalex.org/A"],
      nodes: [article("A", 2024, 3), article("B", 2020, 12), article("C", null, null)],
      edges: [
        {
          sourceId: "https://openalex.org/A",
          targetId: "https://openalex.org/B",
          direction: "references",
          provenance: "openalex",
        },
      ],
      directions: [
        {
          direction: "references",
          status: "success",
          resultCount: 1,
          totalResults: 1,
          truncated: false,
          error: null,
        },
      ],
      truncated: false,
    })
    const positions = graphPositions(result, "https://openalex.org/A")
    const seedPosition = positions.get("https://openalex.org/A")
    expect(seedPosition?.x).toBeGreaterThan(1_000)
    expect(seedPosition?.y).toBe(576)
    expect(positions.get("https://openalex.org/C")?.y).toBeGreaterThan(576)
    const firstEdge = result.edges[0]
    expect(firstEdge).toBeDefined()
    if (firstEdge) {
      expect(edgeIsAdjacent(firstEdge, "https://openalex.org/A")).toBe(true)
      expect(edgeIsAdjacent(firstEdge, "https://openalex.org/C")).toBe(false)
    }
  })

  it("keeps bounded back/forward exploration history without duplicate states", () => {
    let history: readonly {
      readonly seedId: string
      readonly selectedId: string
      readonly result: typeof historyResult
    }[] = []
    for (let index = 0; index < 12; index += 1) {
      history = pushGraphHistory(history, {
        seedId: `seed-${index}`,
        selectedId: `node-${index}`,
        result: historyResult,
      })
    }
    expect(history).toHaveLength(10)
    const last = history.at(-1)
    expect(last).toBeDefined()
    if (last) expect(pushGraphHistory(history, last)).toBe(history)
  })

  it("keeps coincident metadata nodes separately selectable within the visible limit", () => {
    const result = {
      ...historyResult,
      nodes: Array.from({ length: 21 }, (_, index) => article(`W${index + 1}`, 2024, 10)),
    }
    const points = [...graphPositions(result, "https://openalex.org/W1").values()]
    for (const [index, point] of points.entries()) {
      for (const other of points.slice(index + 1)) {
        expect(Math.abs(point.x - other.x) >= 104 || Math.abs(point.y - other.y) >= 54).toBe(true)
      }
    }
  })
})

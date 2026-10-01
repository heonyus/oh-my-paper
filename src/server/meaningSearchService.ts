import { createHash } from "node:crypto"
import { join } from "node:path"
import { z } from "zod"
import {
  MEANING_SEARCH_MODEL,
  type MeaningSearchRequest,
  type MeaningSearchResult,
  type MeaningSearchState,
  type MeaningSearchStatus,
  meaningSearchRequestSchema,
} from "../shared/meaningSearch"

export type EmbeddingKind = "query" | "passage"
export type Embedder = (
  texts: readonly string[],
  kind: EmbeddingKind,
) => Promise<readonly (readonly number[])[]>

const BATCH_SIZE = 16
const MAX_CACHED_VECTORS = 20_000
const vectorsSchema = z.array(z.array(z.number().finite()))

/** EmbeddingGemma's retrieval prompts, as its model card specifies for queries and documents. */
function prompted(text: string, kind: EmbeddingKind): string {
  return kind === "query" ? `task: search result | query: ${text}` : `title: none | text: ${text}`
}

function normalized(vector: readonly number[]): readonly number[] {
  const length = Math.hypot(...vector)
  return length > 0 ? vector.map((value) => value / length) : vector
}

/** Bytes downloaded so far across the model's files, as transformers.js reports them. */
export type DownloadProgress = (loaded: number, total: number) => void

function progressReporter(onProgress: DownloadProgress | undefined) {
  const files = new Map<string, { loaded: number; total: number }>()
  return (event: unknown): void => {
    if (!onProgress || typeof event !== "object" || event === null) return
    const file = Reflect.get(event, "file")
    const loaded = Reflect.get(event, "loaded")
    const total = Reflect.get(event, "total")
    if (typeof file !== "string" || typeof loaded !== "number" || typeof total !== "number") return
    files.set(file, { loaded, total })
    let sumLoaded = 0
    let sumTotal = 0
    for (const entry of files.values()) {
      sumLoaded += entry.loaded
      sumTotal += entry.total
    }
    onProgress(sumLoaded, sumTotal)
  }
}

/** Loads EmbeddingGemma locally with transformers.js; the first use downloads the model. */
export async function loadEmbeddingGemma(
  modelDirectory: string,
  onProgress?: DownloadProgress,
): Promise<Embedder> {
  const transformers = await import("@huggingface/transformers")
  transformers.env.cacheDir = modelDirectory
  const progress_callback = progressReporter(onProgress)
  const tokenizer = await transformers.AutoTokenizer.from_pretrained(MEANING_SEARCH_MODEL, {
    progress_callback,
  })
  const model = await transformers.AutoModel.from_pretrained(MEANING_SEARCH_MODEL, {
    dtype: "q8",
    progress_callback,
  })
  return async (texts, kind) => {
    const inputs = await tokenizer(
      texts.map((text) => prompted(text, kind)),
      { padding: true, truncation: true, max_length: 512 },
    )
    const outputs: unknown = await model(inputs)
    const embedding =
      typeof outputs === "object" && outputs !== null
        ? Reflect.get(outputs, "sentence_embedding")
        : null
    if (!(embedding instanceof transformers.Tensor)) throw new Error("embedding output missing")
    return vectorsSchema.parse(embedding.tolist()).map(normalized)
  }
}

function cacheKey(text: string, kind: EmbeddingKind): string {
  return createHash("sha256").update(`${kind}\n${text}`).digest("hex")
}

function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0
  for (let index = 0; index < left.length; index += 1)
    sum += (left[index] ?? 0) * (right[index] ?? 0)
  return sum
}

/**
 * Ranks candidate passages by meaning. Everything runs on this machine; passage vectors are
 * cached by text, and calls run one at a time so a burst of typing cannot pile up work.
 */
export class MeaningSearchService {
  #state: MeaningSearchState = "idle"
  #progress: number | null = null
  #embedder: Promise<Embedder> | null = null
  #queue: Promise<void> = Promise.resolve()
  readonly #vectors = new Map<string, readonly number[]>()

  constructor(
    dataDirectory: string,
    private readonly load: (
      modelDirectory: string,
      onProgress: DownloadProgress,
    ) => Promise<Embedder> = loadEmbeddingGemma,
    private readonly modelDirectory = join(dataDirectory, "models"),
  ) {}

  state(): MeaningSearchState {
    return this.#state
  }

  /** The state, with download progress while a first start is still fetching the model. */
  status(): MeaningSearchStatus {
    return this.#state === "loading" && this.#progress !== null
      ? { state: this.#state, progress: this.#progress }
      : { state: this.#state }
  }

  prepare(): Promise<Embedder> {
    if (!this.#embedder) {
      this.#state = "loading"
      this.#progress = null
      this.#embedder = this.load(this.modelDirectory, (loaded, total) => {
        if (total > 0) this.#progress = Math.min(100, Math.round((loaded / total) * 100))
      }).then(
        (embedder) => {
          this.#state = "ready"
          this.#progress = null
          return embedder
        },
        (error: unknown) => {
          this.#state = "failed"
          this.#embedder = null
          throw error
        },
      )
    }
    return this.#embedder
  }

  rank(input: MeaningSearchRequest): Promise<MeaningSearchResult> {
    const request = meaningSearchRequestSchema.parse(input)
    const run = this.#queue.then(async () => {
      const embed = await this.prepare()
      const [query] = await embed([request.query], "query")
      if (!query) throw new Error("query embedding missing")
      const texts = request.candidates.map((candidate) => candidate.text)
      const vectors = await this.#passages(embed, texts)
      const results = request.candidates
        .map((candidate, index) => ({ id: candidate.id, score: dot(query, vectors[index] ?? []) }))
        .sort((left, right) => right.score - left.score)
        .slice(0, request.limit)
      return { model: MEANING_SEARCH_MODEL, results }
    })
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async #passages(
    embed: Embedder,
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    const missing = [
      ...new Set(texts.filter((text) => !this.#vectors.has(cacheKey(text, "passage")))),
    ]
    for (let start = 0; start < missing.length; start += BATCH_SIZE) {
      const batch = missing.slice(start, start + BATCH_SIZE)
      const vectors = await embed(batch, "passage")
      batch.forEach((text, index) => {
        const vector = vectors[index]
        if (vector) this.#vectors.set(cacheKey(text, "passage"), vector)
      })
    }
    while (this.#vectors.size > MAX_CACHED_VECTORS) {
      const oldest = this.#vectors.keys().next().value
      if (oldest === undefined) break
      this.#vectors.delete(oldest)
    }
    return texts.map((text) => this.#vectors.get(cacheKey(text, "passage")) ?? [])
  }
}

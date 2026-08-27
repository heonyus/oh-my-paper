import { type DetectPdfFeaturesInput, detectPdfFeatures } from "../lib/pdfFeatureDetection"
import { layoutRequestSchema, layoutResponseSchema } from "../lib/pdfLayoutWorkerProtocol"

type WorkerScope = {
  postMessage(message: unknown): void
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void
}

const workerScope: WorkerScope = globalThis

function respond(message: unknown): void {
  workerScope.postMessage(layoutResponseSchema.parse(message))
}

workerScope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const parsed = layoutRequestSchema.safeParse(event.data)
  if (!parsed.success) return
  try {
    const input: DetectPdfFeaturesInput = {
      ...parsed.data.input,
      spans: parsed.data.input.spans.map((span) => {
        const { rotation, ...required } = span
        return rotation === undefined ? required : { ...required, rotation }
      }),
    }
    const features = detectPdfFeatures(input).map((feature) => ({
      ...feature,
      sourceSpanIds: [...feature.sourceSpanIds],
    }))
    respond({ id: parsed.data.id, ok: true, features })
  } catch (error: unknown) {
    respond({
      id: parsed.data.id,
      ok: false,
      error: error instanceof Error ? error.message : "PDF layout analysis failed",
    })
  }
})

export class WebFeatureUnavailableError extends Error {
  readonly name = "WebFeatureUnavailableError"

  constructor(readonly feature: string) {
    super(`web feature unavailable: ${feature}`)
  }
}

export function unavailableWebFeature(feature: string): () => Promise<never> {
  return () => Promise.reject(new WebFeatureUnavailableError(feature))
}

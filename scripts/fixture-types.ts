export type FixtureDocumentId = string & { readonly __brand: unique symbol }

export type FixtureMetadata = {
  readonly title: string
  readonly author: string
  readonly subject: string
  readonly keywords: readonly string[]
  readonly producer: string
  readonly creator: string
  readonly creationDate: Date
  readonly modificationDate: Date
}

export type FixtureOptions = {
  readonly title?: string
  readonly author?: string
  readonly subject?: string
  readonly keywords?: readonly string[]
  readonly creationDate?: Date
  readonly modificationDate?: Date
}

export type FixtureGenerationResult = {
  readonly outputPath: string
  readonly byteLength: number
  readonly pageCount: number
  readonly metadata: FixtureMetadata
}

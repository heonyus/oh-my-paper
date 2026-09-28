function optionalKey(value: string | undefined): string | undefined {
  const key = value?.trim()
  return key ? key : undefined
}

/** Optional free keys that raise Semantic Scholar and OpenAlex rate limits. */
export function scholarlyApiKeys(env: Readonly<Record<string, string | undefined>> = process.env): {
  readonly s2: string | undefined
  readonly openAlex: string | undefined
} {
  const { OH_MY_PAPER_S2_API_KEY: s2Key, OH_MY_PAPER_OPENALEX_API_KEY: openAlexKey } = env
  return { s2: optionalKey(s2Key), openAlex: optionalKey(openAlexKey) }
}

import type { LookupFunction } from "node:net"
import { Agent, request } from "undici"
import type { ResolvedAddress } from "./webDiscoverySourcePolicy"

export interface SourceHttpResponse {
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>
  readonly body: AsyncIterable<Uint8Array>
  readonly close?: () => Promise<void>
}

export type SourceHttpTransport = (input: {
  readonly url: URL
  readonly address: ResolvedAddress
  readonly signal: AbortSignal
  readonly timeoutMs: number
  readonly maxBytes: number
}) => Promise<SourceHttpResponse>

export const defaultSourceTransport: SourceHttpTransport = async (input) => {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address: input.address.address, family: input.address.family }])
      return
    }
    callback(null, input.address.address, input.address.family)
  }
  const agent = new Agent({
    connect: { lookup },
    connectTimeout: input.timeoutMs,
    headersTimeout: input.timeoutMs,
    bodyTimeout: input.timeoutMs,
    maxResponseSize: input.maxBytes + 1,
  })
  try {
    const response = await request(input.url, {
      dispatcher: agent,
      method: "GET",
      maxRedirections: 0,
      signal: input.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain,application/pdf",
        "user-agent": "Scourgify/2 source-retrieval",
      },
    })
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
      close: async () => {
        response.body.destroy()
        await agent.close()
      },
    }
  } catch (error) {
    await agent.close()
    throw error
  }
}

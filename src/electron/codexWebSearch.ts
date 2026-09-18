import type { CodexAccountStatus } from "../shared/codexTypes"
import {
  type WebSearchCapability,
  webDiscoveryRequestSchema,
} from "../shared/researchSourceSchemas"
import type { CodexAppServerClient } from "./codexAppServerClient"
import { type CodexWebSearchProtocolCapability, capabilityFor } from "./codexWebSearchCapability"
import { type OfficialWebSearchPort, WebDiscoveryError } from "./webDiscovery"

export type CodexWebSearchClient = Pick<CodexAppServerClient, "readProviderCapabilities">

export type CodexWebSearchPortDependencies = {
  readonly getStatus: () => Promise<CodexAccountStatus>
  readonly client: CodexWebSearchClient
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Codex web search capability probe failed"
}

export function createCodexWebSearchPort(
  dependencies: CodexWebSearchPortDependencies,
): OfficialWebSearchPort {
  const readProtocolCapability = async (): Promise<CodexWebSearchProtocolCapability> => {
    try {
      const capabilities = await dependencies.client.readProviderCapabilities()
      return { webSearch: capabilities.webSearch, detail: null }
    } catch (error) {
      return { webSearch: false, detail: messageOf(error) }
    }
  }

  const readCapability = async (): Promise<WebSearchCapability> =>
    capabilityFor(await dependencies.getStatus(), await readProtocolCapability())

  return {
    readCapability,
    runSearch: async (input): Promise<never> => {
      webDiscoveryRequestSchema.parse({
        query: input.query,
        maxResults: input.maxResults,
      })
      const capability = await readCapability()
      if (capability.status === "unavailable") {
        throw new WebDiscoveryError(
          capability.reason === "quota_reached" ? "quota" : "capability_unavailable",
          capability.detail ?? `Official web search unavailable: ${capability.reason}`,
        )
      }
      if (input.signal?.aborted === true) {
        throw new WebDiscoveryError("aborted", "Search cancelled")
      }
      throw new WebDiscoveryError(
        "capability_unavailable",
        `Official web search unavailable: ${capability.status}`,
      )
    },
  }
}

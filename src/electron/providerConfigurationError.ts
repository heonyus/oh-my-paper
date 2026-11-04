/**
 * Why a provider request or its configuration failed. Kept apart from providerConfigStore, which
 * loads Electron, so the CLI and the web server can use it without Electron.
 */
export class ProviderConfigurationError extends Error {
  readonly name = "ProviderConfigurationError"
  constructor(
    readonly kind:
      | "missing_key"
      | "encryption_unavailable"
      | "corrupt_config"
      | "request_failed"
      | "cancelled"
      | "auth"
      | "rate_limited"
      | "timeout"
      | "privacy_denied"
      | "unsupported_capability"
      | "malformed_output",
  ) {
    super(kind)
  }
}

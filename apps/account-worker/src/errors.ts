export type ErrorCode =
  | "body_too_large"
  | "invalid_access"
  | "invalid_challenge"
  | "invalid_identity"
  | "invalid_renewal"
  | "invalid_request"
  | "method_not_allowed"
  | "not_found"
  | "rate_limited"
  | "renewal_reuse"
  | "service_misconfigured"

export class ApiError extends Error {
  readonly name = "ApiError"

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

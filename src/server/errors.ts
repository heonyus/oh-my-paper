export class WebServerError extends Error {
  readonly name = "WebServerError"

  constructor(
    readonly status: number,
    readonly code: string,
    cause?: unknown,
  ) {
    super(code, { cause })
  }
}

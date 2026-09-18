export class CodexAppServerError extends Error {
  readonly name = "CodexAppServerError"
  constructor(
    readonly message: string,
    readonly code?: number,
  ) {
    super(message)
  }
}

export class CodexCompletionError extends Error {
  readonly name = "CodexCompletionError"

  constructor(
    readonly kind:
      | "aborted"
      | "timeout"
      | "interrupted"
      | "failed"
      | "subprocess_exit"
      | "output_limit"
      | "unavailable",
    message: string,
  ) {
    super(message)
  }
}

export type PendingRequest = {
  readonly resolve: (result: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: NodeJS.Timeout
}

export function handleServerRequestAutoDeny(
  req: { readonly id: string | number; readonly method: string },
  writeLine: (line: string) => void,
): void {
  const id = req.id
  let response: unknown
  if (
    req.method === "item/commandExecution/requestApproval" ||
    req.method === "item/fileChange/requestApproval"
  ) {
    response = { id, result: { decision: "decline" } }
  } else if (req.method === "item/permissions/requestApproval") {
    response = {
      id,
      result: { permissions: { fileSystem: { entries: [] }, network: { enabled: false } } },
    }
  } else {
    response = {
      id,
      error: {
        code: -32601,
        message: "Declined: tool execution not permitted in restricted reader sandbox",
      },
    }
  }
  try {
    writeLine(JSON.stringify(response))
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }
  }
}

import { openExternalRequestSchema } from "../shared/ipc"

export function externalHttpsUrl(value: string): string | null {
  const parsed = openExternalRequestSchema.safeParse({ url: value })
  return parsed.success ? parsed.data.url : null
}

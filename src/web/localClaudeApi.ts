import { claudeAccountStatusSchema } from "../shared/claudeTypes"
import type { OhMyPaperApi } from "../shared/ipc"
import { localRpc } from "./localTransport"

export function createLocalClaudeApi(): NonNullable<OhMyPaperApi["claude"]> {
  return {
    getStatus: () => localRpc("claudeGetStatus", {}, claudeAccountStatusSchema),
    startLogin: () => localRpc("claudeStartLogin", {}, claudeAccountStatusSchema),
    cancelLogin: () => localRpc("claudeCancelLogin", {}, claudeAccountStatusSchema),
  }
}

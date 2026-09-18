import { type IpcRenderer, ipcRenderer } from "electron"
import type { ScholarlyGraphApi } from "../shared/scholarlyGraphIpc"
import {
  scholarlyGraphCancelInputSchema,
  scholarlyGraphCancelResultSchema,
  scholarlyGraphChannels,
  scholarlyGraphInputSchema,
} from "../shared/scholarlyGraphIpc"
import { scholarlyGraphResultSchema } from "../shared/scholarlyGraphSchemas"

type GraphRenderer = Pick<IpcRenderer, "invoke">

export function createPreloadScholarlyGraph(
  renderer: GraphRenderer = ipcRenderer,
): ScholarlyGraphApi {
  return {
    get: async (input) =>
      scholarlyGraphResultSchema.parse(
        await renderer.invoke(scholarlyGraphChannels.get, scholarlyGraphInputSchema.parse(input)),
      ),
    cancel: async (input) =>
      scholarlyGraphCancelResultSchema.parse(
        await renderer.invoke(
          scholarlyGraphChannels.cancel,
          scholarlyGraphCancelInputSchema.parse(input),
        ),
      ),
  }
}

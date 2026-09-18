import { type IpcRenderer, ipcRenderer } from "electron"
import {
  type DiscoveryApi,
  discoveryCancelInputSchema,
  discoveryCancelResultSchema,
  discoveryChannels,
  discoverySaveInputSchema,
  discoverySaveResultSchema,
  discoverySearchInputSchema,
} from "../shared/discoveryIpc"
import { scholarlySearchResultSchema } from "../shared/scholarlySearchSchemas"

type DiscoveryRenderer = Pick<IpcRenderer, "invoke">

export function createDiscoveryPreload(renderer: DiscoveryRenderer = ipcRenderer): DiscoveryApi {
  return {
    search: async (input) =>
      scholarlySearchResultSchema.parse(
        await renderer.invoke(discoveryChannels.search, discoverySearchInputSchema.parse(input)),
      ),
    cancel: async (input) =>
      discoveryCancelResultSchema.parse(
        await renderer.invoke(discoveryChannels.cancel, discoveryCancelInputSchema.parse(input)),
      ),
    saveMetadata: async (input) =>
      discoverySaveResultSchema.parse(
        await renderer.invoke(
          discoveryChannels.saveMetadata,
          discoverySaveInputSchema.parse(input),
        ),
      ),
  }
}

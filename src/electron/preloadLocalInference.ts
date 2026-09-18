import { ipcRenderer } from "electron"
import {
  type LocalInferenceApi,
  localInferenceCancelRequestSchema,
  localInferenceChannels,
  localInferenceEnableRequestSchema,
  localInferenceSetupManifestSchema,
  localInferenceStatusSchema,
  localInferenceSuggestRequestSchema,
  localInferenceSuggestResultSchema,
} from "../shared/localInference"

export function createPreloadLocalInference(): LocalInferenceApi {
  return {
    getStatus: async () =>
      localInferenceStatusSchema.parse(await ipcRenderer.invoke(localInferenceChannels.status)),
    chooseSetup: async () =>
      localInferenceSetupManifestSchema
        .nullable()
        .parse(await ipcRenderer.invoke(localInferenceChannels.chooseSetup)),
    enable: async (enabled) => {
      const request = localInferenceEnableRequestSchema.parse({ enabled })
      return localInferenceStatusSchema.parse(
        await ipcRenderer.invoke(localInferenceChannels.enable, request),
      )
    },
    suggest: async (request) =>
      localInferenceSuggestResultSchema.parse(
        await ipcRenderer.invoke(
          localInferenceChannels.suggest,
          localInferenceSuggestRequestSchema.parse(request),
        ),
      ),
    cancel: async (requestId) => {
      await ipcRenderer.invoke(
        localInferenceChannels.cancel,
        localInferenceCancelRequestSchema.parse({ requestId }),
      )
    },
  }
}

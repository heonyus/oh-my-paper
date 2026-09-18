import { ipcMain } from "electron"
import {
  localInferenceCancelRequestSchema,
  localInferenceChannels,
  localInferenceEnableRequestSchema,
  localInferenceSetupManifestSchema,
  localInferenceStatusSchema,
  localInferenceSuggestRequestSchema,
  localInferenceSuggestResultSchema,
} from "../shared/localInference"
import type { LocalInferenceService } from "./localInferenceService"

export function registerLocalInferenceIpc(service: LocalInferenceService): () => void {
  ipcMain.handle(localInferenceChannels.status, async () =>
    localInferenceStatusSchema.parse(await service.getStatus()),
  )
  ipcMain.handle(localInferenceChannels.chooseSetup, async () =>
    localInferenceSetupManifestSchema.nullable().parse(await service.chooseSetup()),
  )
  ipcMain.handle(localInferenceChannels.enable, async (_event, rawRequest: unknown) => {
    const request = localInferenceEnableRequestSchema.parse(rawRequest)
    return localInferenceStatusSchema.parse(await service.setEnabled(request.enabled))
  })
  ipcMain.handle(localInferenceChannels.suggest, async (_event, rawRequest: unknown) => {
    const request = localInferenceSuggestRequestSchema.parse(rawRequest)
    return localInferenceSuggestResultSchema.parse(await service.suggest(request))
  })
  ipcMain.handle(localInferenceChannels.cancel, async (_event, rawRequest: unknown) => {
    const request = localInferenceCancelRequestSchema.parse(rawRequest)
    service.cancel(request.requestId)
  })

  return () => {
    for (const channel of Object.values(localInferenceChannels)) ipcMain.removeHandler(channel)
  }
}

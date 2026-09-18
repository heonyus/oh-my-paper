import { ipcMain } from "electron"
import { documentAstRequestSchema, documentAstResultSchema, ipcChannels } from "../shared/ipc"
import type { DocumentAstService } from "./documentAstService"

export function registerDocumentAstIpc(service: DocumentAstService): void {
  ipcMain.handle(ipcChannels.documentAst, async (_event, value: unknown) => {
    const request = documentAstRequestSchema.parse(value)
    return documentAstResultSchema.parse(await service.request(request))
  })
}

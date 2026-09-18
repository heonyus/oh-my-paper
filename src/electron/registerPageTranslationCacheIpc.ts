import { ipcMain } from "electron"
import { ipcChannels } from "../shared/ipcChannels"
import {
  pageTranslationCacheClearRequestSchema,
  pageTranslationCacheReadRequestSchema,
  pageTranslationCacheResultSchema,
  pageTranslationCacheWriteRequestSchema,
} from "../shared/pageTranslationCache"
import type { PageTranslationCacheService } from "./pageTranslationCacheService"

export function registerPageTranslationCacheIpc(service: PageTranslationCacheService): () => void {
  ipcMain.handle(ipcChannels.pageTranslationCacheRead, async (_event, value: unknown) =>
    pageTranslationCacheResultSchema.parse(
      await service.read(pageTranslationCacheReadRequestSchema.parse(value)),
    ),
  )
  ipcMain.handle(ipcChannels.pageTranslationCacheWrite, async (_event, value: unknown) => {
    await service.write(pageTranslationCacheWriteRequestSchema.parse(value))
  })
  ipcMain.handle(ipcChannels.pageTranslationCacheClear, async (_event, value: unknown) => {
    await service.clear(pageTranslationCacheClearRequestSchema.parse(value))
  })
  return () => {
    ipcMain.removeHandler(ipcChannels.pageTranslationCacheRead)
    ipcMain.removeHandler(ipcChannels.pageTranslationCacheWrite)
    ipcMain.removeHandler(ipcChannels.pageTranslationCacheClear)
  }
}

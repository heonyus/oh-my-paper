import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { dialog } from "electron"
import {
  type LocalInferenceSetupManifest,
  localInferenceSetupManifestSchema,
} from "../shared/localInference"
import { LlamaCppEngine } from "./localInferenceEngine"
import { LocalInferenceService } from "./localInferenceService"
import { createLocalInferenceSetupManifest, verifyLocalInferenceSetup } from "./localInferenceSetup"

export type ApplicationLocalInference = {
  readonly service: LocalInferenceService
  readonly dispose: () => void
}

function initialManifest(path: string): LocalInferenceSetupManifest | null {
  try {
    const parsed = localInferenceSetupManifestSchema.safeParse(
      JSON.parse(readFileSync(path, "utf8")),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function chooseFile(title: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({ title, properties: ["openFile"] })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function chooseSetup(): Promise<LocalInferenceSetupManifest | null> {
  const runtimePath = await chooseFile("llama.cpp 실행 파일 선택")
  if (runtimePath === null) return null
  const runtimeArchivePath = await chooseFile("검증한 llama.cpp arm64 아카이브 선택")
  if (runtimeArchivePath === null) return null
  const modelPath = await chooseFile("검증한 Qwen GGUF 모델 선택")
  if (modelPath === null) return null
  return createLocalInferenceSetupManifest({ runtimePath, runtimeArchivePath, modelPath })
}

async function saveSetup(path: string, manifest: LocalInferenceSetupManifest): Promise<void> {
  const value = localInferenceSetupManifestSchema.parse(manifest)
  await mkdir(join(path, ".."), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" })
  await rename(temporary, path)
}

export function createApplicationLocalInference(root: string): ApplicationLocalInference {
  const setupPath = join(root, "local-inference.json")
  const service = new LocalInferenceService({
    checkSetup: (manifest) => verifyLocalInferenceSetup(manifest),
    chooseSetup,
    saveSetup: (manifest) => saveSetup(setupPath, manifest),
    engine: new LlamaCppEngine(),
    initialManifest: initialManifest(setupPath),
  })
  let disposed = false
  return {
    service,
    dispose: () => {
      if (disposed) return
      disposed = true
      service.dispose()
    },
  }
}

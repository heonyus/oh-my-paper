import { type ImportProgress, type ImportResult, importResultSchema } from "../shared/ipc"
import { LocalApiError, readLocalResponse } from "./localTransport"

export function createLocalImporter() {
  const files = new Map<string, File>()
  const listeners = new Set<(progress: ImportProgress) => void>()

  async function upload(file: File): Promise<ImportResult> {
    if (file.size > 100 * 1024 * 1024)
      throw new LocalApiError(413, "PDF는 100MB까지 가져올 수 있습니다.")
    const id = crypto.randomUUID()
    const publish = (progress: Omit<ImportProgress, "id" | "fileName">): void => {
      for (const listener of listeners) listener({ ...progress, id, fileName: file.name })
    }
    publish({ stage: "checking", state: "active", progress: 0.1, message: "PDF를 확인하는 중…" })
    try {
      const response = await fetch(`/api/documents?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "content-type": "application/pdf" },
        body: file,
        signal: AbortSignal.timeout(180_000),
      })
      const result = await readLocalResponse(response, importResultSchema)
      publish({ stage: "complete", state: "complete", progress: 1, message: "가져오기 완료" })
      return result
    } catch (error) {
      if (!(error instanceof Error)) throw error
      publish({ stage: "checking", state: "failed", progress: 0, message: error.message })
      throw error
    }
  }

  function pick(): Promise<ImportResult> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "application/pdf,.pdf"
      input.setAttribute("aria-label", "가져올 PDF 선택")
      input.hidden = true
      document.body.append(input)
      input.addEventListener(
        "cancel",
        () => {
          input.remove()
          resolve(null)
        },
        { once: true },
      )
      input.addEventListener(
        "change",
        () => {
          const file = input.files?.item(0)
          input.remove()
          if (file) void upload(file).then(resolve, reject)
          else resolve(null)
        },
        { once: true },
      )
      input.click()
    })
  }

  async function importToken(token: string): Promise<ImportResult> {
    const file = files.get(token)
    if (!file) throw new LocalApiError(400, "가져올 파일을 다시 선택하세요.")
    files.delete(token)
    return upload(file)
  }

  return {
    importDocument: pick,
    importDocumentPath: importToken,
    importDocumentPaths: async (tokens: readonly string[]) => {
      const results = new Array<ImportResult>(tokens.length)
      let nextIndex = 0
      let failed = false
      const worker = async (): Promise<void> => {
        while (!failed && nextIndex < tokens.length) {
          const index = nextIndex
          nextIndex += 1
          const token = tokens[index]
          if (!token) return
          try {
            results[index] = await importToken(token)
          } catch (error) {
            failed = true
            throw error
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, tokens.length) }, worker))
      return results
    },
    getDroppedFilePath: (file: File): string => {
      const token = crypto.randomUUID()
      files.set(token, file)
      return token
    },
    onImportProgress: (listener: (progress: ImportProgress) => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

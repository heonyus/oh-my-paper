import { maximumWebPdfBytes } from "../worker/upload"

export type LocalPdf = {
  readonly id: string
  readonly file: File
  readonly pageCount: number
  readonly status: "ready" | "uploading" | "failed"
  readonly error?: string
}

function pdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  )
}

export async function inspectLocalPdf(file: File): Promise<LocalPdf> {
  if (file.size <= 0 || file.size > maximumWebPdfBytes || !file.name.toLowerCase().endsWith(".pdf"))
    throw new Error("16MB 이하 PDF만 업로드할 수 있습니다.")
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!pdfMagic(bytes)) throw new Error("올바른 PDF 파일이 아닙니다.")
  await import("./pdfRuntime")
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const task = getDocument({ data: bytes })
  try {
    const pdf = await task.promise
    return { id: crypto.randomUUID(), file, pageCount: pdf.numPages, status: "ready" }
  } finally {
    await task.destroy()
  }
}

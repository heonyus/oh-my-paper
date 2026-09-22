import { z } from "zod"

export const MAX_REMOTE_PDF_BYTES = 100 * 1024 * 1024

export type RemotePdfErrorKind =
  | "invalid_url"
  | "unreachable"
  | "not_pdf"
  | "too_large"
  | "no_pdf_link"

export class RemotePdfError extends Error {
  readonly kind: RemotePdfErrorKind
  constructor(kind: RemotePdfErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

const semanticScholarPaperSchema = z.object({
  openAccessPdf: z
    .object({ url: z.string().min(1) })
    .nullable()
    .optional(),
  externalIds: z
    .object({ ArXiv: z.string().min(1).optional() })
    .nullable()
    .optional(),
})

function paperUrlOrSelf(url: URL): string {
  return url.toString()
}

async function resolveSemanticScholar(url: URL): Promise<string> {
  const paper = url.pathname.match(/\/paper\/(?:[^/]*\/)?([0-9a-f]{40})/i)
  if (!paper?.[1]) return paperUrlOrSelf(url)
  const api = `https://api.semanticscholar.org/graph/v1/paper/${paper[1]}?fields=openAccessPdf,externalIds`
  const request = () =>
    fetch(api, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } })
  let response = await request()
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    response = await request()
  }
  if (!response.ok) throw new RemotePdfError("unreachable", `semantic_scholar_${response.status}`)
  const body = semanticScholarPaperSchema.parse(await response.json())
  if (body.openAccessPdf?.url) {
    try {
      return new URL(body.openAccessPdf.url, "https://api.semanticscholar.org").toString()
    } catch {}
  }
  if (body.externalIds?.ArXiv) return `https://arxiv.org/pdf/${body.externalIds.ArXiv}`
  throw new RemotePdfError("no_pdf_link", "이 논문의 공개 PDF를 찾지 못했습니다")
}

// Maps a paper landing-page URL on a supported site to its PDF URL.
// Unknown URLs are returned unchanged and validated as PDFs on download.
export async function resolveRemotePdfUrl(raw: string): Promise<string> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new RemotePdfError("invalid_url", "올바른 URL이 아닙니다")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new RemotePdfError("invalid_url", "http(s) 링크만 가져올 수 있습니다")
  const host = url.hostname.replace(/^www\./, "")

  if (host === "arxiv.org") {
    const landing = url.pathname.match(/^\/(?:abs|html)\/([^/]+?)\/?$/)
    if (landing) return `https://arxiv.org/pdf/${landing[1]}`
    return paperUrlOrSelf(url)
  }
  if (host === "openreview.net") {
    const id = url.searchParams.get("id")
    if (url.pathname === "/forum" && id) return `https://openreview.net/pdf?id=${id}`
    return paperUrlOrSelf(url)
  }
  if (host === "aclanthology.org") {
    const paper = url.pathname.match(/^\/((?:\d{4}\.|[A-Z]\d{2}-)[^/]+)\/?$/)?.[1]
    if (paper && !paper.endsWith(".pdf")) return `https://aclanthology.org/${paper}.pdf`
    return paperUrlOrSelf(url)
  }
  if (host === "semanticscholar.org") return resolveSemanticScholar(url)
  return paperUrlOrSelf(url)
}

function remoteFileName(url: URL, contentDisposition: string | null): string {
  const header = contentDisposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1]
  const fromHeader = header ? decodeURIComponent(header.trim()) : null
  const fromPath = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "")
  const candidate = (fromHeader ?? fromPath).replace(/[^a-zA-Z0-9._-]/g, "_")
  if (!candidate) return "paper.pdf"
  return candidate.toLowerCase().endsWith(".pdf") ? candidate : `${candidate}.pdf`
}

const MAX_REDIRECTS = 5

// Blocks direct requests to loopback/private/link-local targets. Hostnames that
// merely resolve to private addresses are not covered (no DNS lookup here).
function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (host.startsWith("::ffff:")) {
    const tail = host.slice(7)
    const hextets = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
    if (hextets) {
      const [, hiHex = "", loHex = ""] = hextets
      const hi = Number.parseInt(hiHex, 16)
      const lo = Number.parseInt(loHex, 16)
      return isPrivateHostname(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    return isPrivateHostname(tail)
  }
  if (host.includes(":")) return host === "::1" || host === "::" || /^f[cd]|^fe80/i.test(host)
  if (host === "localhost" || host.endsWith(".localhost")) return true
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
  if (!ipv4) return false
  const a = Number(ipv4[1])
  const b = Number(ipv4[2])
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function assertFetchable(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new RemotePdfError("invalid_url", "http(s) 링크만 가져올 수 있습니다")
  if (isPrivateHostname(url.hostname))
    throw new RemotePdfError("invalid_url", "내부 주소는 가져올 수 없습니다")
}

// Follows redirects manually so each hop is re-validated against the private
// host blocklist — a public URL must not bounce the server into the LAN.
async function fetchRemotePdf(resolved: string): Promise<Response> {
  let current = new URL(resolved)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertFetchable(current)
    const response = await fetch(current, {
      signal: AbortSignal.timeout(60_000),
      redirect: "manual",
      headers: {
        accept: "application/pdf,*/*;q=0.8",
        "user-agent": "oh-my-paper/2.0 local import",
      },
    }).catch(() => {
      throw new RemotePdfError("unreachable", "PDF를 내려받지 못했습니다")
    })
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get("location")
    if (!location)
      throw new RemotePdfError("unreachable", `PDF 요청이 실패했습니다 (${response.status})`)
    try {
      current = new URL(location, current)
    } catch {
      throw new RemotePdfError("invalid_url", "리다이렉트 주소가 올바르지 않습니다")
    }
  }
  throw new RemotePdfError("unreachable", "리다이렉트가 너무 많습니다")
}

export async function downloadRemotePdf(
  raw: string,
): Promise<{ readonly bytes: Uint8Array; readonly fileName: string }> {
  const resolved = await resolveRemotePdfUrl(raw)
  const url = new URL(resolved)
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new RemotePdfError("invalid_url", "http(s) 링크만 가져올 수 있습니다")
  const response = await fetchRemotePdf(resolved)
  if (!response.ok)
    throw new RemotePdfError("unreachable", `PDF 요청이 실패했습니다 (${response.status})`)
  const declared = Number(response.headers.get("content-length") ?? 0)
  if (declared > MAX_REMOTE_PDF_BYTES)
    throw new RemotePdfError("too_large", "PDF는 100MB까지 가져올 수 있습니다")
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_REMOTE_PDF_BYTES)
    throw new RemotePdfError("too_large", "PDF는 100MB까지 가져올 수 있습니다")
  const pdfMagic =
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  if (!pdfMagic) throw new RemotePdfError("not_pdf", "링크가 PDF 파일이 아닙니다")
  return { bytes, fileName: remoteFileName(url, response.headers.get("content-disposition")) }
}

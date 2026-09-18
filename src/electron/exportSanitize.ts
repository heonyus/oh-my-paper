import type { PhrasingContent } from "mdast"
import type { ExportLimitation } from "../shared/exportSchemas"

const PRIVATE_PATH = /\/(?:Users|home|private|var|tmp)\/[^\s<>'"`)]+/g
const SECRET_ASSIGNMENT = /\b(api[_ -]?key|secret|password|access[_ -]?token)\s*[:=]\s*([^\s]+)/gi
const SECRET_TOKEN = /\b(?:sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16})\b/g

export function addExportLimitation(
  limitations: ExportLimitation[],
  limitation: ExportLimitation,
): void {
  if (
    !limitations.some((item) => item.code === limitation.code && item.detail === limitation.detail)
  ) {
    limitations.push(limitation)
  }
}

export function sanitizeExportText(value: string, limitations: ExportLimitation[]): string {
  let clean = value.replace(PRIVATE_PATH, () => {
    addExportLimitation(limitations, {
      code: "private_path_redacted",
      detail: "Private absolute paths were removed from the shared export.",
    })
    return "[private path omitted]"
  })
  clean = clean.replace(SECRET_ASSIGNMENT, (_match, label: string) => {
    addExportLimitation(limitations, {
      code: "suspected_secret_redacted",
      detail:
        "Credential-like values were removed; automatic detection cannot guarantee completeness.",
    })
    return `${label}: [redacted]`
  })
  return clean.replace(SECRET_TOKEN, () => {
    addExportLimitation(limitations, {
      code: "suspected_secret_redacted",
      detail:
        "Credential-like values were removed; automatic detection cannot guarantee completeness.",
    })
    return "[redacted]"
  })
}

export function safeExportHref(value: string): string | null {
  if (value.startsWith("#")) return value
  if (!/^[A-Za-z][A-Za-z\d+.-]*:/.test(value)) {
    return value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")
      ? null
      : value
  }
  try {
    const protocol = new URL(value).protocol
    return protocol === "https:" || protocol === "http:" || protocol === "mailto:" ? value : null
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
}

export function plainExportText(node: PhrasingContent): string {
  if ("value" in node) return node.value
  if ("children" in node) return node.children.map(plainExportText).join("")
  return "alt" in node ? (node.alt ?? "") : ""
}

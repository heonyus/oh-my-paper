import { type Locale, translator } from "../../shared/i18n/locale"
import type { EvidenceNavigationTarget } from "../../shared/knowledgeTypes"
import type { DocumentRecord } from "../../shared/schemas"
import { readerMessages } from "../messages/reader"

export function evidenceDocument(
  target: EvidenceNavigationTarget,
  documents: readonly DocumentRecord[],
  locale: Locale = "ko",
): DocumentRecord {
  const t = translator(readerMessages, locale)
  const document =
    documents.find((item) => item.id === target.originalDocumentId && item.hash === target.hash) ??
    documents.find((item) => item.hash === target.hash)
  if (!document) throw new Error(t("evidence.missingVersion"))
  if (target.page > document.pageCount) throw new Error(t("evidence.missingPage"))
  return document
}

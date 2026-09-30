import { FileText } from "lucide-react"
import { type JSX, memo, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Sha256 } from "../../shared/schemas"
import { useTranslator } from "../lib/locale"
import type { Thumbnail } from "../lib/thumbnailCache"
import { documentThumbnails } from "../lib/thumbnailLoader"
import { libraryMessages } from "../messages/library"
import type { DocumentRecord } from "../types"

/** Whether the element is within 120px of the viewport; always true without IntersectionObserver. */
function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined")
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries.at(-1)
        if (latest) setNear(latest.isIntersecting)
      },
      { rootMargin: "120px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return near
}

/** An object URL for the image while it is shown, revoked when it changes or unmounts. */
function useObjectUrl(image: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!image) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(image)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [image])
  return url
}

type LoadedThumbnail = { readonly hash: Sha256; readonly thumbnail: Thumbnail }

export const DocumentThumbnail = memo(function DocumentThumbnail({
  document,
}: {
  readonly document: DocumentRecord
}): JSX.Element {
  const { id, hash, title } = document
  const t = useTranslator(libraryMessages)
  const host = useRef<HTMLDivElement>(null)
  const near = useNearViewport(host)
  const [loaded, setLoaded] = useState<LoadedThumbnail | null>(null)
  const thumbnail = loaded?.hash === hash ? loaded.thumbnail : documentThumbnails.peek(hash)
  const url = useObjectUrl(thumbnail?.image ?? null)
  const [shownUrl, setShownUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!near || thumbnail) return
    const controller = new AbortController()
    documentThumbnails.request({ id, hash }, controller.signal).then(
      (result) => {
        if (result && !controller.signal.aborted) setLoaded({ hash, thumbnail: result })
      },
      // Cancelled after scrolling away or unmounting; the file icon stays until it returns.
      () => undefined,
    )
    return () => controller.abort()
  }, [near, thumbnail, id, hash])

  return (
    <div ref={host} className="document-thumbnail" data-rendered={url !== null && shownUrl === url}>
      <FileText size={28} aria-hidden="true" />
      {url && thumbnail ? (
        <img
          srcSet={`${url} ${thumbnail.density}x`}
          alt={t("doc.thumbnail", { title })}
          decoding="async"
          onLoad={() => setShownUrl(url)}
        />
      ) : null}
    </div>
  )
})

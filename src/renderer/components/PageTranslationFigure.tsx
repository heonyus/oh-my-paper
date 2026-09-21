import { type JSX, useEffect, useState } from "react"
import type { PageSourceBlock } from "../lib/pageTranslationSource"
import { focusPageSource } from "../lib/pageTranslationSource"
import { cropFeatureImage } from "../lib/pdfFeatureDom"

export function PageTranslationFigure({
  block,
  page,
}: {
  readonly block: PageSourceBlock
  readonly page: number
}): JSX.Element {
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    const source = document.querySelector<HTMLElement>(`.page[data-page-number="${page}"]`)
    const bounds = block.sourceBounds
    const width = block.sourcePageWidth
    const height = block.sourcePageHeight
    if (!source || !bounds || !width || !height) return
    function update(): void {
      if (!source || !bounds || !width || !height) return
      const rect = source.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const crop = cropFeatureImage(source, {
        rect: {
          x: (bounds.x / width) * rect.width,
          y: (bounds.y / height) * rect.height,
          width: (bounds.width / width) * rect.width,
          height: (bounds.height / height) * rect.height,
        },
      })
      if (crop) setImage(crop)
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(source, { childList: true, subtree: true })
    const resize = new ResizeObserver(update)
    resize.observe(source)
    return () => {
      observer.disconnect()
      resize.disconnect()
    }
  }, [block, page])

  return (
    <button
      type="button"
      className="page-translation-figure"
      onClick={() => focusPageSource(page, block.id)}
      aria-label="원본 그림으로 이동"
    >
      {image ? <img src={image} alt={block.source} /> : <span>원본 그림으로 이동</span>}
    </button>
  )
}

import type { Editor } from "@tiptap/core"
import Image, { type ImageOptions } from "@tiptap/extension-image"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { MAX_ASSET_BYTES } from "../../../shared/collectionIpc"
import { safeNoteImageSource } from "../notes/noteRichContent"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteImage: {
      /** Asks for an image file and puts it in the note at the cursor. */
      pickNoteImage: () => ReturnType
    }
  }
}

type NoteImageOptions = ImageOptions & {
  readonly onError: (error: unknown) => void
}

const SERVED_ASSET = /^scourgify-asset:\/\/local\/(assets\/[a-f0-9]{64}\.(?:png|jpg|webp))$/u
const STORED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

/** Images go in the collection's `assets/`; the note file sits one folder down, in `reader-notes/`. */
function noteSource(relativePath: string): string {
  return `../${relativePath}`
}

/** The note keeps the Markdown path, so the file still shows its images outside the app. */
function storedSource(src: string | null): string | null {
  const asset = src ? SERVED_ASSET.exec(src) : null
  return asset?.[1] ? noteSource(asset[1]) : src
}

function shownSource(src: unknown): string | null {
  if (typeof src !== "string") return null
  return safeNoteImageSource(src) ?? (src.startsWith("data:image/") ? src : null)
}

/** Images can be added only where the collection can store them (the desktop app). */
export function noteImagesAvailable(): boolean {
  return typeof window !== "undefined" && window.ohmypaper?.collection !== undefined
}

function imageFiles(data: DataTransfer | null): readonly File[] {
  return [...(data?.files ?? [])].filter((file) => file.type.startsWith("image/"))
}

/** GIF, HEIC and the like are redrawn as PNG; the collection keeps PNG, JPEG and WebP. */
async function storableBytes(
  file: File,
): Promise<{ readonly bytes: Uint8Array<ArrayBuffer>; readonly name: string }> {
  if (STORED_TYPES.has(file.type))
    return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name }
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("이미지를 읽을 수 없습니다.")
  return { bytes: new Uint8Array(await blob.arrayBuffer()), name: `${file.name}.png` }
}

async function storeImage(file: File): Promise<string> {
  const api = window.ohmypaper.collection
  if (!api) throw new Error("이 실행 환경에서는 이미지를 넣을 수 없습니다.")
  if (file.size > MAX_ASSET_BYTES) throw new Error("이미지는 25MB 이하로 선택해 주세요.")
  const { bytes, name } = await storableBytes(file)
  const saved = await api.importAsset({ kind: "bytes", name, bytes })
  if (!saved) throw new Error("이미지를 저장하지 못했습니다.")
  return noteSource(saved.relativePath)
}

function insertImage(editor: Editor, src: string, pos: number | null): void {
  if (editor.isDestroyed) return
  const image = { type: "image", attrs: { src, alt: "" } }
  const chain = editor.chain().focus()
  ;(pos === null ? chain.insertContent(image) : chain.insertContentAt(pos, image)).run()
}

async function insertFiles(
  editor: Editor,
  files: readonly File[],
  pos: number | null,
  onError: (error: unknown) => void,
): Promise<void> {
  let at = pos
  for (const file of files) {
    try {
      insertImage(editor, await storeImage(file), at)
      // The next image follows this one, where the cursor now is.
      at = null
    } catch (error) {
      onError(error)
    }
  }
}

/**
 * Images in the reader's note: pasted, dropped or picked with `/`. Each is saved once in the
 * collection's `assets/` and written into the Markdown as a relative path.
 */
export const NoteImage = Image.extend<NoteImageOptions>({
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), onError: () => undefined }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) => storedSource(element.getAttribute("src")),
        renderHTML: (attributes) => ({ src: shownSource(Reflect.get(attributes, "src")) }),
      },
    }
  },

  addCommands() {
    return {
      pickNoteImage:
        () =>
        ({ editor }) => {
          const api = window.ohmypaper.collection
          if (!api) return false
          const { onError } = this.options
          void api
            .importAsset({ kind: "pick" })
            .then((saved) => {
              if (saved) insertImage(editor, noteSource(saved.relativePath), null)
            })
            .catch(onError)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const { editor } = this
    const { onError } = this.options
    if (!noteImagesAvailable()) return []
    return [
      new Plugin({
        key: new PluginKey("noteImageFiles"),
        props: {
          handlePaste: (_view, event) => {
            const files = imageFiles(event.clipboardData)
            if (files.length === 0) return false
            event.preventDefault()
            void insertFiles(editor, files, null, onError)
            return true
          },
          handleDrop: (view, event, _slice, moved) => {
            const files = moved ? [] : imageFiles(event.dataTransfer)
            if (files.length === 0) return false
            event.preventDefault()
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null
            void insertFiles(editor, files, pos, onError)
            return true
          },
        },
      }),
    ]
  },
})

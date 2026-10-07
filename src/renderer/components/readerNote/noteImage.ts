import type { Editor } from "@tiptap/core"
import Image, { type ImageOptions } from "@tiptap/extension-image"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { MAX_ASSET_BYTES } from "../../../shared/collectionIpc"

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

const ASSET_NAME = "[a-f0-9]{64}\\.(?:png|jpg|webp)"
const NOTE_ASSET = new RegExp(`^(?:\\.\\./)+assets/(${ASSET_NAME})$`, "u")
const SERVED_ASSET = new RegExp(
  `^(?:scourgify-asset://local/assets/|(?:https?://[^/]+)?/api/note-assets/)(${ASSET_NAME})$`,
  "u",
)
const STORED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

/**
 * Where note images are kept: the desktop app's collection, or the local server's data folder.
 * Both keep them in `assets/` beside `reader-notes/` and answer with `assets/<hash>.<ext>`.
 */
type NoteImageStore = {
  readonly save: (bytes: Uint8Array<ArrayBuffer>, name: string) => Promise<string>
  /** A path the reader picked and the store kept, or null when nothing was picked. */
  readonly pick: () => Promise<string | null>
  readonly url: (file: string) => string
}

function chooseFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null))
    input.addEventListener("cancel", () => resolve(null))
    input.click()
  })
}

function noteImageStore(): NoteImageStore | null {
  if (typeof window === "undefined") return null
  const collection = window.ohmypaper?.collection
  if (collection) {
    return {
      save: async (bytes, name) => {
        const saved = await collection.importAsset({ kind: "bytes", name, bytes })
        if (!saved) throw new Error("이미지를 저장하지 못했습니다.")
        return saved.relativePath
      },
      pick: async () => (await collection.importAsset({ kind: "pick" }))?.relativePath ?? null,
      url: (file) => `scourgify-asset://local/assets/${file}`,
    }
  }
  const saveNoteImage = window.ohmypaper?.saveNoteImage
  if (saveNoteImage) {
    return {
      save: (bytes) => saveNoteImage(bytes),
      pick: async () => {
        const file = await chooseFile()
        return file ? await saveFile(saveNoteImage, file) : null
      },
      url: (file) => `/api/note-assets/${file}`,
    }
  }
  return null
}

/** Images go in `assets/`; the note file sits one folder down, in `reader-notes/`. */
function noteSource(relativePath: string): string {
  return `../${relativePath}`
}

/** The note keeps the Markdown path, so the file still shows its images outside the app. */
function storedSource(src: string | null): string | null {
  const asset = src ? SERVED_ASSET.exec(src) : null
  return asset?.[1] ? noteSource(`assets/${asset[1]}`) : src
}

function shownSource(src: unknown): string | null {
  if (typeof src !== "string") return null
  const asset = NOTE_ASSET.exec(src)?.[1]
  if (asset) return noteImageStore()?.url(asset) ?? null
  return src.startsWith("data:image/") ? src : null
}

/** Images can be added where the app can keep them: the desktop app and the local server. */
export function noteImagesAvailable(): boolean {
  return noteImageStore() !== null
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

async function saveFile(save: NoteImageStore["save"], file: File): Promise<string> {
  if (file.size > MAX_ASSET_BYTES) throw new Error("이미지는 25MB 이하로 선택해 주세요.")
  const { bytes, name } = await storableBytes(file)
  return await save(bytes, name)
}

async function storeImage(file: File): Promise<string> {
  const store = noteImageStore()
  if (!store) throw new Error("이 실행 환경에서는 이미지를 넣을 수 없습니다.")
  return noteSource(await saveFile(store.save, file))
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
 * Images in the reader's note: pasted, dropped or picked with `/`. Each is saved once in
 * `assets/` and written into the Markdown as a relative path.
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
          const store = noteImageStore()
          if (!store) return false
          const { onError } = this.options
          void store
            .pick()
            .then((relativePath) => {
              if (relativePath) insertImage(editor, noteSource(relativePath), null)
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

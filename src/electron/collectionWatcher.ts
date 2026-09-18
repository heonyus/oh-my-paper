import { type FSWatcher, watch } from "node:fs"
import { join } from "node:path"
import type { CollectionService } from "./collectionService"
import type { CollectionServiceStatus } from "./collectionServiceTypes"

export type CollectionWatchEvent =
  | { readonly kind: "changed"; readonly status: CollectionServiceStatus }
  | { readonly kind: "error"; readonly message: string }

export class CollectionWatcher {
  private timer: NodeJS.Timeout | null = null
  private running: Promise<void> = Promise.resolve()

  private constructor(
    private readonly service: CollectionService,
    private readonly watcher: FSWatcher | null,
    private readonly onEvent: (event: CollectionWatchEvent) => void,
    private readonly settleMs: number,
  ) {}

  static start(
    service: CollectionService,
    onEvent: (event: CollectionWatchEvent) => void,
    settleMs = 150,
  ): CollectionWatcher {
    let collectionWatcher: CollectionWatcher | null = null
    let watcher: FSWatcher | null = null
    try {
      watcher = watch(join(service.files.root, "notes"), () => collectionWatcher?.schedule())
    } catch (error) {
      queueMicrotask(() =>
        onEvent({
          kind: "error",
          message: error instanceof Error ? error.message : "Collection watch failed",
        }),
      )
    }
    collectionWatcher = new CollectionWatcher(service, watcher, onEvent, settleMs)
    watcher?.on("error", (error) => onEvent({ kind: "error", message: error.message }))
    return collectionWatcher
  }

  async focus(): Promise<void> {
    await this.rescan()
  }

  async manualRescan(): Promise<void> {
    await this.rescan()
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.watcher?.close()
    await this.running
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.rescan()
    }, this.settleMs)
  }

  private async rescan(): Promise<void> {
    const operation = this.running
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.service.rescan()
          this.onEvent({ kind: "changed", status: await this.service.status() })
        } catch (error) {
          this.onEvent({
            kind: "error",
            message: error instanceof Error ? error.message : "Collection rescan failed",
          })
        }
      })
    this.running = operation
    await operation
  }
}

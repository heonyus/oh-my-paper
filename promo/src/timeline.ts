/** Written by record.ts: one real recording plus what happened when, in viewport pixels. */
export type RecordedEvent = {
  readonly t: number
  readonly type: "move" | "down" | "up" | "key" | "type"
  readonly x?: number
  readonly y?: number
  readonly key?: string
}

export type RecordedScene = {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly caption: string
  readonly keys?: readonly string[]
  /** False across a jump cut, so the camera holds its zoom instead of pulling out and back. */
  readonly zoomIn?: boolean
  readonly zoomOut?: boolean
  /** Where the camera should look, in viewport pixels. */
  readonly focus?: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  }
}

export type Recording = {
  readonly video: string
  readonly duration: number
  readonly viewport: { readonly w: number; readonly h: number }
  readonly url: string
  readonly events: readonly RecordedEvent[]
  readonly scenes: readonly RecordedScene[]
}

/** Scenes from every recording listed in public/timelines.json, in order. */
export type Cut = { readonly recording: Recording; readonly scene: RecordedScene }

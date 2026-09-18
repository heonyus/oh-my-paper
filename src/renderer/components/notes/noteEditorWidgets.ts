import { type EditorView, WidgetType } from "@codemirror/view"
import katex from "katex"
import type { NoteTable } from "./noteRichContent"

function revealSource(view: EditorView, from: number): void {
  view.dispatch({ selection: { anchor: from }, scrollIntoView: true })
  view.focus()
}

abstract class SourceWidget extends WidgetType {
  readonly className: string
  readonly label: string
  readonly from: number

  constructor(className: string, label: string, from: number) {
    super()
    this.className = className
    this.label = label
    this.from = from
  }

  protected button(view: EditorView): HTMLButtonElement {
    const button = document.createElement("button")
    button.type = "button"
    button.className = this.className
    button.setAttribute("aria-label", this.label)
    button.addEventListener("mousedown", (event) => {
      event.preventDefault()
      revealSource(view, this.from)
    })
    return button
  }

  ignoreEvent(): boolean {
    return true
  }
}

export class MathWidget extends SourceWidget {
  readonly expression: string
  readonly displayMode: boolean

  constructor(expression: string, displayMode: boolean, from: number) {
    super("note-rich-math", "수식 소스 편집", from)
    this.expression = expression
    this.displayMode = displayMode
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MathWidget &&
      other.expression === this.expression &&
      other.displayMode === this.displayMode &&
      other.from === this.from
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const button = this.button(view)
    if (this.displayMode) button.classList.add("note-rich-math-display")
    katex.render(this.expression, button, {
      displayMode: this.displayMode,
      throwOnError: false,
      strict: "error",
    })
    return button
  }
}

export class ImageWidget extends SourceWidget {
  readonly source: string
  readonly alt: string

  constructor(source: string, alt: string, from: number) {
    super("note-rich-image", "이미지 소스 편집", from)
    this.source = source
    this.alt = alt
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageWidget &&
      other.source === this.source &&
      other.alt === this.alt &&
      other.from === this.from
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const button = this.button(view)
    const image = document.createElement("img")
    image.src = this.source
    image.alt = this.alt
    image.loading = "lazy"
    image.decoding = "async"
    button.append(image)
    return button
  }
}

export class MarkerWidget extends WidgetType {
  readonly value: string

  constructor(value: string) {
    super()
    this.value = value
  }

  eq(other: WidgetType): boolean {
    return other instanceof MarkerWidget && other.value === this.value
  }

  toDOM(): HTMLElement {
    const marker = document.createElement("span")
    marker.className = "note-rich-list-marker"
    marker.textContent = this.value
    marker.setAttribute("aria-hidden", "true")
    return marker
  }
}

function appendCell(cell: HTMLElement, source: string): void {
  const parts = source.split(/<br\s*\/?>/giu)
  parts.forEach((part, index) => {
    if (index > 0) cell.append(document.createElement("br"))
    cell.append(document.createTextNode(part))
  })
}

export class TableWidget extends WidgetType {
  readonly table: NoteTable

  constructor(table: NoteTable) {
    super()
    this.table = table
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TableWidget &&
      other.table.from === this.table.from &&
      other.table.sourceLines.length === this.table.sourceLines.length &&
      other.table.sourceLines.every(
        (line, index) => line.text === this.table.sourceLines[index]?.text,
      )
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div")
    root.className = "note-rich-table-wrap"
    root.tabIndex = 0
    root.setAttribute("role", "button")
    root.setAttribute("aria-label", "표 소스 편집")
    const table = document.createElement("table")
    this.table.rows.forEach((row, rowIndex) => {
      if (rowIndex === 1) return
      const tableRow = document.createElement("tr")
      row.forEach((value) => {
        const cell = document.createElement(rowIndex === 0 ? "th" : "td")
        appendCell(cell, value)
        tableRow.append(cell)
      })
      table.append(tableRow)
    })
    root.append(table)
    root.addEventListener("mousedown", (event) => {
      event.preventDefault()
      revealSource(view, this.table.from)
    })
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      revealSource(view, this.table.from)
    })
    return root
  }

  ignoreEvent(): boolean {
    return true
  }
}

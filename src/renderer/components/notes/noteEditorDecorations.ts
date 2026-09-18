import type { Range } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"
import { ImageWidget, MarkerWidget, MathWidget, TableWidget } from "./noteEditorWidgets"
import { findTableAt, isRenderableMath, safeNoteImageSource } from "./noteRichContent"

function selected(view: EditorView, from: number, to: number): boolean {
  const selection = view.state.selection.main
  return selection.from <= to && selection.to >= from
}

function addInline(
  view: EditorView,
  lineFrom: number,
  text: string,
  ranges: Range<Decoration>[],
): void {
  const patterns = [
    { regex: /!\[([^\]\n]*)\]\(([^)\s]+)\)/gu, kind: "image" },
    { regex: /\$(?!\$)([^$\n]+)\$/gu, kind: "math" },
    { regex: /\[([^\]\n]+)\]\(([^)\s]+)\)/gu, kind: "link" },
    { regex: /\[\[([^\]\n]+)\]\]/gu, kind: "wiki" },
  ] as const
  const occupied: Array<{ readonly from: number; readonly to: number }> = []
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      if (match.index === undefined) continue
      const from = lineFrom + match.index
      const to = from + match[0].length
      if (selected(view, from, to) || occupied.some((span) => from < span.to && to > span.from))
        continue
      if (pattern.kind === "image") {
        const source = safeNoteImageSource(match[2] ?? "")
        if (!source) {
          occupied.push({ from, to })
          continue
        }
        ranges.push(
          Decoration.replace({ widget: new ImageWidget(source, match[1] ?? "", from) }).range(
            from,
            to,
          ),
        )
      } else if (pattern.kind === "math") {
        const expression = match[1] ?? ""
        if (!isRenderableMath(expression)) continue
        ranges.push(
          Decoration.replace({ widget: new MathWidget(expression, false, from) }).range(from, to),
        )
      } else {
        const label =
          pattern.kind === "wiki" ? (match[1]?.split("|").at(-1) ?? "") : (match[1] ?? "")
        const wikiSeparator = pattern.kind === "wiki" ? (match[1]?.lastIndexOf("|") ?? -1) : -1
        const prefixLength = pattern.kind === "wiki" ? 2 + Math.max(0, wikiSeparator + 1) : 1
        ranges.push(Decoration.mark({ class: "note-rich-link" }).range(from, to))
        ranges.push(Decoration.replace({}).range(from, from + prefixLength))
        ranges.push(
          Decoration.replace({}).range(
            to - (pattern.kind === "wiki" ? 2 : match[0].length - label.length - 1),
            to,
          ),
        )
      }
      occupied.push({ from, to })
    }
  }
  for (const match of text.matchAll(/(`)([^`\n]+)(`)|\*\*([^*\n]+)\*\*/gu)) {
    if (match.index === undefined) continue
    const from = lineFrom + match.index
    const to = from + match[0].length
    if (selected(view, from, to) || occupied.some((span) => from < span.to && to > span.from))
      continue
    const marker = match[1] ? 1 : 2
    ranges.push(Decoration.replace({}).range(from, from + marker))
    ranges.push(
      Decoration.mark({ class: match[1] ? "note-rich-code" : "note-rich-strong" }).range(
        from + marker,
        to - marker,
      ),
    )
    ranges.push(Decoration.replace({}).range(to - marker, to))
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const source = view.state.doc.toString()
  const seenTables = new Set<number>()
  const seenMath = new Set<number>()
  for (const visible of view.visibleRanges) {
    const startLine = Math.max(1, view.state.doc.lineAt(visible.from).number - 80)
    const endLine = Math.min(view.state.doc.lines, view.state.doc.lineAt(visible.to).number + 80)
    for (let number = startLine; number <= endLine; number += 1) {
      const line = view.state.doc.line(number)
      let renderedDisplay = false
      if (/^\s*\$\$\s*$/u.test(line.text)) {
        for (let closing = number + 1; closing <= Math.min(endLine, number + 80); closing += 1) {
          const closingLine = view.state.doc.line(closing)
          if (!/^\s*\$\$\s*$/u.test(closingLine.text)) continue
          const expression = view.state.doc.sliceString(line.to + 1, closingLine.from - 1)
          const visibleBlock = closingLine.to >= visible.from && line.from <= visible.to
          if (
            visibleBlock &&
            !seenMath.has(line.from) &&
            isRenderableMath(expression) &&
            !selected(view, line.from, closingLine.to)
          ) {
            seenMath.add(line.from)
            ranges.push(
              Decoration.replace({
                widget: new MathWidget(expression, true, line.from),
              }).range(line.from, line.to),
            )
            for (let hidden = number + 1; hidden <= closing; hidden += 1) {
              const hiddenLine = view.state.doc.line(hidden)
              ranges.push(
                Decoration.line({ attributes: { class: "note-rich-hidden-line" } }).range(
                  hiddenLine.from,
                ),
              )
              if (hiddenLine.from < hiddenLine.to) {
                ranges.push(Decoration.replace({}).range(hiddenLine.from, hiddenLine.to))
              }
            }
            number = closing
            renderedDisplay = true
          }
          break
        }
        if (renderedDisplay) continue
      }
      const table = findTableAt(source, line.from)
      if (table && !seenTables.has(table.from) && !selected(view, table.from, table.to)) {
        seenTables.add(table.from)
        const firstLine = table.sourceLines[0]
        if (firstLine) {
          ranges.push(
            Decoration.replace({ widget: new TableWidget(table) }).range(
              firstLine.from,
              firstLine.to,
            ),
          )
          for (const hiddenLine of table.sourceLines.slice(1)) {
            ranges.push(
              Decoration.line({ attributes: { class: "note-rich-hidden-line" } }).range(
                hiddenLine.from,
              ),
            )
            if (hiddenLine.from < hiddenLine.to) {
              ranges.push(Decoration.replace({}).range(hiddenLine.from, hiddenLine.to))
            }
          }
        }
        continue
      }
      if (table) continue
      const display = /^\s*\$\$([\s\S]*?)\$\$\s*$/u.exec(line.text)
      if (display && isRenderableMath(display[1] ?? "") && !selected(view, line.from, line.to)) {
        ranges.push(
          Decoration.replace({
            widget: new MathWidget(display[1] ?? "", true, line.from),
          }).range(line.from, line.to),
        )
        continue
      }
      const block = /^(\s*)(#{1,6}\s+|[-+*]\s+|\d+[.)]\s+|>\s?)/u.exec(line.text)
      if (block && !selected(view, line.from, line.from + block[0].length)) {
        const markerFrom = line.from + (block[1]?.length ?? 0)
        const markerTo = line.from + block[0].length
        const token = block[2] ?? ""
        const className = token.startsWith("#")
          ? `note-live-heading note-live-heading-${token.trim().length}`
          : token.startsWith(">")
            ? "note-live-block note-live-quote"
            : "note-live-block"
        ranges.push(Decoration.line({ attributes: { class: className } }).range(line.from))
        const marker = token.startsWith("#")
          ? undefined
          : token.startsWith(">")
            ? "› "
            : /^[-+*]/u.test(token)
              ? "• "
              : token
        ranges.push(
          Decoration.replace(marker ? { widget: new MarkerWidget(marker) } : {}).range(
            markerFrom,
            markerTo,
          ),
        )
      }
      addInline(view, line.from, line.text, ranges)
    }
  }
  ranges.sort((left, right) => left.from - right.from || left.to - right.to)
  return Decoration.set(ranges, true)
}

export const noteLiveDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

import katex from "katex"

interface SourceLine {
  readonly from: number
  readonly to: number
  readonly text: string
}

export interface NoteTable {
  readonly from: number
  readonly to: number
  readonly columnCount: number
  readonly rows: readonly (readonly string[])[]
  readonly sourceLines: readonly SourceLine[]
}

export interface NoteSourceEdit {
  readonly source: string
  readonly cursor: number
}

function sourceLines(source: string): readonly SourceLine[] {
  const lines: SourceLine[] = []
  let from = 0
  for (let index = 0; index <= source.length; index += 1) {
    if (index === source.length || source[index] === "\n") {
      lines.push({ from, to: index, text: source.slice(from, index) })
      from = index + 1
    }
  }
  return lines
}

function hasUnescapedPipe(source: string): boolean {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "|") continue
    let slashes = 0
    for (let before = index - 1; before >= 0 && source[before] === "\\"; before -= 1) {
      slashes += 1
    }
    if (slashes % 2 === 0) return true
  }
  return false
}

export function splitTableCells(line: string): readonly string[] {
  const outer = line.trim()
  const content = outer.startsWith("|") ? outer.slice(1) : outer
  const withoutTrailing =
    content.endsWith("|") && !content.endsWith("\\|") ? content.slice(0, -1) : content
  const cells: string[] = []
  let cell = ""
  for (let index = 0; index < withoutTrailing.length; index += 1) {
    const character = withoutTrailing[index]
    if (character === "\\" && withoutTrailing[index + 1] === "|") {
      cell += "|"
      index += 1
    } else if (character === "|") {
      cells.push(cell.trim())
      cell = ""
    } else {
      cell += character
    }
  }
  cells.push(cell.trim())
  return cells
}

function isDelimiterRow(line: SourceLine, columns: number): boolean {
  const cells = splitTableCells(line.text)
  return cells.length === columns && cells.every((cell) => /^:?-{3,}:?$/u.test(cell))
}

export function findTableAt(source: string, position: number): NoteTable | null {
  const lines = sourceLines(source)
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = lines[index]
    const delimiter = lines[index + 1]
    if (!header || !delimiter || !hasUnescapedPipe(header.text)) continue
    const headerCells = splitTableCells(header.text)
    if (headerCells.length < 2 || !isDelimiterRow(delimiter, headerCells.length)) continue
    const rows: SourceLine[] = [header, delimiter]
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = lines[rowIndex]
      if (!row || !hasUnescapedPipe(row.text)) break
      if (splitTableCells(row.text).length !== headerCells.length) break
      rows.push(row)
    }
    const finalRow = rows[rows.length - 1]
    if (!finalRow || position < header.from || position > finalRow.to) continue
    return {
      from: header.from,
      to: finalRow.to,
      columnCount: headerCells.length,
      rows: rows.map((row) => splitTableCells(row.text)),
      sourceLines: rows,
    }
  }
  return null
}

export function addRowToTable(source: string, table: NoteTable | null): NoteSourceEdit {
  if (!table) return { source, cursor: Math.min(source.length, 0) }
  const row = `| ${Array.from({ length: table.columnCount }, () => "").join(" | ")} |`
  const insert = `\n${row}`
  return {
    source: `${source.slice(0, table.to)}${insert}${source.slice(table.to)}`,
    cursor: table.to + insert.length,
  }
}

export function addColumnToTable(source: string, table: NoteTable | null): NoteSourceEdit {
  if (!table) return { source, cursor: Math.min(source.length, 0) }
  let next = source
  for (let index = table.sourceLines.length - 1; index >= 0; index -= 1) {
    const line = table.sourceLines[index]
    if (!line) continue
    const trimmed = line.text.trimEnd()
    const isDelimiter = index === 1
    const insert = isDelimiter ? "| --- " : "|  "
    const at = trimmed.endsWith("|") ? line.from + trimmed.length - 1 : line.to
    const prefix = trimmed.endsWith("|") ? insert : ` ${insert}|`
    next = `${next.slice(0, at)}${prefix}${next.slice(at)}`
  }
  return { source: next, cursor: table.from }
}

export function safeNoteImageSource(source: string): string | null {
  const match = /^(?:(?:\.\.\/)+)?assets\/([a-f0-9]{64}\.(?:png|jpg|webp))$/u.exec(source)
  return match?.[1] ? `scourgify-asset://local/assets/${match[1]}` : null
}

export function isRenderableMath(expression: string): boolean {
  if (!expression.trim()) return false
  try {
    katex.renderToString(expression, { throwOnError: true, strict: "error" })
    return true
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
}

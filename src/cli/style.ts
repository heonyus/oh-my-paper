/** Minimal ANSI styling for the terminal wizard; plain text when colors are unwanted. */

const colorEnabled =
  Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env) && process.env["TERM"] !== "dumb"
const trueColor = colorEnabled && /truecolor|24bit/i.test(process.env["COLORTERM"] ?? "")

function style(open: string, close: string): (text: string) => string {
  return (text) => (colorEnabled ? `\x1b[${open}m${text}\x1b[${close}m` : text)
}

export const bold = style("1", "22")
export const dim = style("2", "22")
export const italic = style("3", "23")
export const underline = style("4", "24")
export const inverse = style("7", "27")
export const green = style("32", "39")
export const yellow = style("33", "39")
export const cyan = style("36", "39")
export const red = style("31", "39")
export const gray = style("90", "39")

type Rgb = readonly [number, number, number]

const LEAF: Rgb = [127, 209, 160]
const GOLD: Rgb = [239, 194, 69]

function rgb([r, g, b]: Rgb, text: string): string {
  if (!colorEnabled) return text
  if (!trueColor) return green(text)
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`
}

/** Colors each column along a left-to-right blend, so stacked rows share one gradient. */
export function gradient(line: string, width: number, from: Rgb = LEAF, to: Rgb = GOLD): string {
  if (!colorEnabled) return line
  return [...line]
    .map((char, index) => {
      if (char === " ") return char
      const t = width <= 1 ? 0 : index / (width - 1)
      const mixed: Rgb = [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
      ]
      return rgb(mixed, char)
    })
    .join("")
}

/** Three-row box-drawing letters ("Calvin S"), three columns each. */
const GLYPHS: Readonly<Record<string, readonly [string, string, string]>> = {
  o: ["┌─┐", "│ │", "└─┘"],
  h: ["┬ ┬", "├─┤", "┴ ┴"],
  "-": ["   ", "───", "   "],
  m: ["┌┬┐", "│││", "┴ ┴"],
  y: ["┬ ┬", "└┬┘", " ┴ "],
  p: ["┌─┐", "├─┘", "┴  "],
  a: ["┌─┐", "├─┤", "┴ ┴"],
  e: ["┌─┐", "├┤ ", "└─┘"],
  r: ["┬─┐", "├┬┘", "┴└─"],
}

export function wordmark(text = "oh-my-paper"): readonly string[] {
  const rows = [0, 1, 2].map((row) =>
    [...text].map((char) => GLYPHS[char]?.[row] ?? "   ").join(""),
  )
  const width = text.length * 3
  return rows.map((row) => gradient(row, width))
}

export function banner(version: string): string {
  const [top = "", middle = "", bottom = ""] = wordmark()
  return [
    "",
    `  ${top}`,
    `  ${middle}   ${dim(`v${version}`)}`,
    `  ${bottom}`,
    `  ${italic(gray("읽은 것은 남고, 필요한 것은 다시 찾을 수 있게."))}`,
    "",
  ].join("\n")
}

/** A key cap such as ` T `, drawn inverted so it reads as a key on dark and light themes. */
export function key(label: string): string {
  return colorEnabled ? `\x1b[7m ${label} \x1b[27m` : `[${label}]`
}

export function link(url: string): string {
  return underline(cyan(url))
}

const ANSI_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g")

/** Terminal columns a string occupies: Hangul and other wide CJK characters take two. */
export function displayWidth(text: string): number {
  const plain = text.replace(ANSI_SEQUENCE, "")
  let width = 0
  for (const char of plain) {
    const code = char.codePointAt(0) ?? 0
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60)
    width += wide ? 2 : 1
  }
  return width
}

export function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)))
}

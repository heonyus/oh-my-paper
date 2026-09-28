export function readSseData(frame: string): string | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
  return data.length > 0 ? data : null
}

export function splitSseFrames(buffer: string): {
  readonly frames: readonly string[]
  readonly rest: string
} {
  const frames: string[] = []
  let remainder = buffer
  for (;;) {
    const lineBreak = remainder.indexOf("\n\n")
    const carriageBreak = remainder.indexOf("\r\n\r\n")
    const index =
      lineBreak < 0
        ? carriageBreak
        : carriageBreak < 0
          ? lineBreak
          : Math.min(lineBreak, carriageBreak)
    if (index < 0) return { frames, rest: remainder }
    const separatorLength = index === carriageBreak ? 4 : 2
    frames.push(remainder.slice(0, index))
    remainder = remainder.slice(index + separatorLength)
  }
}

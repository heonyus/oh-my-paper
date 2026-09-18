import { deflateSync } from "node:zlib"

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const body = new Uint8Array(typeBytes.length + data.length)
  body.set(typeBytes)
  body.set(data, typeBytes.length)
  const result = new Uint8Array(12 + data.length)
  new DataView(result.buffer).setUint32(0, data.length)
  result.set(body, 4)
  new DataView(result.buffer).setUint32(result.length - 4, crc32(body))
  return result
}

export function buildSyntheticPng(): Uint8Array {
  const width = 160
  const height = 96
  const scanline = new Uint8Array(1 + width * 3)
  scanline[0] = 0
  for (let index = 1; index < scanline.length; index += 3) {
    scanline[index] = 210
    scanline[index + 1] = 225
    scanline[index + 2] = 245
  }
  const raw = new Uint8Array(scanline.length * height)
  for (let row = 0; row < height; row += 1) raw.set(scanline, row * scanline.length)
  const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 2
  const idat = deflateSync(raw)
  const output = new Uint8Array(header.length + 25 + 12 + idat.length + 12)
  output.set(header)
  let offset = header.length
  const headerChunk = chunk("IHDR", ihdr)
  output.set(headerChunk, offset)
  offset += headerChunk.length
  const dataChunk = chunk("IDAT", idat)
  output.set(dataChunk, offset)
  offset += dataChunk.length
  output.set(chunk("IEND", new Uint8Array()), offset)
  return output
}

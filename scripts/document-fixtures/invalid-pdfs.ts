export function buildMalformedPdf(): Uint8Array {
  return new TextEncoder().encode(
    "%PDF-1.7\nthis synthetic file has no valid cross-reference table\n",
  )
}

export function buildEncryptedPdf(): Uint8Array {
  const body = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj",
    "4 0 obj << /Filter /Standard /V 1 /R 2 /O <0000000000000000000000000000000000000000000000000000000000000000> /U <0000000000000000000000000000000000000000000000000000000000000000> /P -4 >> endobj",
    "trailer << /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<11111111111111111111111111111111><11111111111111111111111111111111>] >>",
    "startxref",
    "0",
    "%%EOF",
  ].join("\n")
  return new TextEncoder().encode(body)
}

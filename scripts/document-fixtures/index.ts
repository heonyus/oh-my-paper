import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { fixtureDefinitions } from "./definitions"
import { buildEncryptedPdf, buildMalformedPdf } from "./invalid-pdfs"
import type { DocumentFixtureManifest, FixtureEntry } from "./manifest"
import { documentFixtureManifestSchema, requiredFixtureClasses } from "./manifest"
import { buildScannedMixedPdf } from "./scanned-pdf"
import { buildStructuredPdf } from "./structured-pdf"

export type { DocumentFixtureManifest, FixtureEntry }
export { documentFixtureManifestSchema, requiredFixtureClasses }

export const DOCUMENT_FIXTURE_CORPUS_DIRECTORY = path.resolve(
  process.cwd(),
  "tests/fixtures/document-ast",
)
export const DOCUMENT_FIXTURE_MANIFEST_PATH = path.join(
  DOCUMENT_FIXTURE_CORPUS_DIRECTORY,
  "manifest.json",
)

type GeneratedFixture = {
  readonly definition: (typeof fixtureDefinitions)[number]
  readonly bytes: Uint8Array
}

async function buildFixture(
  definition: (typeof fixtureDefinitions)[number],
): Promise<GeneratedFixture> {
  const bytes =
    definition.id === "structured-document"
      ? await buildStructuredPdf()
      : definition.id === "scanned-mixed-document"
        ? await buildScannedMixedPdf()
        : definition.id === "malformed-document"
          ? buildMalformedPdf()
          : buildEncryptedPdf()
  return { definition, bytes }
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function createManifest(generated: readonly GeneratedFixture[]): DocumentFixtureManifest {
  return documentFixtureManifestSchema.parse({
    manifestVersion: "1.0.0",
    generatedBy: "ohmypaper-synthetic-document-fixtures",
    fixtures: generated.map(({ definition, bytes }) => ({
      ...definition,
      byteLength: bytes.byteLength,
      sha256: hashBytes(bytes),
    })),
  })
}

export type BuiltDocumentFixtureCorpus = {
  readonly manifest: DocumentFixtureManifest
  readonly hashes: Readonly<Record<string, string>>
}

export async function buildDocumentFixtureCorpus(
  outputDirectory: string,
): Promise<BuiltDocumentFixtureCorpus> {
  await fs.mkdir(outputDirectory, { recursive: true })
  const generated = await Promise.all(fixtureDefinitions.map(buildFixture))
  const manifest = createManifest(generated)
  await Promise.all(
    generated.map(({ definition, bytes }) =>
      fs.writeFile(path.join(outputDirectory, definition.fileName), bytes),
    ),
  )
  await fs.writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  const hashes = Object.fromEntries(
    generated.map(({ definition, bytes }) => [definition.id, hashBytes(bytes)]),
  )
  return { manifest, hashes }
}

export async function readDocumentFixtureManifest(
  manifestPath: string,
): Promise<DocumentFixtureManifest> {
  const contents = await fs.readFile(manifestPath, "utf8")
  return documentFixtureManifestSchema.parse(JSON.parse(contents))
}

export async function generateDocumentFixtureCorpus(): Promise<BuiltDocumentFixtureCorpus> {
  return buildDocumentFixtureCorpus(DOCUMENT_FIXTURE_CORPUS_DIRECTORY)
}

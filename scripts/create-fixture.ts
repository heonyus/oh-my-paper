import { promises as fs } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib"
import { drawFixtureHeaderFooter, type FixturePageContext } from "./fixture-page-shared"
import { renderFixturePage1 } from "./fixture-page1"
import type { FixtureGenerationResult, FixtureMetadata, FixtureOptions } from "./fixture-types"

export type { FixtureDocumentId } from "./fixture-types"

export const DEFAULT_FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/sample-paper.pdf")

export const DEFAULT_FIXTURE_METADATA: FixtureMetadata = {
  title: "Scourgify: Spatial Reading and Exploration of Scientific Papers",
  author: "Scourgify Research and Engineering",
  subject: "Deterministic Benchmark Fixture for Spatial Document Interaction",
  keywords: ["scourgify", "spatial-reading", "pdf-fixture", "deterministic", "benchmarks"],
  producer: "pdf-lib (https://github.com/Hopding/pdf-lib)",
  creator: "Scourgify Fixture Generator",
  creationDate: new Date("2026-08-26T00:00:00.000Z"),
  modificationDate: new Date("2026-08-26T00:00:00.000Z"),
}

function renderPage2(page: PDFPage, ctx: FixturePageContext): void {
  drawFixtureHeaderFooter(page, 2, ctx)
  page.drawText("2. Mathematical Formulations & Coordinate Transformations", {
    x: 50,
    y: 750,
    size: 12,
    font: ctx.bold,
    color: rgb(0.1, 0.1, 0.1),
  })
  page.drawText(
    "Spatial projections map document space P into canvas coordinates C under scale zoom z:",
    { x: 50, y: 730, size: 9, font: ctx.regular, color: rgb(0.2, 0.2, 0.2) },
  )
  const formulas = [
    {
      label: "Equation (1): Spatial Affine Projection",
      math: "C(p, z, t) = z * (p - c_origin) + c_origin + [ t_x , t_y ]^T",
      desc: "where p is PDF coordinate, z is scale, and t is pan offset.",
    },
    {
      label: "Equation (2): Variational Evidence Bound (ELBO)",
      math: "L(theta, phi; x) = E_{q_phi}[log p_theta(x | z)] - D_KL(q_phi(z | x) || p(z))",
      desc: "optimizing retrieval likelihood under deterministic latent space regularization.",
    },
    {
      label: "Equation (3): Multi-Head Cross Attention",
      math: "Attention(Q, K, V) = softmax( (Q * K^T) / sqrt(d_k) ) * V",
      desc: "computing card relevance against document selection tokens.",
    },
    {
      label: "Equation (4): Conservation Energy Boundary",
      math: "Delta E = integral_{0}^{T} grad f(x(t)) . x_dot(t) dt <= epsilon_tolerance",
      desc: "bounding energy dissipation during continuous viewport inertia animations.",
    },
  ]
  formulas.forEach((item, idx) => {
    const yBase = 705 - idx * 64
    page.drawText(item.label, {
      x: 50,
      y: yBase,
      size: 9.5,
      font: ctx.bold,
      color: rgb(0.15, 0.15, 0.15),
    })
    page.drawRectangle({
      x: 50,
      y: yBase - 32,
      width: 495,
      height: 26,
      color: rgb(0.95, 0.95, 0.97),
      borderColor: rgb(0.85, 0.85, 0.9),
      borderWidth: 0.5,
    })
    page.drawText(item.math, {
      x: 60,
      y: yBase - 24,
      size: 9,
      font: ctx.mono,
      color: rgb(0.05, 0.1, 0.3),
    })
    page.drawText(item.desc, {
      x: 50,
      y: yBase - 44,
      size: 8,
      font: ctx.regular,
      color: rgb(0.35, 0.35, 0.35),
    })
  })
}

function renderPage3(page: PDFPage, ctx: FixturePageContext): void {
  drawFixtureHeaderFooter(page, 3, ctx)
  page.drawText("3. Empirical Performance & Benchmark Results", {
    x: 50,
    y: 750,
    size: 12,
    font: ctx.bold,
    color: rgb(0.1, 0.1, 0.1),
  })
  page.drawText("Table 1: Execution metrics for deterministic document processing pipelines.", {
    x: 50,
    y: 730,
    size: 9,
    font: ctx.regular,
    color: rgb(0.2, 0.2, 0.2),
  })
  const top = 710
  const colX = [50, 170, 265, 360, 455, 545]
  const headers = ["Component", "Throughput", "Latency (p95)", "Memory", "Status"]
  const rows = [
    ["PDF Ingestion", "142 pg/sec", "6.8 ms", "32.4 MB", "VERIFIED"],
    ["Spatial Canvas", "60 FPS", "16.6 ms", "48.1 MB", "VERIFIED"],
    ["Card Extraction", "310 cards/s", "3.2 ms", "12.0 MB", "VERIFIED"],
    ["Coordinate Index", "890 queries/s", "1.1 ms", "18.5 MB", "VERIFIED"],
    ["Cold Relaunch", "N/A", "24.8 ms", "64.0 MB", "VERIFIED"],
  ]
  page.drawRectangle({ x: 50, y: top - 20, width: 495, height: 20, color: rgb(0.9, 0.92, 0.96) })
  headers.forEach((h, i) => {
    page.drawText(h, {
      x: (colX[i] ?? 50) + 6,
      y: top - 14,
      size: 8.5,
      font: ctx.bold,
      color: rgb(0.1, 0.1, 0.1),
    })
  })
  rows.forEach((r, rIdx) => {
    const rowY = top - 20 - rIdx * 20
    page.drawLine({
      start: { x: 50, y: rowY },
      end: { x: 545, y: rowY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    })
    r.forEach((cell, cIdx) => {
      page.drawText(cell, {
        x: (colX[cIdx] ?? 50) + 6,
        y: rowY - 14,
        size: 8,
        font: cIdx === 4 ? ctx.mono : ctx.regular,
        color: rgb(0.15, 0.15, 0.15),
      })
    })
  })
  const bottom = top - 20 - rows.length * 20
  page.drawRectangle({
    x: 50,
    y: bottom,
    width: 495,
    height: top - bottom,
    borderWidth: 0.75,
    borderColor: rgb(0.7, 0.7, 0.75),
  })
  colX.slice(1, -1).forEach((dividerX) => {
    page.drawLine({
      start: { x: dividerX, y: top },
      end: { x: dividerX, y: bottom },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    })
  })
  page.drawText("4. Concluding Verification Invariants", {
    x: 50,
    y: bottom - 30,
    size: 12,
    font: ctx.bold,
    color: rgb(0.1, 0.1, 0.1),
  })
  const conclusion = [
    "The evaluation confirms that deterministic fixture synthesis fulfills all structural preconditions for automated testing:",
    "fixed bounding dimensions, invariant text baseline positioning, and rigorous metadata provenance.",
  ]
  conclusion.forEach((l, i) => {
    page.drawText(l, {
      x: 50,
      y: bottom - 48 - i * 14,
      size: 9,
      font: ctx.regular,
      color: rgb(0.2, 0.2, 0.2),
    })
  })
}

export async function buildFixturePdf(options?: FixtureOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(options?.title ?? DEFAULT_FIXTURE_METADATA.title)
  doc.setAuthor(options?.author ?? DEFAULT_FIXTURE_METADATA.author)
  doc.setSubject(options?.subject ?? DEFAULT_FIXTURE_METADATA.subject)
  doc.setKeywords(Array.from(options?.keywords ?? DEFAULT_FIXTURE_METADATA.keywords))
  doc.setCreator(DEFAULT_FIXTURE_METADATA.creator)
  doc.setCreationDate(options?.creationDate ?? DEFAULT_FIXTURE_METADATA.creationDate)
  doc.setModificationDate(options?.modificationDate ?? DEFAULT_FIXTURE_METADATA.modificationDate)

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const ctx: FixturePageContext = { regular, bold, mono }

  const pageSize: [number, number] = [595.28, 841.89]
  const p1 = doc.addPage(pageSize)
  renderFixturePage1(p1, ctx)
  const p2 = doc.addPage(pageSize)
  renderPage2(p2, ctx)
  const p3 = doc.addPage(pageSize)
  renderPage3(p3, ctx)

  return doc.save()
}

export async function writeFixturePdf(
  outputPath?: string,
  options?: FixtureOptions,
): Promise<FixtureGenerationResult> {
  const targetPath = outputPath ?? DEFAULT_FIXTURE_PATH
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const pdfBytes = await buildFixturePdf(options)
  await fs.writeFile(targetPath, pdfBytes)

  return {
    outputPath: targetPath,
    byteLength: pdfBytes.byteLength,
    pageCount: 3,
    metadata: {
      title: options?.title ?? DEFAULT_FIXTURE_METADATA.title,
      author: options?.author ?? DEFAULT_FIXTURE_METADATA.author,
      subject: options?.subject ?? DEFAULT_FIXTURE_METADATA.subject,
      keywords: options?.keywords ?? DEFAULT_FIXTURE_METADATA.keywords,
      producer: DEFAULT_FIXTURE_METADATA.producer,
      creator: DEFAULT_FIXTURE_METADATA.creator,
      creationDate: options?.creationDate ?? DEFAULT_FIXTURE_METADATA.creationDate,
      modificationDate: options?.modificationDate ?? DEFAULT_FIXTURE_METADATA.modificationDate,
    },
  }
}

async function runCli(): Promise<void> {
  const result = await writeFixturePdf()
  process.stdout.write(
    `Deterministic PDF fixture created: ${result.outputPath} (${result.byteLength} bytes, ${result.pageCount} pages)\n`,
  )
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === currentFile) {
  runCli().catch((err: unknown) => {
    process.stderr.write(`Failed to generate fixture: ${String(err)}\n`)
    process.exitCode = 1
  })
}

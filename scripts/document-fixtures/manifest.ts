import { z } from "zod"

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

export const requiredFixtureClasses = [
  "multi-column-reading-order",
  "split-headings",
  "numeric-citations",
  "author-year-citations",
  "merged-cell-table",
  "multipart-figure-chart",
  "equations",
  "scanned-image-only",
  "mixed-text-image",
  "malformed-pdf",
  "encrypted-password",
] as const

export type FixtureClass = (typeof requiredFixtureClasses)[number]

const fixtureObjectKindSchema = z.enum([
  "heading",
  "paragraph",
  "table",
  "table-cell",
  "figure",
  "chart",
  "equation",
  "image",
  "citation-occurrence",
  "citation-reference",
  "ocr-block",
])

const sourceRangeSchema = z
  .object({
    id: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    text: z.string().min(1),
  })
  .superRefine((range, context) => {
    if (range.end <= range.start || range.text.length > range.end - range.start) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid source range" })
    }
  })

const pageDefinitionSchema = z
  .object({
    number: z.number().int().positive(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    textLength: z.number().int().nonnegative(),
    objects: z.array(
      z.object({
        id: z.string().min(1),
        kind: fixtureObjectKindSchema,
      }),
    ),
    sourceRanges: z.array(sourceRangeSchema),
  })
  .superRefine((page, context) => {
    const objectIds = new Set<string>()
    for (const object of page.objects) {
      if (objectIds.has(object.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate page object ID" })
      }
      objectIds.add(object.id)
    }
    const rangeIds = new Set<string>()
    for (const range of page.sourceRanges) {
      if (rangeIds.has(range.id) || range.end > page.textLength) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid page source range" })
      }
      rangeIds.add(range.id)
    }
  })

const fixtureEntrySchema = z.object({
  id: z.string().min(1),
  fileName: z.string().regex(/^[a-z0-9-]+\.pdf$/),
  classes: z.array(z.string().min(1)).min(1),
  parseExpectation: z.enum(["valid", "malformed", "encrypted"]),
  pageCount: z.number().int().nonnegative(),
  byteLength: z.number().int().positive(),
  sha256: sha256Schema,
  pages: z.array(pageDefinitionSchema),
})

export const documentFixtureManifestSchema = z
  .object({
    manifestVersion: z.literal("1.0.0"),
    generatedBy: z.literal("ohmypaper-synthetic-document-fixtures"),
    fixtures: z.array(fixtureEntrySchema).min(1),
  })
  .superRefine((manifest, context) => {
    const fixtureIds = new Set<string>()
    const fileNames = new Set<string>()
    const coveredClasses = new Set<string>()
    for (const fixture of manifest.fixtures) {
      if (fixtureIds.has(fixture.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate fixture ID" })
      }
      if (fileNames.has(fixture.fileName)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate fixture file" })
      }
      fixtureIds.add(fixture.id)
      fileNames.add(fixture.fileName)
      for (const fixtureClass of fixture.classes) coveredClasses.add(fixtureClass)
      if (fixture.parseExpectation === "valid" && fixture.pageCount !== fixture.pages.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "page count does not match manifest",
        })
      }
      if (fixture.parseExpectation !== "valid" && fixture.pages.length !== 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "invalid fixtures cannot declare pages",
        })
      }
    }
    for (const fixtureClass of requiredFixtureClasses) {
      if (!coveredClasses.has(fixtureClass)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `missing fixture class ${fixtureClass}`,
        })
      }
    }
  })

export type DocumentFixtureManifest = z.infer<typeof documentFixtureManifestSchema>
export type FixtureEntry = DocumentFixtureManifest["fixtures"][number]
export type PageDefinition = FixtureEntry["pages"][number]

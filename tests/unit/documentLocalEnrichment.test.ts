// @vitest-environment node

import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  LocalEnrichmentAdapter,
  localEnrichmentRuntimePython,
  localEnrichmentScriptPath,
} from "../../src/electron/localEnrichmentAdapter"
import type {
  LocalEnrichmentPageSignal,
  LocalEnrichmentRequest,
} from "../../src/shared/documentLocalEnrichment"
import {
  localEnrichmentResultSchema,
  localEnrichmentTextPolicy,
  selectLocalEnrichmentTargets,
} from "../../src/shared/documentLocalEnrichment"
import { documentIdSchema, sha256Schema } from "../../src/shared/schemas"

const hash = "a".repeat(64)
const sourceHash = sha256Schema.parse(hash)
const signal = (overrides: Partial<LocalEnrichmentPageSignal> = {}): LocalEnrichmentPageSignal => ({
  pageNumber: 1,
  textCharacters: 800,
  confidence: 0.96,
  regions: [],
  ...overrides,
})

describe("selective local document enrichment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("keeps a digital text page on the PP-DocLayout fast path", () => {
    expect(selectLocalEnrichmentTargets([signal()])).toEqual([])
  })

  it("selects only scanned, low-text, and flagged regions", () => {
    const targets = selectLocalEnrichmentTargets([
      signal({ pageNumber: 2, textCharacters: 0 }),
      signal({
        pageNumber: 3,
        regions: [
          {
            pageNumber: 3,
            kind: "table",
            bounds: { x: 10, y: 20, width: 100, height: 80 },
            confidence: 0.61,
            sourceTextStrength: "strong",
          },
        ],
      }),
    ])
    expect(targets.map((target) => target.kind)).toEqual(["scanned", "table"])
    expect(targets[1]?.sourceTextStrength).toBe("strong")
  })

  it("marks strong text as immutable when OCR is used as an augmentation", () => {
    const targets = selectLocalEnrichmentTargets([
      signal({
        regions: [
          {
            pageNumber: 1,
            kind: "formula",
            bounds: { x: 20, y: 40, width: 120, height: 60 },
            confidence: 0.55,
            sourceTextStrength: "strong",
          },
        ],
      }),
    ])
    expect(localEnrichmentTextPolicy(targets[0]?.sourceTextStrength ?? "none")).toBe(
      "preserve_source",
    )
  })

  it("caps richer work at eight selected regions", () => {
    const targets = selectLocalEnrichmentTargets(
      Array.from({ length: 12 }, (_, index) =>
        signal({
          pageNumber: index + 1,
          textCharacters: 0,
        }),
      ),
    )
    expect(targets).toHaveLength(8)
  })
})

describe("local enrichment adapter", () => {
  it("resolves dev and packaged scripts without changing the fast pass", () => {
    expect(localEnrichmentRuntimePython("/Users/test", "darwin")).toContain(
      ".ohmypaper/layout-runtime/bin/python",
    )
    expect(localEnrichmentScriptPath("/repo", "/App/Resources", true)).toBe(
      "/App/Resources/layout/pp_structure_enrichment.py",
    )
  })

  it("degrades without invoking a missing runtime and returns no fabricated records", async () => {
    const root = await mkdtemp(join(tmpdir(), "local-enrichment-test-"))
    try {
      const script = join(root, "pp_structure_enrichment.py")
      await writeFile(script, "", "utf8")
      await chmod(script, 0o644)
      const request: LocalEnrichmentRequest = {
        schemaVersion: "1.0.0",
        sourceHash,
        pdfPath: join(root, "synthetic.pdf"),
        targets: [
          {
            pageNumber: 1,
            kind: "scanned",
            confidence: 0.2,
            sourceTextStrength: "none",
          },
        ],
      }
      const result = await new LocalEnrichmentAdapter({
        appPath: root,
        resourcesPath: root,
        packaged: true,
        python: join(root, "missing-python"),
      }).enrich(documentIdSchema.parse(hash.slice(0, 16)), request)
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "local_enrichment_unavailable",
        detail: "runtime_missing",
      })
      expect(localEnrichmentResultSchema.parse(result)).toEqual(result)
      expect(result.status === "unavailable" && result.requestedTargetCount).toBe(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("invokes the local adapter with only selected scanned and structure regions", async () => {
    const root = await mkdtemp(join(tmpdir(), "local-enrichment-test-"))
    try {
      const resourceRoot = join(root, "layout")
      await mkdir(resourceRoot)
      const script = join(resourceRoot, "pp_structure_enrichment.py")
      await writeFile(
        script,
        [
          'const fs = require("node:fs")',
          'const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))',
          "if (input.targets.length !== 3) process.exit(2)",
          'if (input.targets.map((target) => target.kind).join(",") !== "scanned,table,formula") process.exit(3)',
          'if (process.env.HF_HUB_OFFLINE !== "1" || process.env.TRANSFORMERS_OFFLINE !== "1" || process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK !== "True") process.exit(4)',
          "if (!process.env.PADDLE_PDX_CACHE_HOME) process.exit(5)",
          'if (["OPENAI_API_KEY", "OAUTH_ACCESS_TOKEN", "HTTPS_PROXY", "CODEX_AUTH_TOKEN"].some((key) => process.env[key] === "canary-secret")) process.exit(6)',
          'fs.writeFileSync(process.argv[3], JSON.stringify({schemaVersion:"1.0.0",status:"ready",sourceHash:input.sourceHash,model:"PP-StructureV3",modelVersion:"paddleocr-3.7.0",records:[]}))',
        ].join("\n"),
        "utf8",
      )
      const signals = [
        signal({ pageNumber: 1, textCharacters: 0 }),
        signal({
          pageNumber: 2,
          regions: [
            {
              pageNumber: 2,
              kind: "table",
              bounds: { x: 10, y: 20, width: 100, height: 80 },
              confidence: 0.61,
              sourceTextStrength: "strong",
            },
          ],
        }),
        signal({
          pageNumber: 3,
          regions: [
            {
              pageNumber: 3,
              kind: "formula",
              bounds: { x: 12, y: 24, width: 120, height: 32 },
              confidence: 0.58,
              sourceTextStrength: "strong",
            },
          ],
        }),
      ]
      const targets = selectLocalEnrichmentTargets(signals)
      const request: LocalEnrichmentRequest = {
        schemaVersion: "1.0.0",
        sourceHash,
        pdfPath: join(root, "synthetic.pdf"),
        targets,
      }
      vi.stubEnv("OPENAI_API_KEY", "canary-secret")
      vi.stubEnv("OAUTH_ACCESS_TOKEN", "canary-secret")
      vi.stubEnv("HTTPS_PROXY", "canary-secret")
      vi.stubEnv("CODEX_AUTH_TOKEN", "canary-secret")
      const result = await new LocalEnrichmentAdapter({
        appPath: root,
        resourcesPath: root,
        packaged: true,
        python: process.execPath,
      }).enrich(documentIdSchema.parse(hash.slice(0, 16)), request)
      expect(result).toMatchObject({ status: "ready", model: "PP-StructureV3", records: [] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("parses a valid typed result without exposing document text in the adapter contract", () => {
    const result = localEnrichmentResultSchema.parse({
      schemaVersion: "1.0.0",
      status: "ready",
      sourceHash,
      model: "PP-StructureV3",
      modelVersion: "paddleocr-3.7.0",
      records: [
        {
          schemaVersion: "1.0.0",
          id: "local:ocr:0:0",
          kind: "ocr",
          targetKind: "scanned",
          pageNumber: 1,
          bounds: { x: 1, y: 2, width: 3, height: 4 },
          text: "synthetic fixture text",
          confidence: 0.81,
          origin: "local_pp_structure_v3",
          model: "PP-StructureV3",
          modelVersion: "paddleocr-3.7.0",
          sourceTextPolicy: "ocr_fallback",
        },
      ],
    })
    expect(result.status).toBe("ready")
    if (result.status !== "ready") return
    expect(result.records[0]?.sourceTextPolicy).toBe("ocr_fallback")
  })
})

import { describe, expect, it } from "vitest"
import { detectPdfFeatures, type PdfTextSpan } from "../../src/renderer/lib/pdfFeatureDetection"

describe("sectionFeatureDetection", () => {
  it("keeps title and section roles stable while suppressing front-matter metadata", () => {
    const base = [
      {
        id: "title-1",
        text: "SAMPLEAGENT: Advancing Autonomous Clinical Decision-Making",
        x: 120,
        y: 70,
        width: 560,
        height: 24,
        fontSize: 20,
        fontWeight: 700,
      },
      {
        id: "title-2",
        text: "via Retrospective Summarization",
        x: 220,
        y: 98,
        width: 360,
        height: 24,
        fontSize: 20,
        fontWeight: 700,
      },
      {
        id: "authors-1",
        text: "Yusheng Liao, Chuan Xuan, Yutong Cai, Lina Yang",
        x: 150,
        y: 150,
        width: 500,
        height: 20,
        fontSize: 16,
        fontWeight: 700,
      },
      {
        id: "authors-2",
        text: "Yanfeng Wang, Yu Wang",
        x: 280,
        y: 174,
        width: 240,
        height: 20,
        fontSize: 16,
        fontWeight: 700,
      },
      {
        id: "affiliation",
        text: "Shanghai Jiao Tong University",
        x: 250,
        y: 206,
        width: 300,
        height: 18,
        fontSize: 14,
        fontWeight: 400,
      },
      {
        id: "contact",
        text: "{first,last}@sjtu.edu.cn",
        x: 260,
        y: 230,
        width: 280,
        height: 18,
        fontSize: 13,
        fontWeight: 400,
      },
      {
        id: "abstract",
        text: "Abstract",
        x: 80,
        y: 290,
        width: 90,
        height: 18,
        fontSize: 14,
        fontWeight: 700,
      },
    ] satisfies readonly PdfTextSpan[]
    const detectAt = (zoom: number) =>
      detectPdfFeatures({
        pageNumber: 1,
        pageWidth: 800 * zoom,
        pageHeight: 1_120 * zoom,
        spans: base.map((span) => ({
          ...span,
          x: span.x * zoom,
          y: span.y * zoom,
          width: span.width * zoom,
          height: span.height * zoom,
          fontSize: span.fontSize * zoom,
        })),
      })

    const rolesAt80 = detectAt(0.8).map((feature) => feature.kind)
    const rolesAt150 = detectAt(1.5).map((feature) => feature.kind)

    expect(rolesAt80).toEqual(["heading", "heading"])
    expect(rolesAt150).toEqual(rolesAt80)
  })

  it("detects page-1 document title and merges multiline title rows", () => {
    const spans: readonly PdfTextSpan[] = [
      {
        id: "title-part1",
        text: "SampleAgent: Autonomous Clinical Agents",
        x: 80,
        y: 40,
        width: 440,
        height: 20,
        fontSize: 18,
        fontWeight: 700,
      },
      {
        id: "title-part2",
        text: "for Electronic Health Record Navigation",
        x: 100,
        y: 64,
        width: 400,
        height: 20,
        fontSize: 18,
        fontWeight: 700,
      },
      {
        id: "meta-author",
        text: "author@hospital.org  https://github.com/example/clinical-agent",
        x: 120,
        y: 90,
        width: 360,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "abstract-head",
        text: "Abstract",
        x: 72,
        y: 120,
        width: 80,
        height: 14,
        fontSize: 12,
        fontWeight: 700,
      },
      {
        id: "abstract-body",
        text: "We introduce an interactive agent for clinical queries across heterogeneous databases.",
        x: 72,
        y: 140,
        width: 450,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
    ]

    const features = detectPdfFeatures({ pageNumber: 1, pageWidth: 600, pageHeight: 800, spans })
    const headings = features.filter((f) => f.kind === "heading")

    expect(headings).toHaveLength(2)
    expect(headings[0]?.label).toBe(
      "SampleAgent: Autonomous Clinical Agents for Electronic Health Record Navigation",
    )
    expect(headings[0]?.sourceSpanIds).toEqual(["title-part1", "title-part2"])
    expect(headings[1]?.label).toBe("Abstract")
  })

  it("detects canonical scientific named sections", () => {
    const spans: readonly PdfTextSpan[] = [
      {
        id: "s1",
        text: "Introduction",
        x: 72,
        y: 60,
        width: 120,
        height: 16,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "s2",
        text: "Related Work",
        x: 72,
        y: 180,
        width: 140,
        height: 16,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "s3",
        text: "Methodology",
        x: 72,
        y: 300,
        width: 130,
        height: 16,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "s4",
        text: "Experiments",
        x: 72,
        y: 420,
        width: 120,
        height: 16,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "s5",
        text: "Discussion",
        x: 72,
        y: 540,
        width: 110,
        height: 16,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "s6",
        text: "References",
        x: 72,
        y: 660,
        width: 110,
        height: 16,
        fontSize: 14,
        fontWeight: 700,
      },
    ]

    const features = detectPdfFeatures({ pageNumber: 2, pageWidth: 600, pageHeight: 800, spans })
    const labels = features.filter((f) => f.kind === "heading").map((f) => f.label)

    expect(labels).toEqual([
      "Introduction",
      "Related Work",
      "Methodology",
      "Experiments",
      "Discussion",
      "References",
    ])
  })

  it("detects appendix letter headings and subsections", () => {
    const spans: readonly PdfTextSpan[] = [
      {
        id: "appendix-heading",
        text: "A Related Works",
        x: 320,
        y: 80,
        width: 160,
        height: 16,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "appendix-subheading",
        text: "B.2 Additional Results",
        x: 320,
        y: 220,
        width: 190,
        height: 16,
        fontSize: 13,
        fontWeight: 700,
      },
    ]

    const features = detectPdfFeatures({ pageNumber: 10, pageWidth: 600, pageHeight: 800, spans })

    expect(features.map((feature) => [feature.kind, feature.label])).toEqual([
      ["heading", "A Related Works"],
      ["subheading", "B.2 Additional Results"],
    ])
  })

  it("rejects body fragments that begin with a split capital letter", () => {
    const spans: readonly PdfTextSpan[] = [
      {
        id: "body-a",
        text: "A GENT EHR encompasses six core clinical tasks:",
        x: 320,
        y: 80,
        width: 260,
        height: 16,
        fontSize: 14,
        fontWeight: 400,
      },
      {
        id: "body-t",
        text: "T EHR, a novel benchmark covering six diverse tasks",
        x: 320,
        y: 120,
        width: 260,
        height: 16,
        fontSize: 14,
        fontWeight: 400,
      },
    ]

    expect(detectPdfFeatures({ pageNumber: 2, pageWidth: 600, pageHeight: 800, spans })).toEqual([])
  })

  it("distinguishes top-level numbered headings from subheadings", () => {
    const spans: readonly PdfTextSpan[] = [
      {
        id: "h1",
        text: "1 Introduction",
        x: 72,
        y: 50,
        width: 130,
        height: 15,
        fontSize: 13,
        fontWeight: 700,
      },
      {
        id: "sh1",
        text: "1.1 Clinical EHR Challenges",
        x: 72,
        y: 100,
        width: 220,
        height: 13,
        fontSize: 11,
        fontWeight: 700,
      },
      {
        id: "sh2",
        text: "1.2 Agent Formulation",
        x: 72,
        y: 150,
        width: 200,
        height: 13,
        fontSize: 11,
        fontWeight: 700,
      },
      {
        id: "subsub1",
        text: "1.2.1 State Space and Observation Loop",
        x: 72,
        y: 200,
        width: 280,
        height: 13,
        fontSize: 11,
        fontWeight: 700,
      },
      {
        id: "h2",
        text: "2 Methods",
        x: 72,
        y: 260,
        width: 100,
        height: 15,
        fontSize: 13,
        fontWeight: 700,
      },
    ]

    const features = detectPdfFeatures({ pageNumber: 1, pageWidth: 600, pageHeight: 800, spans })
    const headings = features.filter((f) => f.kind === "heading")
    const subheadings = features.filter((f) => f.kind === "subheading")

    expect(headings.map((f) => f.label)).toEqual(["1 Introduction", "2 Methods"])
    expect(subheadings.map((f) => f.label)).toEqual([
      "1.1 Clinical EHR Challenges",
      "1.2 Agent Formulation",
      "1.2.1 State Space and Observation Loop",
    ])
  })

  it("rejects body prose, wrapped lines, bullets, and list items", () => {
    const spans: readonly PdfTextSpan[] = [
      {
        id: "head",
        text: "3 Experimental Setup",
        x: 72,
        y: 50,
        width: 180,
        height: 15,
        fontSize: 13,
        fontWeight: 700,
      },
      {
        id: "prose-full",
        text: "In this section, we describe the dataset preparation and baseline configurations.",
        x: 72,
        y: 80,
        width: 450,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "prose-wrap1",
        text: "We evaluate all models on the MIMIC-IV benchmark under 5-fold cross",
        x: 72,
        y: 100,
        width: 440,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "prose-wrap2",
        text: "validation and compute area under ROC curve.",
        x: 72,
        y: 115,
        width: 320,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "bullet-1",
        text: "• Baseline 1: Standard LLM prompting with zero-shot retrieval.",
        x: 90,
        y: 140,
        width: 400,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "bullet-2",
        text: "- Baseline 2: Few-shot retrieval with domain embeddings.",
        x: 90,
        y: 160,
        width: 380,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "list-a",
        text: "(a) Sensitivity analysis across cohort partitions.",
        x: 90,
        y: 180,
        width: 350,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
    ]

    const features = detectPdfFeatures({ pageNumber: 3, pageWidth: 600, pageHeight: 800, spans })
    const sectionFeatures = features.filter((f) => f.kind === "heading" || f.kind === "subheading")

    expect(sectionFeatures).toHaveLength(1)
    expect(sectionFeatures[0]?.label).toBe("3 Experimental Setup")
  })

  it("rejects table rows, table headers, equations, and figure internal text", () => {
    const spans: readonly PdfTextSpan[] = [
      {
        id: "h",
        text: "4 Results",
        x: 72,
        y: 40,
        width: 100,
        height: 15,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "fig-node1",
        text: "Encoder Block",
        x: 100,
        y: 100,
        width: 80,
        height: 12,
        fontSize: 10,
        fontWeight: 700,
      },
      {
        id: "fig-node2",
        text: "Decoder Block",
        x: 220,
        y: 100,
        width: 80,
        height: 12,
        fontSize: 10,
        fontWeight: 700,
      },
      {
        id: "fig-cap",
        text: "Figure 3: Internal neural architecture of SampleAgent.",
        x: 72,
        y: 160,
        width: 340,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "eq",
        text: "L_{total} = L_{CE} + lambda L_{reg} (3)",
        x: 120,
        y: 200,
        width: 260,
        height: 15,
        fontSize: 11,
        fontWeight: 400,
      },
      {
        id: "th1",
        text: "Model   Precision   Recall   F1-Score",
        x: 80,
        y: 250,
        width: 280,
        height: 11,
        fontSize: 9,
        fontWeight: 700,
      },
      {
        id: "tr1",
        text: "SampleAgent (Ours)   0.88   0.84   0.86",
        x: 80,
        y: 270,
        width: 290,
        height: 11,
        fontSize: 9,
        fontWeight: 700,
      },
      {
        id: "tab-cap",
        text: "Table 4: Overall performance metrics on MIMIC-IV cohort.",
        x: 72,
        y: 330,
        width: 380,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ]

    const features = detectPdfFeatures({ pageNumber: 4, pageWidth: 600, pageHeight: 800, spans })
    const sectionFeatures = features.filter((f) => f.kind === "heading" || f.kind === "subheading")

    expect(sectionFeatures).toHaveLength(1)
    expect(sectionFeatures[0]?.label).toBe("4 Results")
    expect(features.some((f) => f.kind === "figure")).toBe(true)
    expect(features.some((f) => f.kind === "table")).toBe(true)
    expect(features.some((f) => f.kind === "equation")).toBe(true)
  })
})

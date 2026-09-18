import { createHash } from "node:crypto"
import { basename, extname } from "node:path"
import { nativeImage } from "electron"
import {
  type ExportApi,
  type ExportFormat,
  type ExportSaveRequest,
  exportPreviewSchema,
} from "../shared/exportIpc"
import type { ExportAsset, ExportBundle, ExportSourceReference } from "../shared/exportSchemas"
import { metadataFromNode } from "./bibliographyMetadata"
import { readBoundedAsset } from "./collectionAssetProtocol"
import { resolveCollectionPath } from "./collectionPaths"
import type { CollectionService } from "./collectionService"
import { resolveExportAssetPath } from "./exportAssetPath"
import { exportDocx } from "./exportDocx"
import { exportHtml } from "./exportHtml"
import { exportMarkdown } from "./exportMarkdown"
import { ElectronExportRenderer, exportPdf } from "./exportPdf"
import { createExportSnapshot, type ExportSnapshot } from "./exportSnapshot"
import type { WorkspaceStore } from "./workspaceStore"

export class ExportRevisionMismatchError extends Error {
  readonly name = "ExportRevisionMismatchError"

  constructor() {
    super("노트가 미리보기 이후 변경되었습니다. 최신 원본으로 다시 미리보세요.")
  }
}

export class ExportNodeError extends Error {
  readonly name = "ExportNodeError"
}

type ExportService = Pick<ExportApi, "preview"> & {
  readonly render: (request: ExportSaveRequest) => Promise<ExportBundle>
}

type AssetRef = {
  readonly source: string
  readonly relativePath: string
  readonly altText: string
}

const imageRefPattern =
  /!\[([^\]]{0,1000})\]\(((?:\.\.\/)+assets\/[a-f0-9]{64}\.(?:png|jpg|webp)|assets\/[a-f0-9]{64}\.(?:png|jpg|webp)|scourgify-asset:\/\/local\/assets\/[a-f0-9]{64}\.(?:png|jpg|webp))\)/gu
const MAX_ASSET_PIXELS = 16_777_216

function imageRefs(markdown: string, notePath: string): readonly AssetRef[] {
  const refs = new Map<string, AssetRef>()
  for (const match of markdown.matchAll(imageRefPattern)) {
    const [, altText, source] = match
    if (!source || altText === undefined) continue
    const relativePath = resolveExportAssetPath(source, notePath)
    if (relativePath) refs.set(source, { source, relativePath, altText })
  }
  return [...refs.values()]
}

function mediaTypeFor(extension: string): "image/png" | "image/jpeg" {
  return extension.toLocaleLowerCase("en-US") === ".jpg" ? "image/jpeg" : "image/png"
}

async function readAsset(
  collection: CollectionService,
  ref: AssetRef,
): Promise<Omit<ExportAsset, "id"> | null> {
  try {
    const resolved = await resolveCollectionPath(collection.collectionRoot, ref.relativePath)
    const original = await readBoundedAsset(resolved.path)
    const image = nativeImage.createFromBuffer(original)
    const size = image.getSize()
    if (
      image.isEmpty() ||
      size.width <= 0 ||
      size.height <= 0 ||
      size.width * size.height > MAX_ASSET_PIXELS
    )
      return null
    const extension = extname(ref.relativePath)
    const webp = extension.toLocaleLowerCase("en-US") === ".webp"
    return {
      source: ref.source,
      filename: webp ? `${basename(ref.relativePath, extension)}.png` : basename(ref.relativePath),
      mediaType: webp ? "image/png" : mediaTypeFor(extension),
      bytes: webp ? Uint8Array.from(image.toPNG()) : Uint8Array.from(original),
      width: size.width,
      height: size.height,
      altText: ref.altText,
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}

function bibliographyFor(node: ReturnType<WorkspaceStore["repository"]["getNode"]>) {
  if (node?.kind !== "paper") return null
  const metadata = metadataFromNode(node)
  const text = [
    metadata.authors.length ? metadata.authors.join(", ") : null,
    metadata.year ? `(${metadata.year})` : null,
    node.title,
    metadata.venue || null,
  ]
    .filter((item): item is string => item !== null)
    .join(". ")
  const url = metadata.doi
    ? `https://doi.org/${metadata.doi}`
    : metadata.arxivId
      ? `https://arxiv.org/abs/${metadata.arxivId}`
      : null
  return { key: metadata.citationKey, text, url }
}

export function createExportSnapshotRevision(
  noteRevision: string,
  records: readonly unknown[],
  bibliography: readonly unknown[],
  sources: readonly unknown[],
  assets: readonly { readonly source: string; readonly bytes: Uint8Array }[],
): string {
  const hash = createHash("sha256")
  hash.update(noteRevision)
  hash.update(JSON.stringify({ records, bibliography, sources }))
  for (const asset of assets) {
    hash.update(asset.source)
    hash.update(asset.bytes)
  }
  return hash.digest("hex")
}

async function snapshotFor(
  store: WorkspaceStore,
  collection: CollectionService,
  nodeId: ExportSaveRequest["nodeId"],
): Promise<ExportSnapshot> {
  await collection.rescan()
  const node = collection.getNode(nodeId)
  if (node?.kind !== "note") throw new ExportNodeError("내보낼 노트를 찾을 수 없습니다.")
  const indexed = collection.index.get(node.id)
  if (!indexed) throw new ExportNodeError("노트 원본 파일을 찾을 수 없습니다.")
  const relations = store.repository.findRelations({ nodeId: node.id })
  const anchors = [...new Set(relations.flatMap((relation) => relation.evidenceIds))]
    .map((id) => store.repository.getEvidenceAnchor(id))
    .filter((anchor): anchor is NonNullable<typeof anchor> => anchor !== null)
  const nodeIds = new Set([
    node.id,
    ...relations.flatMap((relation) => [relation.sourceId, relation.targetId]),
  ])
  const records = [...nodeIds].flatMap((id) => {
    const record = store.repository.getNode(id)
    if (!record) return []
    const evidence = anchors.filter((anchor) => {
      const version = store.repository.getDocumentVersion(anchor.documentVersionId)
      return version?.paperNodeId === record.id
    })
    const documentVersions = evidence.flatMap((anchor) => {
      const version = store.repository.getDocumentVersion(anchor.documentVersionId)
      return version ? [{ id: version.id, hash: version.hash }] : []
    })
    const exportEvidence = evidence.map(({ id, documentVersionId, page, quote }) => ({
      id,
      documentVersionId,
      page,
      quote,
    }))
    return [
      {
        id: record.id,
        kind: record.kind,
        title: record.title,
        aliases: record.aliases,
        documentVersions,
        evidence: exportEvidence,
        relations: relations.filter(
          (relation) => relation.sourceId === record.id || relation.targetId === record.id,
        ),
      },
    ]
  })
  const bibliography = [...nodeIds]
    .map((id) => bibliographyFor(store.repository.getNode(id)))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  const sources: ExportSourceReference[] = anchors.flatMap((anchor) => {
    const version = store.repository.getDocumentVersion(anchor.documentVersionId)
    const paper = version ? store.repository.getNode(version.paperNodeId) : null
    return [
      {
        id: anchor.id,
        label: paper?.title ?? "Scourgify source",
        locator: `Page ${anchor.page}`,
        url: null,
        availability: "scourgify_only",
      },
    ]
  })
  const assets = (
    await Promise.all(
      imageRefs(indexed.body, indexed.relativePath).map((ref) => readAsset(collection, ref)),
    )
  )
    .filter((asset): asset is NonNullable<typeof asset> => asset !== null)
    .map((asset) => ({ ...asset, id: asset.source }))
  const revision = createExportSnapshotRevision(
    indexed.revision,
    records,
    bibliography,
    sources,
    assets,
  )
  return createExportSnapshot({
    format: "scourgify-export-snapshot-v1",
    title: node.title,
    revision,
    markdown: indexed.body,
    records,
    assets,
    bibliography,
    sources,
  })
}

async function bundleFor(format: ExportFormat, snapshot: ExportSnapshot): Promise<ExportBundle> {
  const renderer = format === "pdf" || format === "docx" ? new ElectronExportRenderer() : null
  if (format === "markdown") return exportMarkdown(snapshot)
  if (format === "html") return { files: [exportHtml(snapshot)] }
  if (format === "docx") {
    return {
      files: [await exportDocx(snapshot, renderer ? { renderMath: renderer.renderMath } : {})],
    }
  }
  return { files: [await exportPdf(snapshot, renderer ? { renderer } : {})] }
}

export function createApplicationExport(
  store: WorkspaceStore,
  collection: CollectionService,
): ExportService {
  const snapshot = (nodeId: ExportSaveRequest["nodeId"]) => snapshotFor(store, collection, nodeId)
  return {
    preview: async (nodeId) => {
      const selected = await snapshot(nodeId)
      return exportPreviewSchema.parse({
        nodeId,
        title: selected.title,
        revision: selected.revision,
        recordCount: selected.records.length,
        assetCount: selected.assets.length,
        bibliographyCount: selected.bibliography.length,
        sourceCount: selected.sources.length,
        limitationCount: selected.limitations.length,
      })
    },
    render: async (request) => {
      const selected = await snapshot(request.nodeId)
      if (selected.revision !== request.revision) throw new ExportRevisionMismatchError()
      return await bundleFor(request.format, selected)
    },
  }
}

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat } from "node:fs/promises"
import { posix } from "node:path"
import {
  LOCAL_INFERENCE_CANDIDATE,
  type LocalInferenceSetupCheck,
  type LocalInferenceSetupManifest,
  localInferenceSetupManifestSchema,
} from "../shared/localInference"

type LocalInferenceSetupOptions = {
  readonly platform?: NodeJS.Platform
  readonly arch?: string
}

const TAR_OUTPUT_LIMIT = 128 * 1024 * 1024

async function fileHash(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(path)
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(hash.digest("hex")))
  })
}

async function commandOutput(command: string, args: readonly string[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    const chunks: Buffer[] = []
    let length = 0
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      child.kill()
      reject(error)
    }
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.byteLength
      if (length > TAR_OUTPUT_LIMIT) {
        fail(new Error("tar output exceeded the verification limit"))
        return
      }
      chunks.push(chunk)
    })
    child.stderr.resume()
    child.once("error", fail)
    child.once("close", (code) => {
      if (settled) return
      if (code !== 0) {
        fail(new Error(`tar exited with status ${String(code)}`))
        return
      }
      settled = true
      resolve(Buffer.concat(chunks))
    })
  })
}

function unavailable(
  reason: Extract<LocalInferenceSetupCheck, { readonly status: "unavailable" }>["reason"],
  message: string,
): LocalInferenceSetupCheck {
  return { status: "unavailable", reason, message }
}

function safeArchiveMember(member: string): boolean {
  return (
    member.length > 0 &&
    !member.startsWith("/") &&
    !member.split("/").some((part) => part === "" || part === "." || part === "..") &&
    posix.normalize(member) === member
  )
}

async function archiveExecutableHash(archivePath: string): Promise<string> {
  const listing = (await commandOutput("tar", ["-tzf", archivePath])).toString("utf8")
  const members = listing.split(/\r?\n/u).filter((member) => member.length > 0)
  const executableMembers = members.filter(
    (member) => posix.basename(member) === LOCAL_INFERENCE_CANDIDATE.runtime.executableName,
  )
  const member = executableMembers[0]
  if (member === undefined || executableMembers.length !== 1 || !safeArchiveMember(member)) {
    throw new Error("the pinned archive has no safe unique llama-server member")
  }
  const details = (await commandOutput("tar", ["-tvzf", archivePath, member])).toString("utf8")
  const detailLine = details.split(/\r?\n/u).find((line) => line.endsWith(` ${member}`))
  if (detailLine === undefined || !detailLine.startsWith("-")) {
    throw new Error("the pinned archive member is not a regular file")
  }
  const executable = await commandOutput("tar", ["-xOzf", archivePath, member])
  return createHash("sha256").update(executable).digest("hex")
}

async function regularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile()
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
}

export async function createLocalInferenceSetupManifest(paths: {
  readonly runtimePath: string
  readonly runtimeArchivePath: string
  readonly modelPath: string
}): Promise<LocalInferenceSetupManifest> {
  return localInferenceSetupManifestSchema.parse({
    ...paths,
    runtimeVersion: LOCAL_INFERENCE_CANDIDATE.runtime.version,
    runtimeExecutableSha256: await fileHash(paths.runtimePath),
    modelRevision: LOCAL_INFERENCE_CANDIDATE.model.revision,
    licenseAccepted: true,
  })
}

export async function verifyLocalInferenceSetup(
  manifest: LocalInferenceSetupManifest,
  options: LocalInferenceSetupOptions = {},
): Promise<LocalInferenceSetupCheck> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  if (platform !== "darwin" || arch !== "arm64") {
    return unavailable("unsupported_device", "로컬 AI 후보는 macOS Apple Silicon에서만 지원됩니다.")
  }
  if (!manifest.licenseAccepted) {
    return unavailable("license_required", "Qwen Apache-2.0 라이선스를 먼저 확인해야 합니다.")
  }
  if (manifest.modelRevision !== LOCAL_INFERENCE_CANDIDATE.model.revision) {
    return unavailable(
      "model_revision_mismatch",
      "설정 매니페스트의 Qwen revision이 일치하지 않습니다.",
    )
  }
  if (!(await regularFile(manifest.runtimePath))) {
    return unavailable("runtime_missing", "선택한 llama.cpp 실행 파일을 찾을 수 없습니다.")
  }
  if (!(await regularFile(manifest.runtimeArchivePath))) {
    return unavailable(
      "runtime_archive_missing",
      "공식 llama.cpp arm64 아카이브를 선택해야 합니다.",
    )
  }
  if (!(await regularFile(manifest.modelPath))) {
    return unavailable("model_missing", "선택한 GGUF 모델을 찾을 수 없습니다.")
  }
  try {
    const archiveHash = await fileHash(manifest.runtimeArchivePath)
    if (archiveHash !== LOCAL_INFERENCE_CANDIDATE.runtime.archiveSha256) {
      return unavailable(
        "runtime_archive_hash_mismatch",
        "llama.cpp 아카이브 SHA-256 검증에 실패했습니다.",
      )
    }
    const [modelHash, archiveExecutableHashValue, runtimeHash] = await Promise.all([
      fileHash(manifest.modelPath),
      archiveExecutableHash(manifest.runtimeArchivePath),
      fileHash(manifest.runtimePath),
    ])
    if (modelHash !== LOCAL_INFERENCE_CANDIDATE.model.sha256) {
      return unavailable("model_hash_mismatch", "Qwen GGUF 모델 SHA-256 검증에 실패했습니다.")
    }
    if (
      runtimeHash !== archiveExecutableHashValue ||
      manifest.runtimeExecutableSha256 !== archiveExecutableHashValue
    ) {
      return unavailable(
        "runtime_executable_hash_mismatch",
        "선택한 llama.cpp 실행 파일이 공식 아카이브와 일치하지 않습니다.",
      )
    }
    return { status: "ready", manifest }
  } catch (error) {
    if (error instanceof Error)
      return unavailable("execution_failed", "로컬 파일 검증에 실패했습니다.")
    throw error
  }
}

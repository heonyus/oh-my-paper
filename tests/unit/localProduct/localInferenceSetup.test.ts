// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { verifyLocalInferenceSetup } from "../../../src/electron/localInferenceSetup"
import {
  LOCAL_INFERENCE_CANDIDATE,
  type LocalInferenceSetupManifest,
} from "../../../src/shared/localInference"

const manifest: LocalInferenceSetupManifest = {
  runtimePath: "/tmp/llama-server",
  runtimeArchivePath: "/tmp/llama.tar.gz",
  modelPath: "/tmp/qwen.gguf",
  runtimeVersion: LOCAL_INFERENCE_CANDIDATE.runtime.version,
  runtimeExecutableSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  modelRevision: LOCAL_INFERENCE_CANDIDATE.model.revision,
  licenseAccepted: true,
}

describe("local inference setup verification", () => {
  it("rejects unsupported devices before touching user-selected files", async () => {
    await expect(
      verifyLocalInferenceSetup(manifest, { platform: "linux", arch: "x64" }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "unsupported_device",
      message: "로컬 AI 후보는 macOS Apple Silicon에서만 지원됩니다.",
    })
  })

  it("requires explicit license acceptance", async () => {
    await expect(
      verifyLocalInferenceSetup(
        { ...manifest, licenseAccepted: false },
        { platform: "darwin", arch: "arm64" },
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "license_required" })
  })

  it("does not accept user-supplied archive or model digest authority", async () => {
    const result = await import("../../../src/shared/localInference")
    expect(
      result.localInferenceSetupManifestSchema.safeParse({
        ...manifest,
        runtimeArchiveSha256: LOCAL_INFERENCE_CANDIDATE.runtime.archiveSha256,
        modelSha256: LOCAL_INFERENCE_CANDIDATE.model.sha256,
      }).success,
    ).toBe(false)
  })

  it("rejects an unpinned archive before invoking tar", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-local-setup-"))
    const runtimePath = join(root, "llama-server")
    const runtimeArchivePath = join(root, "llama.tar.gz")
    const modelPath = join(root, "qwen.gguf")
    try {
      await Promise.all([
        writeFile(runtimePath, "runtime"),
        writeFile(runtimeArchivePath, "not a tar archive"),
        writeFile(modelPath, "model"),
      ])

      await expect(
        verifyLocalInferenceSetup(
          { ...manifest, runtimePath, runtimeArchivePath, modelPath },
          { platform: "darwin", arch: "arm64" },
        ),
      ).resolves.toMatchObject({
        status: "unavailable",
        reason: "runtime_archive_hash_mismatch",
      })
    } finally {
      await rm(root, { recursive: true })
    }
  })
})

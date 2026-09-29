import type { JSX } from "react"
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { Backdrop } from "../parts/Backdrop"
import { BrowserWindow, TITLE_BAR } from "../parts/BrowserWindow"
import { Caption } from "../parts/Caption"
import { Cursor } from "../parts/Cursor"
import { cameraAt } from "../parts/camera"
import type { RecordedScene, Recording } from "../timeline"

/** The real recording and pointer inside a camera that eases toward what matters. */
export function RecordingStage({
  recording,
  scene,
  width,
  maxZoom,
}: {
  readonly recording: Recording
  readonly scene: RecordedScene
  readonly width: number
  readonly maxZoom?: number
}): JSX.Element {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = scene.start + frame / fps
  const { w, h } = recording.viewport
  const k = width / w
  const height = h * k
  const camera = cameraAt(scene, t, recording.viewport, maxZoom)
  const tx = Math.min(
    0,
    Math.max(width - width * camera.scale, width / 2 - camera.cx * k * camera.scale),
  )
  const ty = Math.min(
    0,
    Math.max(height - height * camera.scale, height / 2 - camera.cy * k * camera.scale),
  )
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        transformOrigin: "0 0",
        transform: `translate(${tx}px, ${ty}px) scale(${camera.scale})`,
      }}
    >
      <OffthreadVideo
        src={staticFile(recording.video)}
        trimBefore={Math.round(scene.start * fps)}
        muted
        style={{ width, height, display: "block" }}
      />
      <div
        style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `scale(${k})` }}
      >
        <Cursor events={recording.events} t={t} />
      </div>
    </div>
  )
}

export function AppScene({
  recording,
  scene,
}: {
  readonly recording: Recording
  readonly scene: RecordedScene
}): JSX.Element {
  const { width: videoWidth, height: videoHeight, durationInFrames } = useVideoConfig()
  const width = 1512
  const height = (recording.viewport.h / recording.viewport.w) * width
  return (
    <Backdrop>
      <BrowserWindow
        width={width}
        height={height}
        url={recording.url}
        style={{ left: (videoWidth - width) / 2, top: (videoHeight - height - TITLE_BAR) / 2 }}
      >
        <RecordingStage recording={recording} scene={scene} width={width} />
      </BrowserWindow>
      <AbsoluteFill>
        <Caption text={scene.caption} keys={scene.keys} durationInFrames={durationInFrames} />
      </AbsoluteFill>
    </Backdrop>
  )
}

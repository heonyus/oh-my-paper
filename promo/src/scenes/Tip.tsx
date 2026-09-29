import type { JSX } from "react"
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion"
import { color } from "../theme"
import type { RecordedScene, Recording } from "../timeline"
import { RecordingStage } from "./AppScene"

/** A small looping clip of one feature for the in-app tips: the recording held zoomed, no chrome. */
export function Tip({
  recording,
  scene,
}: {
  readonly recording: Recording
  readonly scene: RecordedScene
}): JSX.Element {
  const frame = useCurrentFrame()
  const { width, durationInFrames } = useVideoConfig()
  const fade = interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  return (
    <AbsoluteFill style={{ background: color.canvas }}>
      <AbsoluteFill style={{ opacity: fade }}>
        <RecordingStage
          recording={recording}
          scene={{ ...scene, zoomIn: false, zoomOut: false }}
          width={width}
          maxZoom={2.4}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

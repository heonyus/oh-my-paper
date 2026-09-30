import "./theme"
import type { JSX } from "react"
import { Composition, Series, staticFile } from "remotion"
import { AppScene } from "./scenes/AppScene"
import { Install } from "./scenes/Install"
import { Intro } from "./scenes/Intro"
import { Outro } from "./scenes/Outro"
import { Tip } from "./scenes/Tip"
import type { Cut, Recording } from "./timeline"

const FPS = 30
const INTRO = 96
const INSTALL = 236
const OUTRO = 120

type PromoProps = { readonly cuts: readonly Cut[] }
type TipProps = {
  readonly cuts: readonly Cut[]
  /** Consecutive shots that make up one tip, e.g. a request and its answer. */
  readonly sceneIds: readonly string[]
}

/**
 * Every scene of every recording listed in a public list; missing files are skipped.
 * `timelines.json` feeds the README video and the tips, `tip-timelines.json` only the tips.
 */
async function loadCuts(list = "timelines.json"): Promise<readonly Cut[]> {
  const listed = await fetch(staticFile(list))
  if (!listed.ok) return []
  const files = (await listed.json()) as string[]
  const cuts: Cut[] = []
  for (const file of files) {
    const response = await fetch(staticFile(file))
    if (!response.ok) continue
    const recording = (await response.json()) as Recording
    for (const scene of recording.scenes) cuts.push({ recording, scene })
  }
  return cuts
}

function tipCuts(props: TipProps): readonly Cut[] {
  return props.sceneIds.flatMap((id) => props.cuts.filter((cut) => cut.scene.id === id))
}

const frames = (seconds: number): number => Math.max(1, Math.round(seconds * FPS))

function Promo({ cuts }: PromoProps): JSX.Element {
  return (
    <Series>
      <Series.Sequence durationInFrames={INTRO}>
        <Intro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={INSTALL}>
        <Install />
      </Series.Sequence>
      {cuts.map(({ recording, scene }) => (
        <Series.Sequence
          key={`${recording.video}:${scene.id}`}
          durationInFrames={frames(scene.end - scene.start)}
        >
          <AppScene recording={recording} scene={scene} />
        </Series.Sequence>
      ))}
      <Series.Sequence durationInFrames={OUTRO}>
        <Outro />
      </Series.Sequence>
    </Series>
  )
}

function TipClip(props: TipProps): JSX.Element {
  return (
    <Series>
      {tipCuts(props).map(({ recording, scene }) => (
        <Series.Sequence key={scene.id} durationInFrames={frames(scene.end - scene.start)}>
          <Tip recording={recording} scene={scene} />
        </Series.Sequence>
      ))}
    </Series>
  )
}

export function Root(): JSX.Element {
  return (
    <>
      <Composition
        id="Promo"
        component={Promo}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={INTRO + INSTALL + OUTRO}
        defaultProps={{ cuts: [] } as PromoProps}
        calculateMetadata={async () => {
          const cuts = await loadCuts()
          const scenes = cuts.reduce((sum, { scene }) => sum + frames(scene.end - scene.start), 0)
          return { props: { cuts }, durationInFrames: INTRO + INSTALL + scenes + OUTRO }
        }}
      />
      <Composition
        id="Tip"
        component={TipClip}
        fps={FPS}
        width={960}
        height={600}
        durationInFrames={150}
        defaultProps={{ cuts: [], sceneIds: ["translate", "translate-result"] } as TipProps}
        calculateMetadata={async ({ props }) => {
          const cuts = [...(await loadCuts()), ...(await loadCuts("tip-timelines.json"))]
          const shots = tipCuts({ ...props, cuts })
          const total = shots.reduce((sum, { scene }) => sum + frames(scene.end - scene.start), 0)
          return { props: { ...props, cuts }, durationInFrames: Math.max(1, total) }
        }}
      />
    </>
  )
}

import { continueRender, delayRender, staticFile } from "remotion"

export const color = {
  canvas: "#f4f5f2",
  surface: "#ffffff",
  note: "#f3f5ee",
  ink: "#17251f",
  muted: "#556259",
  line: "#d6ddd5",
  action: "#285644",
  subtle: "#e3ebe5",
  marker: "rgba(239, 194, 69, 0.45)",
  gold: "#efc245",
  leaf: "#7fd1a0",
  terminal: "#0f1512",
  terminalLine: "#223029",
}

export const font = "'Wanted Sans', 'Apple SD Gothic Neo', sans-serif"
export const mono = "'SF Mono', 'JetBrains Mono', Menlo, monospace"

const handle = delayRender("Loading Wanted Sans")
const face = new FontFace("Wanted Sans", `url(${staticFile("WantedSansVariable.woff2")})`, {
  weight: "200 800",
})
face
  .load()
  .then((loaded) => {
    document.fonts.add(loaded)
    continueRender(handle)
  })
  .catch(() => continueRender(handle))

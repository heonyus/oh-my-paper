import type { JSX, ReactNode } from "react"
import { AbsoluteFill } from "remotion"
import { color, font } from "../theme"

/** The app's canvas with the onboarding's mint/lilac wash and dot grid. */
export function Backdrop({ children }: { readonly children?: ReactNode }): JSX.Element {
  return (
    <AbsoluteFill style={{ background: color.canvas, fontFamily: font, color: color.ink }}>
      <AbsoluteFill
        style={{
          background: [
            "radial-gradient(55% 50% at 12% 16%, rgba(206, 226, 212, 0.95), transparent)",
            "radial-gradient(45% 45% at 90% 90%, rgba(154, 115, 175, 0.16), transparent)",
            "radial-gradient(40% 40% at 80% 10%, rgba(239, 194, 69, 0.14), transparent)",
          ].join(","),
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(23, 37, 31, 0.08) 1.4px, transparent 1.8px)",
          backgroundSize: "30px 30px",
          maskImage: "radial-gradient(120% 90% at 40% 40%, #000 40%, transparent 100%)",
        }}
      />
      {children}
    </AbsoluteFill>
  )
}

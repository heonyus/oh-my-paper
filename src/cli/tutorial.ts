import { homedir } from "node:os"
import { t } from "./messages"
import { bold, dim, gray, key, link, padEnd } from "./style"

export function appUrl(host: string, port: number): string {
  return `http://${host}:${port}`
}

/** The short tour shown at the end of onboarding and by `oh-my-paper help`. */
export function quickstart(url: string, dataDir: string): string {
  const row = (label: string, text: string): string => `${padEnd(bold(label), 10)}${text}`
  return [
    row(t("tour.start"), t("tour.startText", { app: bold("oh-my-paper"), url: link(url) })),
    row(t("tour.import"), t("tour.importText")),
    row(t("tour.read"), t("tour.readText")),
    `${" ".repeat(10)}${key("T")} ${t("tour.keyT")}  ${key("E")} ${t("tour.keyE")}  ${key("C")} ${t("tour.keyC")}  ${key("H")} ${t("tour.keyH")}`,
    row(t("tour.notes"), t("tour.notesText")),
    "",
    row(t("tour.data"), `${dataDir.replace(homedir(), "~")} ${gray(t("tour.dataText"))}`),
    row(t("tour.commands"), `oh-my-paper ${dim("start · onboard · doctor · update · help")}`),
  ].join("\n")
}

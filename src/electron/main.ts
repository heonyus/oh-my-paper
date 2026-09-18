import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import dotenv from "dotenv"
import "dotenv/config"
import { app, dialog } from "electron"
import { startDesktopApplication } from "./startDesktopApplication"

const { SCOURGIFY_USER_DATA_DIR: configuredUserData } = process.env
const userDataDir = configuredUserData ?? app.getPath("userData")
for (const candidate of [join(userDataDir, ".env"), join(homedir(), ".env")]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate })
}
void startDesktopApplication({ userDataRoot: configuredUserData ?? app.getPath("userData") }).catch(
  () => {
    dialog.showErrorBox(
      "oh-my-paper를 열지 못했습니다",
      "자료 폴더를 안전하게 열지 못했습니다. 기존 파일은 지우지 않았습니다. 디스크 공간과 폴더 접근 권한을 확인해 주세요.",
    )
    app.quit()
  },
)

import { readWebServerConfig } from "../server/config"
import { startApp } from "./startApp"

void startApp(readWebServerConfig(), !process.argv.includes("--no-open"))

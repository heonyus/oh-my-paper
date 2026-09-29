import { readWebServerConfig } from "../server/config"
import { runOnboarding } from "./onboarding"

void runOnboarding(readWebServerConfig())

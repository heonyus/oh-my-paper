import type { JSX } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"
import type { ProviderStatus } from "../../shared/ipc"
import type { AiMode } from "../../shared/providerModels"
import type { Workspace } from "../types"
import type { HostedCredentialSettingsProps } from "./HostedCredentialSettings"
import { SettingsModal } from "./SettingsModal"

export function AppSettingsDialog({
  open,
  status,
  ocrStatus,
  workspace,
  onWorkspaceChange,
  onProviderChange,
  onOcrStatusChange,
  onClose,
  appearanceOnly = false,
  hostedCredentials,
  locked = false,
}: {
  readonly open: boolean
  readonly status: ProviderStatus
  readonly ocrStatus: DocumentOcrProviderStatus
  readonly workspace: Workspace
  readonly onWorkspaceChange: (workspace: Workspace) => void
  readonly onProviderChange: (status: ProviderStatus) => void
  readonly onOcrStatusChange: (status: DocumentOcrProviderStatus) => void
  readonly onClose: () => void
  readonly appearanceOnly?: boolean | undefined
  readonly hostedCredentials?: HostedCredentialSettingsProps | undefined
  readonly locked?: boolean | undefined
}): JSX.Element | null {
  if (!open) return null
  return (
    <SettingsModal
      status={status}
      ocrStatus={ocrStatus}
      fontScale={workspace.uiFontScale}
      minimapVisible={workspace.minimapVisible}
      theme={workspace.theme}
      onThemeChange={(theme) => onWorkspaceChange({ ...workspace, theme })}
      onFontScaleChange={(uiFontScale) => onWorkspaceChange({ ...workspace, uiFontScale })}
      onMinimapVisibleChange={(minimapVisible) =>
        onWorkspaceChange({ ...workspace, minimapVisible })
      }
      appearanceOnly={appearanceOnly}
      locked={locked}
      openRouterRequired={!hostedCredentials}
      hostedCredentials={
        hostedCredentials
          ? {
              status: hostedCredentials.status,
              error: hostedCredentials.error,
              onSave: async (credential) => {
                await hostedCredentials.onSave(credential)
                onProviderChange(await window.scourgify.providerStatus())
                onOcrStatusChange(await window.scourgify.documentOcrStatus())
              },
            }
          : undefined
      }
      onClose={onClose}
      onSave={async (config) => {
        await window.scourgify.saveProviderConfig(config)
        onProviderChange(await window.scourgify.providerStatus())
      }}
      onModeSave={async (mode: AiMode) => {
        await window.scourgify.saveAiMode(mode)
        onProviderChange(await window.scourgify.providerStatus())
      }}
    />
  )
}

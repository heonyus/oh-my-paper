import { type JSX, lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  type AccountStatus,
  accountIdSchema,
  type CollectionSwitchChoice,
} from "../shared/accountSchemas"
import { AccountGate } from "./components/account/AccountGate"
import { savePendingNoteDrafts } from "./lib/noteDraftRecovery"

const App = lazy(() => import("./App").then((module) => ({ default: module.App })))

const fallbackLocalAccountId = accountIdSchema.parse("00000000-0000-0000-0000-000000000000")

export function AccountRoot(): JSX.Element {
  const api = window.ohmypaper.account
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [busy, setBusy] = useState<"idle" | "login" | "refresh">("idle")
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const opened = useRef(false)
  if (status?.state === "authenticated") opened.current = true

  useEffect(() => {
    if (!api) {
      setStatus({ state: "local", accountId: fallbackLocalAccountId })
      return
    }
    let active = true
    const receive = (next: AccountStatus): void => {
      if (active) setStatus(next)
    }
    const unsubscribe = api.onStatusChanged(receive)
    void api
      .status()
      .then(receive)
      .catch(() => {
        if (active) setStatus({ state: "local", accountId: fallbackLocalAccountId })
      })
    const refresh = (): void => {
      if (!opened.current) return
      void api
        .refresh("foreground")
        .then(receive)
        .catch(() => {
          void api
            .status()
            .then(receive)
            .catch(() => {
              if (active) setError("계정 상태를 확인하지 못했습니다. 다시 시도해 주세요.")
            })
        })
    }
    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)
    return () => {
      active = false
      unsubscribe()
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
    }
  }, [api])

  useEffect(
    () =>
      window.ohmypaper.onBeforeWorkspaceClose(async () => {
        await savePendingNoteDrafts()
      }),
    [],
  )

  async function action(
    operation: () => Promise<unknown>,
    kind: "login" | "refresh",
  ): Promise<void> {
    if (!api || busy !== "idle") return
    setBusy(kind)
    setError(null)
    try {
      await operation()
      setStatus(await api.status())
    } catch {
      setError("요청을 완료하지 못했습니다. 연결과 계정 설정을 확인한 뒤 다시 시도해 주세요.")
    } finally {
      setBusy("idle")
    }
  }
  async function logout(): Promise<void> {
    await savePendingNoteDrafts()
    await api?.logout()
  }
  async function switchCollection(choice: CollectionSwitchChoice): Promise<void> {
    await savePendingNoteDrafts()
    await api?.switchCollection(choice)
  }
  if (!status)
    return (
      <main className="loading-screen" role="status">
        oh-my-paper를 여는 중…
      </main>
    )
  const effectiveStatus: AccountStatus =
    status.state === "authenticated" || status.state === "local"
      ? status
      : { state: "local", accountId: fallbackLocalAccountId }
  return (
    <>
      <AccountGate
        status={effectiveStatus}
        entitlement={{ tier: "free" }}
        busy={busy}
        error={error}
        onLogin={() => void action(async () => api?.login(), "login")}
        onCancel={() =>
          void api?.cancelLogin().catch(() => setError("로그인 취소를 확인하지 못했습니다."))
        }
        onRefresh={() => void action(async () => api?.refresh("reconnect"), "refresh")}
        onOpenHelp={() => setHelp(true)}
        onOpenSettings={() => setHelp(true)}
        onSwitchCollection={(choice) => void action(() => switchCollection(choice), "refresh")}
      >
        <Suspense
          fallback={
            <main className="loading-screen" role="status">
              자료를 여는 중…
            </main>
          }
        >
          <App
            account={
              effectiveStatus.state === "local"
                ? { name: "이 Mac · 로컬" }
                : {
                    name:
                      effectiveStatus.state === "authenticated"
                        ? (effectiveStatus.account.displayName ?? "내 계정")
                        : "내 계정",
                    onSignOut: () => void action(logout, "refresh"),
                  }
            }
          />
        </Suspense>
      </AccountGate>
      {help ? <AccountHelp onClose={() => setHelp(false)} /> : null}
    </>
  )
}

function AccountHelp({ onClose }: { readonly onClose: () => void }): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="account-gate__panel"
      aria-labelledby="account-help-title"
      onCancel={onClose}
    >
      <h2 id="account-help-title">로그인과 AI 연결</h2>
      <p>
        Google 로그인은 oh-my-paper 계정을 확인합니다. 논문과 노트는 이 Mac에 남고, AI 연결은 로그인
        후 설정에서 따로 선택합니다.
      </p>
      <p>
        계정 서비스 미설정 안내가 보이면 배포자의 계정 서버 연결이 필요합니다. 다시 설치하거나 AI
        API 키를 입력해도 해결되지 않습니다.
      </p>
      <p>
        키체인 안내가 보이면 macOS 키체인 접근을 확인해 주세요. 저장된 자료는 삭제하지 않습니다.
      </p>
      <div className="account-gate__actions">
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </dialog>
  )
}

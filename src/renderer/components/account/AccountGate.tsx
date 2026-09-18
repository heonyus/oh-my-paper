import { type JSX, type ReactNode, useRef } from "react"
import type {
  AccountEntitlement,
  AccountStatus,
  CollectionSwitchChoice,
} from "../../../shared/accountSchemas"
import "./account-gate.css"

export type AccountGateProps = {
  readonly status: AccountStatus
  readonly entitlement: AccountEntitlement
  readonly busy: "idle" | "login" | "refresh"
  readonly error: string | null
  readonly onLogin: () => void
  readonly onCancel: () => void
  readonly onRefresh: () => void
  readonly onOpenHelp: () => void
  readonly onOpenSettings: () => void
  readonly onSwitchCollection: (choice: CollectionSwitchChoice) => void
  readonly children?: ReactNode
}

export function AccountGate(props: AccountGateProps): JSX.Element {
  const unlocked = useRef(false)
  const accessible = props.status.state === "authenticated" || props.status.state === "local"
  if (accessible) unlocked.current = true
  return (
    <>
      <div className="account-gate__content" inert={!accessible} aria-hidden={!accessible}>
        {unlocked.current ? props.children : null}
      </div>
      {accessible ? null : <AccountGatePrompt {...props} />}
    </>
  )
}

function AccountGatePrompt(props: AccountGateProps): JSX.Element {
  switch (props.status.state) {
    case "local":
    case "authenticated":
      return <>{props.children}</>
    case "credentials_needed":
      return (
        <AccountGateShell title="계정 보안 설정이 필요합니다" error={props.error}>
          <p>
            {props.status.reason === "service_not_configured"
              ? "계정 서비스가 아직 이 빌드에 연결되지 않았습니다."
              : "macOS 키체인으로 계정 자격 증명을 보호할 수 없어 잠금 상태를 유지합니다."}
          </p>
          <p className="account-gate__detail">
            평문 자격 증명이나 임시 인증 우회는 만들지 않습니다.
          </p>
          <div className="account-gate__actions">
            <button type="button" onClick={props.onOpenSettings}>
              설정 열기
            </button>
            <button type="button" className="account-gate__secondary" onClick={props.onOpenHelp}>
              도움말
            </button>
          </div>
        </AccountGateShell>
      )
    case "signed_out":
      return (
        <AccountGateShell title="oh-my-paper에 로그인" error={props.error}>
          <p>Google 계정은 앱 접근 확인에만 사용되며 문서나 AI 제공자 계정과 연결되지 않습니다.</p>
          <AccountBoundaryNote entitlement={props.entitlement} />
          <div className="account-gate__actions">
            <button type="button" disabled={props.busy !== "idle"} onClick={props.onLogin}>
              {props.busy === "login" ? "브라우저에서 확인 중…" : "Google로 계속"}
            </button>
            {props.busy === "login" ? (
              <button type="button" className="account-gate__secondary" onClick={props.onCancel}>
                취소
              </button>
            ) : null}
          </div>
        </AccountGateShell>
      )
    case "locked":
      return (
        <AccountGateShell title="계정 확인이 필요합니다" error={props.error}>
          <p>{lockedMessage(props.status.reason)}</p>
          <p className="account-gate__detail">
            이미 열려 있던 저장되지 않은 내용은 같은 계정의 복구 저장만 허용됩니다.
          </p>
          <div className="account-gate__actions">
            <button type="button" disabled={props.busy !== "idle"} onClick={props.onLogin}>
              다시 로그인
            </button>
          </div>
        </AccountGateShell>
      )
    case "switch_required":
      return (
        <AccountGateShell title="계정별 컬렉션을 선택하세요" error={props.error}>
          <p>
            다른 계정으로 로그인했습니다. 이전 계정의 컬렉션은 자동으로 노출하거나 새 계정에
            재할당하지 않습니다.
          </p>
          <div className="account-gate__actions account-gate__actions--stacked">
            <button
              type="button"
              onClick={() => props.onSwitchCollection("open_existing_for_account")}
            >
              이 계정의 기존 컬렉션 열기
            </button>
            <button
              type="button"
              className="account-gate__secondary"
              onClick={() => props.onSwitchCollection("create_separate_collection")}
            >
              이 계정용 새 컬렉션 만들기
            </button>
            <button
              type="button"
              className="account-gate__secondary"
              onClick={() => props.onSwitchCollection("cancel")}
            >
              계정 전환 취소
            </button>
          </div>
        </AccountGateShell>
      )
    default:
      return assertNever(props.status)
  }
}

function AccountGateShell({
  title,
  error,
  children,
}: {
  readonly title: string
  readonly error: string | null
  readonly children: ReactNode
}): JSX.Element {
  return (
    <main className="account-gate">
      <section className="account-gate__panel" aria-labelledby="account-gate-title">
        <p className="account-gate__eyebrow">앱 계정</p>
        <h1 id="account-gate-title">{title}</h1>
        {children}
        {error ? (
          <p className="account-gate__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  )
}

function AccountBoundaryNote({ entitlement }: { readonly entitlement: AccountEntitlement }) {
  return (
    <p className="account-gate__boundary">
      앱 이용 등급: {entitlement.tier === "free" ? "무료" : null} · AI 연결은 별도 설정
    </p>
  )
}

function lockedMessage(reason: Extract<AccountStatus, { state: "locked" }>["reason"]): string {
  switch (reason) {
    case "expired":
      return "오프라인 이용 기간이 끝났습니다. 온라인에서 계정을 다시 확인하세요."
    case "clock_rollback":
      return "기기 시간이 이전 확인 시점보다 크게 뒤로 이동해 온라인 확인이 필요합니다."
    case "revoked":
      return "이 세션은 로그아웃되었거나 철회되었습니다. 다시 로그인하세요."
    default:
      return assertNever(reason)
  }
}

function assertNever(value: never): never {
  return value
}

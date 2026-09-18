import { type ReactElement, useState } from "react"
import type { BackupApi } from "../../../shared/backupIpc"

type BackupPanelProps = {
  readonly api: BackupApi
}

type BackupPanelState =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly action: "backup" | "restore" }
  | { readonly kind: "done"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }

export function BackupPanel({ api }: BackupPanelProps): ReactElement {
  const [state, setState] = useState<BackupPanelState>({ kind: "idle" })

  async function run(action: "backup" | "restore"): Promise<void> {
    setState({ kind: "working", action })
    try {
      const result = action === "backup" ? await api.create() : await api.restore()
      setState(
        result
          ? {
              kind: "done",
              message:
                action === "backup"
                  ? `${result.entryCount}개 파일의 백업을 만들었습니다.`
                  : `${result.entryCount}개 파일을 새 컬렉션으로 복원했습니다.`,
            }
          : { kind: "idle" },
      )
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "백업 작업에 실패했습니다.",
      })
    }
  }

  return (
    <section aria-labelledby="backup-panel-title">
      <h2 id="backup-panel-title">컬렉션 백업</h2>
      <p>폴더 선택 대화상자에서 위치를 선택하세요. 복원은 항상 새 컬렉션을 만듭니다.</p>
      <div>
        <button
          type="button"
          disabled={state.kind === "working"}
          onClick={() => void run("backup")}
        >
          {state.kind === "working" && state.action === "backup" ? "백업 생성 중…" : "백업 만들기"}
        </button>
        <button
          type="button"
          disabled={state.kind === "working"}
          onClick={() => void run("restore")}
        >
          {state.kind === "working" && state.action === "restore" ? "복원 중…" : "백업 복원"}
        </button>
      </div>
      {state.kind === "done" || state.kind === "error" ? (
        <p role="status">{state.message}</p>
      ) : null}
    </section>
  )
}

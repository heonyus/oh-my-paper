import { type JSX, lazy, Suspense } from "react"
import { authClient } from "./authClient"
import { SignIn } from "./SignIn"

const AuthenticatedWorkspace = lazy(() =>
  import("./AuthenticatedWorkspace").then((module) => ({
    default: module.AuthenticatedWorkspace,
  })),
)

export function App(): JSX.Element {
  const session = authClient.useSession()
  if (session.isPending) return <SignIn checking />
  if (!session.data) return <SignIn />
  return (
    <Suspense fallback={<main className="loading-screen">oh-my-paper를 여는 중…</main>}>
      <AuthenticatedWorkspace user={session.data.user} />
    </Suspense>
  )
}

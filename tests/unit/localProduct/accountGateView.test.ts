import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import {
  AccountGate,
  type AccountGateProps,
} from "../../../src/renderer/components/account/AccountGate"
import { accountStatusSchema } from "../../../src/shared/accountSchemas"

const handlers = {
  entitlement: { tier: "free" },
  busy: "idle",
  error: null,
  onLogin: vi.fn(),
  onCancel: vi.fn(),
  onRefresh: vi.fn(),
  onOpenHelp: vi.fn(),
  onOpenSettings: vi.fn(),
  onSwitchCollection: vi.fn(),
} satisfies Omit<AccountGateProps, "status" | "children">

function Draft(): React.JSX.Element {
  const [value, setValue] = useState("")
  return createElement(
    "label",
    null,
    "Draft",
    createElement("input", {
      value,
      onChange: (event) => setValue(event.currentTarget.value),
    }),
  )
}

function gated(status: AccountGateProps["status"]): React.JSX.Element {
  return createElement(AccountGate, { ...handlers, status }, createElement(Draft))
}

describe("account gate view", () => {
  it("allows explicit local access without claiming Google authentication", () => {
    const view = render(
      gated(
        accountStatusSchema.parse({
          state: "local",
          accountId: "7efde20f-22e4-4ac8-93e0-b441421589c1",
        }),
      ),
    )
    expect(screen.getByLabelText("Draft")).toBeInTheDocument()
    expect(view.container.querySelector(".account-gate__content")).not.toHaveAttribute("inert")
    expect(screen.queryByRole("heading", { name: "oh-my-paper에 로그인" })).not.toBeInTheDocument()
  })
  it("keeps an unlocked draft mounted and makes it inert after lease expiry", async () => {
    const authenticated = accountStatusSchema.parse({
      state: "authenticated",
      account: { id: "7efde20f-22e4-4ac8-93e0-b441421589c1", displayName: null },
      connection: "offline",
      offlineLeaseExpiresAt: 1_800_604_800,
    })
    const locked = accountStatusSchema.parse({
      state: "locked",
      reason: "expired",
      dirtySaveAccountId: "7efde20f-22e4-4ac8-93e0-b441421589c1",
    })
    const view = render(gated(authenticated))
    await userEvent.type(screen.getByRole("textbox", { name: "Draft" }), "unsaved")

    view.rerender(gated(locked))

    expect(screen.getByDisplayValue("unsaved")).toBeInTheDocument()
    expect(view.container.querySelector(".account-gate__content")).toHaveAttribute("inert")
    expect(screen.getByRole("heading", { name: "계정 확인이 필요합니다" })).toBeInTheDocument()
  })

  it("does not mount protected children before the first authenticated state", () => {
    render(gated(accountStatusSchema.parse({ state: "signed_out" })))

    expect(screen.queryByLabelText("Draft")).not.toBeInTheDocument()
  })
})

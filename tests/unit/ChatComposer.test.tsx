import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type FormEvent, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChatComposer } from "../../src/renderer/components/ChatComposer"

describe("ChatComposer", () => {
  it("submits with Enter without exposing prompt copy", async () => {
    const submitted = vi.fn()
    function Harness() {
      const [value, setValue] = useState("")
      function submit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault()
        submitted(value)
      }
      return (
        <ChatComposer
          label="테스트 메시지"
          submitLabel="메시지 보내기"
          value={value}
          sending={false}
          onChange={setValue}
          onSubmit={submit}
        />
      )
    }
    render(<Harness />)

    const composer = screen.getByRole("textbox", { name: "테스트 메시지" })
    expect(composer).not.toHaveAttribute("placeholder")
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true })
    fireEvent.keyDown(composer, { key: "Enter", isComposing: true })
    expect(submitted).not.toHaveBeenCalled()
    await userEvent.type(composer, "근거를 알려줘{enter}")

    expect(submitted).toHaveBeenCalledWith("근거를 알려줘")
  })
})

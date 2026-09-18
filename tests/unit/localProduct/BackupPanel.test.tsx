import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BackupPanel } from "../../../src/renderer/components/backup/BackupPanel"
import type { BackupApi } from "../../../src/shared/backupIpc"

describe("BackupPanel", () => {
  it("offers native chooser actions without path fields", () => {
    const api: BackupApi = {
      create: vi.fn(async () => null),
      restore: vi.fn(async () => null),
    }

    render(<BackupPanel api={api} />)

    expect(screen.getByRole("button", { name: "백업 만들기" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "백업 복원" })).toBeTruthy()
    expect(screen.queryAllByRole("textbox")).toHaveLength(0)
  })
})

import type { JSX } from "react"
import type { ReaderNote } from "../../../shared/readerNote"
import type { DocumentId } from "../../../shared/schemas"
import type { NoteCardState } from "../../lib/useNoteCard"
import type { RegisterLiveNote } from "../../lib/useReaderNote"
import { LooseNoteSheet } from "./LooseNoteSheet"
import { NoteCardLayer } from "./NoteCardLayer"

/** What a shell shows for note cards: the card itself and, when opened, the loose note. */
export function NoteCardOverlays({
  state,
  looseNote,
  looseOpen,
  onLooseOpenChange,
  onLooseChange,
  registerLiveNote,
  onOpenPaperNote,
}: {
  readonly state: NoteCardState
  readonly looseNote: ReaderNote | undefined
  readonly looseOpen: boolean
  readonly onLooseOpenChange: (open: boolean) => void
  readonly onLooseChange: (markdown: string) => void
  readonly registerLiveNote: RegisterLiveNote
  readonly onOpenPaperNote: (documentId: DocumentId) => void
}): JSX.Element {
  return (
    <>
      {looseOpen ? (
        <LooseNoteSheet
          note={looseNote}
          onChange={onLooseChange}
          onClose={() => onLooseOpenChange(false)}
          registerLiveNote={registerLiveNote}
        />
      ) : null}
      <NoteCardLayer
        state={state}
        onOpenNote={(target) =>
          target.kind === "paper" ? onOpenPaperNote(target.documentId) : onLooseOpenChange(true)
        }
      />
    </>
  )
}

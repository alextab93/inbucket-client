import type {
  MessageSummary,
  SelectedMessage,
  StatusValue,
  Tag,
} from '../types'
import { MessageWorkspace } from './MessageWorkspace'

interface StarredViewProps {
  active: boolean
  messages: MessageSummary[]
  selected: SelectedMessage | null
  loading: boolean
  status: StatusValue
  onSelectMessage: (mailbox: string, id: string) => void
  onCloseMessage: () => void
  onUnauthorized: () => void
  onRead: (mailbox: string, id: string) => void
  starPending: (mailbox: string, id: string) => boolean
  onStarChange: (mailbox: string, id: string, starred: boolean) => Promise<void>
  onDeleted: () => Promise<void>
  onTrashed: () => Promise<void>
  tags: Tag[]
  tagPending: boolean
  onTagChange: (
    mailbox: string,
    id: string,
    tag: Tag,
    assigned: boolean,
  ) => Promise<Tag[]>
  onCreateTag: (name: string, color: string) => Promise<Tag>
  onUpdateTag: (tag: Tag, name: string, color: string) => Promise<Tag>
  onDeleteTag: (tag: Tag) => Promise<void>
}

export const StarredView = ({
  active,
  messages,
  selected,
  loading,
  status,
  onSelectMessage,
  onCloseMessage,
  onUnauthorized,
  onRead,
  starPending,
  onStarChange,
  onDeleted,
  onTrashed,
  tags,
  tagPending,
  onTagChange,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: StarredViewProps) => {
  const mailboxes = [...new Set(messages.map((message) => message.mailbox))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))

  return (
    <div className="starred-view" hidden={!active}>
      <MessageWorkspace
        messages={messages}
        selected={selected}
        loading={loading}
        listEmptyMessage="No starred messages yet."
        inspectorEmptyMessage="Select a starred message to read it."
        controlsId="starred-message"
        headingId="starred-messages-title"
        heading="Starred messages"
        status={status}
        totalCount={messages.length}
        mailboxOptions={mailboxes}
        tags={tags}
        onSelectMessage={onSelectMessage}
        onCloseMessage={onCloseMessage}
        onUnauthorized={onUnauthorized}
        onRead={onRead}
        starPending={starPending}
        onStarChange={onStarChange}
        onDeleted={onDeleted}
        onTrashed={onTrashed}
        tagPending={tagPending}
        onTagChange={onTagChange}
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onDeleteTag={onDeleteTag}
      />
    </div>
  )
}

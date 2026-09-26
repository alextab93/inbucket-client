import type { RefObject } from 'react'
import type { RulePreview } from './ruleForm'

const formatTime = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

interface MatchPreviewModalProps {
  preview: RulePreview
  closeRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
}

export const MatchPreviewModal = ({
  preview,
  closeRef,
  onClose,
}: MatchPreviewModalProps) => (
  <div
    className="rule-preview-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}
  >
    <section
      className="rule-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rule-preview-title"
    >
      <div className="rule-preview-heading">
        <div>
          <h3 id="rule-preview-title">Matching messages</h3>
          <span>
            Inspected {preview.inspected} recent messages
            {preview.incomplete
              ? ' · some attachment data was unavailable'
              : ''}
          </span>
        </div>
        <button
          ref={closeRef}
          className="rule-preview-close"
          type="button"
          aria-label="Close matching messages"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {preview.matches.length ? (
        <div className="rule-preview-list">
          {preview.matches.map((match) => (
            <article key={`${match.mailbox}-${match.message_id}`}>
              <div className="rule-preview-title">
                <strong>{match.subject || '(No subject)'}</strong>
                <span>{match.mailbox}</span>
              </div>
              <div className="rule-preview-meta">
                <span>{match.sender || 'Unknown sender'}</span>
                <span>{match.recipients?.join(', ') || 'No recipient'}</span>
                <span>
                  {match.received_at
                    ? formatTime(match.received_at)
                    : 'Unknown date'}
                </span>
                <span>
                  {match.size
                    ? `${match.size.toLocaleString()} bytes`
                    : 'Size unavailable'}
                </span>
              </div>
              <code>{match.message_id}</code>
            </article>
          ))}
        </div>
      ) : (
        <p>No recent messages match.</p>
      )}
    </section>
  </div>
)

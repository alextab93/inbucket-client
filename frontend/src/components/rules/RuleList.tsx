import type { MessageRule } from '../../types'

interface RuleListProps {
  rules: MessageRule[]
  onEdit: (rule: MessageRule) => void
  onDuplicate: (id: number) => void
  onDelete: (id: number) => void
}

export const RuleList = ({
  rules,
  onEdit,
  onDuplicate,
  onDelete,
}: RuleListProps) => (
  <div className="rule-list">
    {rules.length ? (
      rules.map((rule) => (
        <article key={rule.id} className="rule-card">
          <div>
            <h4>{rule.name}</h4>
            <p>{rule.summary}</p>
            <span>
              {rule.enabled ? 'Enabled' : 'Disabled'} · priority {rule.priority}{' '}
              · cooldown {rule.cooldown_seconds}s
            </span>
            {rule.last_error_code ? <span>Rule needs attention.</span> : null}
          </div>
          <div className="rule-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => onEdit(rule)}
            >
              Edit
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => onDuplicate(rule.id)}
            >
              Duplicate
            </button>
            <button
              className="button button-danger"
              type="button"
              onClick={() => onDelete(rule.id)}
            >
              Delete
            </button>
          </div>
        </article>
      ))
    ) : (
      <p className="notification-empty">
        No rules yet. Create one to automate matching messages.
      </p>
    )}
  </div>
)

import type {
  NotificationDestination,
  Tag,
} from '../../types'
import { DestinationList } from './DestinationList'
import type { EditableRule } from './ruleForm'

interface RuleActionsStepProps {
  rule: EditableRule
  destinations: NotificationDestination[]
  tags: Tag[]
  sendsNotification: boolean
  hasAnyAction: boolean
  onChange: (change: Partial<EditableRule>) => void
  onToggleNotification: (enabled: boolean) => void
  onCreateDestination: () => void
  onEditDestination: (destination: NotificationDestination) => void
  onDeleteDestination: (destination: NotificationDestination) => void
}

export const RuleActionsStep = ({
  rule,
  destinations,
  tags,
  sendsNotification,
  hasAnyAction,
  onChange,
  onToggleNotification,
  onCreateDestination,
  onEditDestination,
  onDeleteDestination,
}: RuleActionsStepProps) => {
  const updateActions = (change: Partial<EditableRule['actions']>) =>
    onChange({ actions: { ...rule.actions, ...change } })

  return (
    <fieldset className="rule-step">
      <legend>Actions</legend>
      <p>Choose every action that should run when a message matches.</p>
      <div className="rule-action-list">
        <section className="rule-action-card">
          <label className="notification-checkbox rule-action-toggle">
            <input
              type="checkbox"
              checked={sendsNotification}
              onChange={(event) => onToggleNotification(event.target.checked)}
            />
            <span>
              <strong>Send a notification</strong>
              <small>
                Show an alert in Inbucket, the browser, or any reusable delivery
                destination.
              </small>
            </span>
          </label>
          {sendsNotification ? (
            <div className="rule-action-options">
              <label className="notification-checkbox">
                <input
                  type="checkbox"
                  checked={rule.actions.in_app}
                  onChange={(event) =>
                    updateActions({ in_app: event.target.checked })
                  }
                />{' '}
                In-app notification center
              </label>
              <label className="notification-checkbox">
                <input
                  type="checkbox"
                  checked={rule.actions.browser}
                  onChange={(event) =>
                    updateActions({ browser: event.target.checked })
                  }
                />{' '}
                Browser notification
              </label>
              <section
                className="rule-action-destinations"
                aria-labelledby="rule-delivery-destinations-title"
              >
                <div className="rule-action-destinations-heading">
                  <div>
                    <h4 id="rule-delivery-destinations-title">
                      Delivery destinations
                    </h4>
                    <p>
                      Select each destination for this rule. Edit a destination
                      to review it, send a test, or change its methods.
                    </p>
                  </div>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={onCreateDestination}
                  >
                    New destination
                  </button>
                </div>
                <DestinationList
                  destinations={destinations}
                  selectedDestinationIds={rule.actions.destination_ids}
                  onSelect={(destinationId, selected) =>
                    updateActions({
                      destination_ids: selected
                        ? [...rule.actions.destination_ids, destinationId]
                        : rule.actions.destination_ids.filter(
                            (id) => id !== destinationId,
                          ),
                    })
                  }
                  onEdit={onEditDestination}
                  onDelete={onDeleteDestination}
                />
              </section>
            </div>
          ) : null}
        </section>
        <section className="rule-action-card">
          <label className="notification-checkbox rule-action-toggle">
            <input
              type="checkbox"
              disabled={!tags.length}
              checked={rule.actions.tag_ids.length > 0}
              onChange={(event) =>
                updateActions({
                  tag_ids: event.target.checked && tags[0] ? [tags[0].id] : [],
                })
              }
            />
            <span>
              <strong>Apply tags</strong>
              <small>Add one or more existing tags to the matching message.</small>
            </span>
          </label>
          {rule.actions.tag_ids.length > 0 ? (
            <div className="rule-action-options">
              <label>
                Tags
                <select
                  multiple
                  value={rule.actions.tag_ids.map(String)}
                  onChange={(event) =>
                    updateActions({
                      tag_ids: [...event.target.selectedOptions].map((option) =>
                        Number(option.value),
                      ),
                    })
                  }
                >
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : tags.length ? null : (
            <p className="rule-action-note">
              Create a tag before adding this action.
            </p>
          )}
        </section>
        <section className="rule-action-card">
          <label className="notification-checkbox rule-action-toggle">
            <input
              type="checkbox"
              checked={rule.actions.star}
              onChange={(event) => updateActions({ star: event.target.checked })}
            />
            <span>
              <strong>Star the message</strong>
              <small>Add the message to your Starred view.</small>
            </span>
          </label>
        </section>
        <section className="rule-action-card">
          <label className="notification-checkbox rule-action-toggle">
            <input
              type="checkbox"
              checked={rule.actions.mark_read}
              onChange={(event) =>
                updateActions({ mark_read: event.target.checked })
              }
            />
            <span>
              <strong>Mark as read</strong>
              <small>Mark the matching message as seen in Inbucket.</small>
            </span>
          </label>
        </section>
        <section className="rule-action-card">
          <label className="notification-checkbox rule-action-toggle">
            <input
              type="checkbox"
              checked={rule.actions.move_to_trash}
              onChange={(event) =>
                updateActions({ move_to_trash: event.target.checked })
              }
            />
            <span>
              <strong>Move to Trash</strong>
              <small>
                Hide the message from Mailboxes and Starred without deleting it
                from Inbucket.
              </small>
            </span>
          </label>
        </section>
      </div>
      {!hasAnyAction ? (
        <p className="rule-action-note">
          Choose at least one action before saving this rule.
        </p>
      ) : null}
    </fieldset>
  )
}

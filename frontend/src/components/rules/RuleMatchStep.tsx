import type { RuleConditions, Tag } from '../../types'
import { TokenInput } from '../TokenInput'
import { inputValue, type EditableRule } from './ruleForm'

const browserTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'your browser timezone'

const localTime = (time: string, days: number[]) => {
  if (!/^\d{2}:\d{2}$/.test(time)) return null

  const [hour, minute] = time.split(':').map(Number)
  const now = new Date()
  const utcDay = days[0] ?? now.getUTCDay()
  const daysFromToday = (utcDay - now.getUTCDay() + 7) % 7
  const utcDate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysFromToday,
      hour,
      minute,
    ),
  )

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(utcDate)
}

interface RuleMatchStepProps {
  rule: EditableRule
  mailboxes: string[]
  tags: Tag[]
  displayedTimeWindows: RuleConditions['time_windows']
  updateConditions: (change: Partial<RuleConditions>) => void
  updateTimeWindow: (
    index: number,
    change: Partial<RuleConditions['time_windows'][number]>,
  ) => void
  addTimeWindow: () => void
  removeTimeWindow: (index: number) => void
}

export const RuleMatchStep = ({
  rule,
  mailboxes,
  tags,
  displayedTimeWindows,
  updateConditions,
  updateTimeWindow,
  addTimeWindow,
  removeTimeWindow,
}: RuleMatchStepProps) => (
  <fieldset className="rule-step">
    <legend>Match conditions</legend>
    <p>
      Open only the groups you need. Leave every group empty to match every new
      message.
    </p>
    <div className="rule-condition-accordions">
      <details>
        <summary>
          <span>
            <strong>Mailboxes</strong>
            <small>
              {rule.conditions.mailboxes.length
                ? `${rule.conditions.mailboxes.length} selected`
                : 'All mailboxes'}
            </small>
          </span>
        </summary>
        <div className="rule-condition-body">
          <p>Select none for all mailboxes.</p>
          <div className="notification-mailbox-list">
            {mailboxes.map((mailbox) => (
              <label key={mailbox} className="notification-checkbox">
                <input
                  type="checkbox"
                  checked={rule.conditions.mailboxes.includes(mailbox)}
                  onChange={(event) =>
                    updateConditions({
                      mailboxes: event.target.checked
                        ? [...rule.conditions.mailboxes, mailbox]
                        : rule.conditions.mailboxes.filter(
                            (candidate) => candidate !== mailbox,
                          ),
                    })
                  }
                />
                {mailbox}
              </label>
            ))}
          </div>
        </div>
      </details>
      <details>
        <summary>
          <span>
            <strong>Addresses</strong>
            <small>
              {rule.conditions.senders.length ||
              rule.conditions.recipients.length
                ? `${rule.conditions.senders.length} senders · ${rule.conditions.recipients.length} recipients`
                : 'Any sender or recipient'}
            </small>
          </span>
        </summary>
        <div className="rule-condition-body">
          <TokenInput
            label="Senders"
            values={rule.conditions.senders}
            onChange={(senders) => updateConditions({ senders })}
            placeholder="Type a sender, then press Enter or comma"
          />
          <TokenInput
            label="Recipients"
            values={rule.conditions.recipients}
            onChange={(recipients) => updateConditions({ recipients })}
            placeholder="Type a recipient, then press Enter or comma"
          />
        </div>
      </details>
      <details>
        <summary>
          <span>
            <strong>Message details</strong>
            <small>Subject, attachments, size, and tags</small>
          </span>
        </summary>
        <div className="rule-condition-body">
          <div className="notification-form-row">
            <label>
              Subject contains
              <input
                value={rule.conditions.subject || ''}
                maxLength={160}
                onChange={(event) =>
                  updateConditions({
                    subject: event.target.value || undefined,
                  })
                }
              />
            </label>
            <label>
              Attachments
              <select
                value={
                  rule.conditions.has_attachments === undefined
                    ? 'either'
                    : String(rule.conditions.has_attachments)
                }
                onChange={(event) =>
                  updateConditions({
                    has_attachments:
                      event.target.value === 'either'
                        ? undefined
                        : event.target.value === 'true',
                  })
                }
              >
                <option value="either">Either</option>
                <option value="true">Has attachments</option>
                <option value="false">No attachments</option>
              </select>
            </label>
          </div>
          <div className="notification-form-row">
            <label>
              Minimum bytes
              <input
                type="number"
                min="0"
                value={inputValue(rule.conditions.minimum_size)}
                onChange={(event) =>
                  updateConditions({
                    minimum_size: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            <label>
              Maximum bytes
              <input
                type="number"
                min="0"
                value={inputValue(rule.conditions.maximum_size)}
                onChange={(event) =>
                  updateConditions({
                    maximum_size: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
              />
            </label>
          </div>
          <label>
            Tags
            <select
              multiple
              value={rule.conditions.tag_ids.map(String)}
              onChange={(event) =>
                updateConditions({
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
      </details>
      <details>
        <summary>
          <span>
            <strong>Schedule</strong>
            <small>
              {rule.conditions.time_windows.length
                ? `${rule.conditions.time_windows.length} UTC ${rule.conditions.time_windows.length === 1 ? 'window' : 'windows'}`
                : 'Any time'}
            </small>
          </span>
        </summary>
        <div className="rule-condition-body">
          <div className="notification-time-window">
            {displayedTimeWindows.map((window, index) => (
              <div key={index} className="notification-time-window-row">
                <fieldset>
                  <legend>Days</legend>
                  <div className="notification-day-list">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                      (day, dayIndex) => (
                        <label key={day} className="notification-checkbox">
                          <input
                            type="checkbox"
                            checked={window.days.includes(dayIndex)}
                            onChange={(event) =>
                              updateTimeWindow(index, {
                                days: event.target.checked
                                  ? [...window.days, dayIndex].sort()
                                  : window.days.filter(
                                      (value) => value !== dayIndex,
                                    ),
                              })
                            }
                          />
                          {day}
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>
                <div className="notification-form-row">
                  <label>
                    Start
                    <input
                      type="time"
                      value={window.start}
                      onChange={(event) =>
                        updateTimeWindow(index, { start: event.target.value })
                      }
                    />
                    {localTime(window.start, window.days) ? (
                      <small className="notification-local-time">
                        Local: {localTime(window.start, window.days)}
                      </small>
                    ) : null}
                  </label>
                  <label>
                    Finish
                    <input
                      type="time"
                      value={window.finish}
                      onChange={(event) =>
                        updateTimeWindow(index, { finish: event.target.value })
                      }
                    />
                    {localTime(window.finish, window.days) ? (
                      <small className="notification-local-time">
                        Local: {localTime(window.finish, window.days)}
                      </small>
                    ) : null}
                  </label>
                </div>
                <div className="notification-time-window-actions">
                  {rule.conditions.time_windows.length ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => removeTimeWindow(index)}
                    >
                      Remove time window
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="notification-time-window-footer">
              <button
                className="button button-secondary notification-time-window-add"
                type="button"
                disabled={rule.conditions.time_windows.length >= 8}
                onClick={addTimeWindow}
              >
                Add time window
              </button>
              <p className="notification-schedule-help">
                Times use UTC. Select the days on which each window starts. A
                finish earlier than its start continues into the next day. Leave
                Schedule empty to match at any time. Browser timezone: {browserTimeZone}. Local equivalents use this week&apos;s offset.
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  </fieldset>
)

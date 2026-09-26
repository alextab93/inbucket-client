import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { NotificationDestinationMethod } from '../../types'
import { InfoTooltip } from '../InfoTooltip'
import { destinationMethodName } from './destinationPresentation'

interface DestinationEditorProps {
  editingId: number | null
  name: string
  kind: NotificationDestinationMethod['kind']
  host: string
  topic: string
  token: string
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body: string
  headers: string
  recipients: string
  methods: NotificationDestinationMethod[]
  saving: boolean
  closeRef: RefObject<HTMLButtonElement | null>
  testingMethod: NotificationDestinationMethod['kind'] | ''
  setName: (value: string) => void
  selectKind: (kind: NotificationDestinationMethod['kind']) => void
  setHost: (value: string) => void
  setTopic: (value: string) => void
  setToken: (value: string) => void
  setUrl: (value: string) => void
  setMethod: (value: 'POST' | 'PUT' | 'PATCH' | 'DELETE') => void
  setBody: (value: string) => void
  setHeaders: (value: string) => void
  setRecipients: (value: string) => void
  setMethods: Dispatch<SetStateAction<NotificationDestinationMethod[]>>
  onAddMethod: () => void
  onTest: (method: NotificationDestinationMethod) => void
  onCancel: () => void
  onSave: () => void
}

export const DestinationEditor = ({
  editingId,
  name,
  kind,
  host,
  topic,
  token,
  url,
  method,
  body,
  headers,
  recipients,
  methods,
  saving,
  closeRef,
  testingMethod,
  setName,
  selectKind,
  setHost,
  setTopic,
  setToken,
  setUrl,
  setMethod,
  setBody,
  setHeaders,
  setRecipients,
  setMethods,
  onAddMethod,
  onTest,
  onCancel,
  onSave,
}: DestinationEditorProps) => (
  <div
    className="notification-destination-editor-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel()
    }}
  >
    <section
      className="notification-destination-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-destination-editor-title"
    >
      <form
        className="notification-destination-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        <div className="notification-destination-editor-heading">
          <h3 id="notification-destination-editor-title">
            {editingId ? 'Edit destination' : 'New destination'}
          </h3>
          <button
            ref={closeRef}
            className="notification-destination-editor-close"
            type="button"
            aria-label="Close destination editor"
            onClick={onCancel}
          >
            ×
          </button>
        </div>
        <label>
          Destination name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Delivery method
          <select
            value={kind}
            onChange={(event) =>
              selectKind(
                event.target.value as NotificationDestinationMethod['kind'],
              )
            }
          >
            <option value="ntfy">ntfy</option>
            <option value="webhook">Webhook</option>
            <option value="email">Email</option>
          </select>
        </label>
        {kind === 'ntfy' ? (
          <>
            <div className="notification-form-row">
              <label>
                ntfy host
                <input
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                />
              </label>
              <label>
                Topic
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                />
              </label>
            </div>
            <label>
              <span className="rule-label-heading">
                ntfy access token
                {editingId ? (
                  <InfoTooltip label="ntfy access token">
                    Saved access tokens are never shown.
                  </InfoTooltip>
                ) : null}
              </span>
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={
                  editingId
                    ? 'Enter a replacement token, or leave blank to keep the saved token'
                    : 'Optional, required by protected topics'
                }
              />
            </label>
          </>
        ) : null}
        {kind === 'webhook' ? (
          <>
            <label>
              Webhook URL
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <div className="notification-form-row">
              <label>
                HTTP method
                <select
                  value={method}
                  onChange={(event) =>
                    setMethod(
                      event.target.value as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
                    )
                  }
                >
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
              </label>
              <label>
                Request body
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Optional JSON body"
                />
              </label>
            </div>
            <label>
              Headers as JSON
              <textarea
                value={headers}
                onChange={(event) => setHeaders(event.target.value)}
                placeholder='[{"name":"Authorization","value":"Bearer ..."}]'
              />
            </label>
          </>
        ) : null}
        {kind === 'email' ? (
          <label>
            Recipients, comma-separated
            <input
              type="email"
              multiple
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
            />
          </label>
        ) : null}
        <button
          className="button button-secondary"
          type="button"
          onClick={onAddMethod}
        >
          Add or replace method
        </button>
        {methods.length ? (
          <ul
            className="notification-method-list"
            aria-label="Configured delivery methods"
          >
            {methods.map((configuredMethod) => (
              <li key={configuredMethod.kind}>
                <strong>{destinationMethodName(configuredMethod.kind)}</strong>
                {editingId ? (
                  <button
                    type="button"
                    aria-label={`Send ${destinationMethodName(configuredMethod.kind)} test`}
                    disabled={saving || Boolean(testingMethod)}
                    onClick={() => onTest(configuredMethod)}
                  >
                    {testingMethod === configuredMethod.kind
                      ? 'Sending test'
                      : 'Send test'}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove ${configuredMethod.kind} method`}
                  onClick={() =>
                    setMethods((current) =>
                      current.filter(
                        (candidate) => candidate.kind !== configuredMethod.kind,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Add at least one delivery method.</p>
        )}
        <div className="notification-destination-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="button"
            type="submit"
            disabled={saving || !methods.length}
          >
            {saving ? 'Saving' : 'Save destination'}
          </button>
        </div>
      </form>
    </section>
  </div>
)

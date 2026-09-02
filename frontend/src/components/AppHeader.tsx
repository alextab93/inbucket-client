import type { ViewName } from '../types'

interface AppHeaderProps {
  authenticated: boolean
  view: ViewName
  signingOut: boolean
  onViewChange: (view: ViewName) => void
  onSignOut: () => void
}

const views: Array<{ value: ViewName; label: string }> = [
  { value: 'mailboxes', label: 'Mailboxes' },
  { value: 'starred', label: 'Starred' },
  { value: 'archive', label: 'Archived' },
  { value: 'trash', label: 'Trash' },
]

export const AppHeader = ({
  authenticated,
  view,
  signingOut,
  onViewChange,
  onSignOut,
}: AppHeaderProps) => (
  <header className="inbucket-header">
    <div className="container inbucket-header-content">
      <h1>Inbucket</h1>
      {authenticated ? (
        <>
          <nav className="inbucket-tabs" aria-label="Mailbox views">
            {views.map((option) => (
              <button
                key={option.value}
                className="inbucket-tab"
                type="button"
                aria-current={view === option.value ? 'page' : undefined}
                onClick={() => onViewChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <button
            className="button button-secondary"
            type="button"
            disabled={signingOut}
            onClick={onSignOut}
          >
            Sign out
          </button>
        </>
      ) : null}
    </div>
  </header>
)

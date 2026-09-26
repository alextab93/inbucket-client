import type { NotificationDestination } from '../../types'
import { destinationMethodName } from './destinationPresentation'

interface DestinationListProps {
  destinations: NotificationDestination[]
  onEdit: (destination: NotificationDestination) => void
  onDelete: (destination: NotificationDestination) => void
  selectedDestinationIds?: number[]
  onSelect?: (destinationId: number, selected: boolean) => void
}

export const DestinationList = ({
  destinations,
  onEdit,
  onDelete,
  selectedDestinationIds,
  onSelect,
}: DestinationListProps) => {
  if (!destinations.length) {
    return (
      <p className="notification-empty">
        No destinations yet. Create one to send notifications outside Inbucket.
      </p>
    )
  }

  return (
    <ul className="notification-destination-list">
      {destinations.map((destination) => {
        const selected = selectedDestinationIds?.includes(destination.id) ?? false
        return (
          <li key={destination.id} className={selected ? 'is-selected' : ''}>
            {onSelect ? (
              <label className="notification-checkbox notification-destination-select">
                <input
                  type="checkbox"
                  aria-label={`Use ${destination.name} destination`}
                  checked={selected}
                  onChange={(event) =>
                    onSelect(destination.id, event.target.checked)
                  }
                />
              </label>
            ) : null}
            <span className="notification-destination-identity">
              <strong>{destination.name}</strong>
              <span className="notification-destination-badges">
                {destination.methods.map((method) => (
                  <span key={method.kind}>
                    {destinationMethodName(method.kind)}
                  </span>
                ))}
              </span>
            </span>
            <div className="notification-destination-row-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => onEdit(destination)}
              >
                Edit
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => onDelete(destination)}
              >
                Delete
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

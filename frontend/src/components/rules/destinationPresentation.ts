import type { NotificationDestinationMethod } from '../../types'

export const destinationMethodName = (
  kind: NotificationDestinationMethod['kind'],
): string =>
  kind === 'ntfy' ? 'ntfy' : `${kind[0].toUpperCase()}${kind.slice(1)}`

import type { StatusValue } from '../types'

interface StatusMessageProps {
  value: StatusValue
  className?: string
  assertive?: boolean
}

export const StatusMessage = ({
  value,
  className = '',
  assertive = false,
}: StatusMessageProps) => (
  <p
    className={`status-message${className ? ` ${className}` : ''}`}
    role="status"
    aria-live={assertive ? 'assertive' : 'polite'}
    data-state={value.state || undefined}
  >
    {value.message}
  </p>
)

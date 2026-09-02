interface StarIconProps {
  className?: string
}

export const StarIcon = ({ className = '' }: StarIconProps) => (
  <svg
    className={className}
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 24 24"
  >
    <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" />
  </svg>
)

interface StarButtonProps {
  starred: boolean
  label: string
  pending: boolean
  className?: string
  onChange: (starred: boolean) => void
}

export const StarButton = ({
  starred,
  label,
  pending,
  className = '',
  onChange,
}: StarButtonProps) => {
  const action = starred ? 'Remove star' : 'Add star'

  return (
    <button
      className={`star-button${className ? ` ${className}` : ''}`}
      type="button"
      aria-label={`${action}: ${label}`}
      aria-pressed={starred}
      title={action}
      disabled={pending}
      onClick={() => onChange(!starred)}
    >
      <StarIcon />
    </button>
  )
}

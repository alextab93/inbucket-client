import { useState } from 'react'

interface TokenInputProps {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}

const normalize = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

export const TokenInput = ({ label, values, onChange, placeholder }: TokenInputProps) => {
  const [draft, setDraft] = useState('')

  const addDraft = () => {
    const next = normalize(draft)
    if (!next.length) return
    onChange([...new Set([...values, ...next])])
    setDraft('')
  }

  return (
    <div className="token-input-field">
      <label>{label}
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => {
            const value = event.target.value
            if (!value.includes(',')) return setDraft(value)
            const entries = value.split(',')
            const complete = entries.slice(0, -1).map((entry) => entry.trim()).filter(Boolean)
            onChange([...new Set([...values, ...complete])])
            setDraft(entries.at(-1) || '')
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            addDraft()
          }}
          onBlur={addDraft}
        />
      </label>
      {values.length ? <ul aria-label={`${label} values`}>{values.map((value) => <li key={value}><span>{value}</span><button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((entry) => entry !== value))}>×</button></li>)}</ul> : <span className="token-input-empty">No values. This condition matches any {label.toLowerCase()}.</span>}
    </div>
  )
}

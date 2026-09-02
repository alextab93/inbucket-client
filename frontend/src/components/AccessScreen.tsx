import { useState, type FormEvent } from 'react'
import type { AuthenticationState, StatusValue } from '../types'
import { StatusMessage } from './StatusMessage'

interface AccessScreenProps {
  authentication: AuthenticationState
  status: StatusValue
  onLogin: (username: string, password: string) => Promise<void>
}

export const AccessScreen = ({
  authentication,
  status,
  onLogin,
}: AccessScreenProps) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const busy =
    authentication === 'checking' || authentication === 'authenticating'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await onLogin(username, password)
    } finally {
      setPassword('')
    }
  }

  return (
    <section
      className="inbucket-access"
      aria-labelledby="access-title"
      aria-busy={busy}
    >
      <p className="kicker">Private access</p>
      <h2 id="access-title">Sign in</h2>
      <form className="login-form" onSubmit={submit}>
        <label>
          Username
          <input
            name="username"
            autoComplete="username"
            required
            autoFocus={authentication !== 'checking'}
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
      <StatusMessage value={status} assertive />
    </section>
  )
}

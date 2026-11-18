import { useState } from 'react'
import './Auth.css'
import {
  getUsers,
  isValidHandle,
  normalizeHandle,
  saveUsers,
} from './userStore.js'

const Signup = () => {
  const [form, setForm] = useState({ name: '', handle: '', password: '' })
  const [error, setError] = useState('')

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleCreateAccount = () => {
    const name = form.name.trim()
    const handle = `@${normalizeHandle(form.handle)}`

    if (!name || !form.password || !isValidHandle(handle)) {
      setError('Enter your name, a valid @handle, and a password.')
      return
    }

    try {
      const users = getUsers()
      if (users.some((user) => normalizeHandle(user.handle || '') === normalizeHandle(handle))) {
        setError('That handle is already taken. Please choose another one.')
        return
      }

      saveUsers([...users, { name, handle, password: form.password }])
      setError('')
      window.location.assign('/login')
    } catch (storageError) {
      setError(storageError.message || 'Unable to create your account. Please try again.')
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="signup-title">
        <img className="auth-logo" src="/degig-logo.svg" alt="Degig" />
        <h1 className="auth-title" id="signup-title">Create your account</h1>
        <p className="auth-subtitle">Choose a handle so friends can find you.</p>
        <div className="auth-fields">
          <label className="auth-field-label" htmlFor="signup-name">Your name</label>
          <input
            id="signup-name"
            name="name"
            value={form.name}
            onChange={handleChange}
            type="text"
            autoComplete="name"
            placeholder="Enter your name"
            className="auth-input"
          />
          <label className="auth-field-label" htmlFor="signup-handle">Your Degig handle</label>
          <input
            id="signup-handle"
            name="handle"
            value={form.handle}
            onChange={handleChange}
            type="text"
            autoComplete="username"
            placeholder="@oluwa"
            className="auth-input"
          />
          <label className="auth-field-label" htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            value={form.password}
            onChange={handleChange}
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            className="auth-input"
          />
          <p className="auth-hint">Use 3–20 letters, numbers, or underscores. No phone number needed.</p>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button onClick={handleCreateAccount} className="auth-button" type="button">
            CREATE ACCOUNT
          </button>
        </div>
        <p className="auth-switch">
          Already on Degig?
          <a href="/login" className="auth-link">Sign in</a>
        </p>
      </section>
    </main>
  )
}

export default Signup

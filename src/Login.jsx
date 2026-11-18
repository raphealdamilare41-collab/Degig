import { useState } from 'react'
import './Auth.css'
import {
  getUsers,
  isValidHandle,
  normalizeHandle,
  saveCurrentUser,
} from './userStore.js'

const Login = () => {
  const [form, setForm] = useState({ handle: '', password: '' })
  const [error, setError] = useState('')

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleLogin = () => {
    const handle = `@${normalizeHandle(form.handle)}`
    const password = form.password

    if (!isValidHandle(handle) || !password) {
      setError('Enter your @handle and password.')
      return
    }

    try {
      const user = getUsers().find(
        (savedUser) =>
          normalizeHandle(savedUser.handle || '') === normalizeHandle(handle) &&
          savedUser.password === password,
      )

      if (!user) {
        setError('We could not find an account with those details.')
        return
      }

      saveCurrentUser({ name: user.name, handle: user.handle })
      setError('')
      window.location.assign('/chat')
    } catch (storageError) {
      setError(storageError.message || 'Unable to sign in. Please try again.')
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="login-title">
        <img className="auth-logo" src="/degig-logo.svg" alt="Degig" />
        <h1 className="auth-title" id="login-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in with your Degig handle.</p>
        <div className="auth-fields">
          <label className="auth-field-label" htmlFor="login-handle">Degig handle</label>
          <input
            id="login-handle"
            name="handle"
            value={form.handle}
            onChange={handleChange}
            type="text"
            autoComplete="username"
            placeholder="@oluwa"
            className="auth-input"
          />
          <label className="auth-field-label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            value={form.password}
            onChange={handleChange}
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            className="auth-input"
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button onClick={handleLogin} className="auth-button" type="button">
            SIGN IN
          </button>
        </div>
        <p className="auth-switch">
          New to Degig?
          <a href="/signup" className="auth-link">Create an account</a>
        </p>
      </section>
    </main>
  )
}

export default Login

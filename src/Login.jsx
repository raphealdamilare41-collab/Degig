import { useState } from 'react'
import './Auth.css'
import {
  getAccountErrorMessage,
  sendAccountPasswordReset,
  signInAccount,
} from './userStore.js'

const Login = () => {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await signInAccount(form)
      window.location.assign('/chat')
    } catch (loginError) {
      setError(getAccountErrorMessage(loginError))
      setIsSubmitting(false)
    }
  }

  const handlePasswordReset = async () => {
    setError('')
    setResetMessage('')
    setIsSendingReset(true)
    try {
      await sendAccountPasswordReset(form.email)
      setResetMessage('If an account exists for that email, a password reset link is on its way.')
    } catch (resetError) {
      setError(getAccountErrorMessage(resetError))
    } finally {
      setIsSendingReset(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="login-title">
        <img className="auth-logo" src="/degig-logo.svg" alt="Degig" />
        <h1 className="auth-title" id="login-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in with your email address.</p>
        <form className="auth-fields" onSubmit={handleLogin}>
          <label className="auth-field-label" htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            name="email"
            value={form.email}
            onChange={handleChange}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="auth-input"
            required
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
            required
          />
          <button
            className="auth-reset"
            type="button"
            onClick={handlePasswordReset}
            disabled={isSendingReset}
          >
            {isSendingReset ? 'Sending reset link…' : 'Forgot password?'}
          </button>
          {resetMessage && <p className="auth-success" role="status">{resetMessage}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'SIGNING IN…' : 'SIGN IN'}
          </button>
        </form>
        <p className="auth-switch">
          New to Degig?
          <a href="/signup" className="auth-link">Create an account</a>
        </p>
      </section>
    </main>
  )
}

export default Login

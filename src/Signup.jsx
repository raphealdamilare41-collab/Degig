import { useState } from 'react'
import './Auth.css'
import { createAccount, getAccountErrorMessage } from './userStore.js'

const Signup = () => {
  const [form, setForm] = useState({ name: '', email: '', handle: '', password: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleCreateAccount = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await createAccount(form)
      window.location.assign('/chat')
    } catch (creationError) {
      setError(getAccountErrorMessage(creationError))
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="signup-title">
        <img className="auth-logo" src="/degig-logo.svg" alt="Degig" />
        <h1 className="auth-title" id="signup-title">Create your account</h1>
        <p className="auth-subtitle">Create your account with an email and a unique handle.</p>
        <form className="auth-fields" onSubmit={handleCreateAccount}>
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
            maxLength={60}
            required
          />
          <label className="auth-field-label" htmlFor="signup-email">Email address</label>
          <input
            id="signup-email"
            name="email"
            value={form.email}
            onChange={handleChange}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="auth-input"
            required
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
            required
          />
          <label className="auth-field-label" htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            value={form.password}
            onChange={handleChange}
            type="password"
            autoComplete="new-password"
            minLength={6}
            placeholder="At least 6 characters"
            className="auth-input"
            required
          />
          <p className="auth-hint">Your email is for sign-in and account recovery. Your handle is how friends find you.</p>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
          </button>
        </form>
        <p className="auth-switch">
          Already on Degig?
          <a href="/login" className="auth-link">Sign in</a>
        </p>
      </section>
    </main>
  )
}

export default Signup

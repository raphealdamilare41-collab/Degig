import { useEffect } from 'react'
import './Splash.css'

function Splash() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.replace('/signup')
    }, 5000)

    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="splash">
      <div className="splash-orb splash-orb-one" aria-hidden="true" />
      <div className="splash-orb splash-orb-two" aria-hidden="true" />
      <section className="splash-content" aria-label="Welcome to Degig">
        <img className="splash-logo" src="/degig-logo.svg" alt="Degig" />
        <p className="splash-tagline">Make your next move count.</p>
        <div className="splash-loading" role="status" aria-live="polite">
          <span className="splash-loading-bar" />
          <span className="splash-loading-label">Getting things ready</span>
        </div>
      </section>
      <span className="splash-footer">A brighter way to get started</span>
    </main>
  )
}

export default Splash

import './assets/Music.css'

function Music() {
  return (
    <section className="music-page" aria-label="Degig Music">
      <header className="music-heading">
        <div>
          <p className="music-eyebrow">DEGIG MUSIC</p>
          <h1>Your music space</h1>
          <p className="music-description">Music playback is not available in this build yet.</p>
        </div>
        <span className="spotify-mark">Spotify</span>
      </header>
      <div className="music-setup">
        <h2>Music is coming soon</h2>
        <p>For now, you can chat with friends or search the web with Degig.</p>
      </div>
    </section>
  )
}

export default Music
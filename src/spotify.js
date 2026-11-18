const SESSION_KEY = 'Degig_spotify_session'
const VERIFIER_KEY = 'Degig_spotify_verifier'
const STATE_KEY = 'Degig_spotify_state'
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() || ''

export const isSpotifyConfigured = Boolean(CLIENT_ID)

const callbackUri = () => `${window.location.origin}/chat`

const encodeBase64Url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const createRandomString = (length) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('')
}

export const beginSpotifyLogin = async () => {
  if (!CLIENT_ID) throw new Error('Spotify is not configured yet. Add VITE_SPOTIFY_CLIENT_ID to your local .env file.')
  if (!window.isSecureContext || !crypto.subtle) {
    throw new Error('Spotify sign-in requires HTTPS or localhost with browser cryptography enabled.')
  }

  const verifier = createRandomString(64)
  const state = createRandomString(32)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = encodeBase64Url(new Uint8Array(digest))

  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem('Degig_active_tab', 'music')

  const authorizeUrl = new URL('https://accounts.spotify.com/authorize')
  authorizeUrl.search = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: callbackUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state',
  }).toString()

  window.location.assign(authorizeUrl)
}

const saveTokenResponse = (token, previousRefreshToken) => {
  if (!token.access_token || !Number.isFinite(token.expires_in)) {
    throw new Error('Spotify returned an invalid sign-in response.')
  }

  const session = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || previousRefreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

const requestToken = async (parameters) => {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...parameters, client_id: CLIENT_ID }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error_description || 'Spotify could not complete sign-in.')
  }
  return data
}

export const hasSpotifyCallback = () => {
  const params = new URLSearchParams(window.location.search)
  return params.has('code') || params.has('error')
}

export const finishSpotifyLogin = async () => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const oauthError = params.get('error')
  if (!code && !oauthError) return null

  try {
    if (oauthError) throw new Error(`Spotify sign-in was not completed (${oauthError}).`)

    const expectedState = sessionStorage.getItem(STATE_KEY)
    const receivedState = params.get('state')
    const verifier = sessionStorage.getItem(VERIFIER_KEY)
    if (!expectedState || receivedState !== expectedState || !verifier) {
      throw new Error('Spotify sign-in could not be verified. Please try connecting again.')
    }

    const token = await requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUri(),
      code_verifier: verifier,
    })
    return saveTokenResponse(token)
  } finally {
    sessionStorage.removeItem(VERIFIER_KEY)
    sessionStorage.removeItem(STATE_KEY)
    window.history.replaceState({}, document.title, '/chat')
  }
}

export const getSpotifySession = () => {
  const serialized = sessionStorage.getItem(SESSION_KEY)
  return serialized ? JSON.parse(serialized) : null
}

export const getValidSpotifyToken = async () => {
  const session = getSpotifySession()
  if (!session) throw new Error('Connect your Spotify account to continue.')
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken
  if (!session.refreshToken) {
    sessionStorage.removeItem(SESSION_KEY)
    throw new Error('Your Spotify session expired. Please connect again.')
  }

  const token = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  })
  return saveTokenResponse(token, session.refreshToken).accessToken
}

export const disconnectSpotify = () => {
  sessionStorage.removeItem(SESSION_KEY)
}

let sdkPromise

export const loadSpotifyPlayerSdk = () => {
  if (window.Spotify) return Promise.resolve(window.Spotify)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (window.Spotify) resolve(window.Spotify)
      else reject(new Error('Spotify player SDK did not initialize.'))
    }

    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    script.onerror = () => {
      sdkPromise = undefined
      reject(new Error('Could not load Spotify’s playback player. Check your connection and try again.'))
    }
    document.head.appendChild(script)
  })
  return sdkPromise
}

import { useEffect, useMemo, useRef, useState } from 'react'
import './Chat.css'
import Music from '../Music.jsx'
import {
  getCurrentUser,
  getMessages,
  getUsers,
  isValidHandle,
  normalizeHandle,
  saveCurrentUser,
  saveMessages,
  saveUsers,
} from '../userStore.js'

function Chat() {
  const recorderRef = useRef(null)
  const mediaInputRef = useRef(null)
  const [initialState] = useState(() => {
    try {
      return { currentUser: getCurrentUser(), messages: getMessages(), error: '' }
    } catch (error) {
      return { currentUser: null, messages: [], error: error.message || 'Unable to load your account.' }
    }
  })
  const [currentUser, setCurrentUser] = useState(initialState.currentUser)
  const [storageError, setStorageError] = useState(initialState.error)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState(initialState.currentUser?.name || '')
  const [profileImage, setProfileImage] = useState(initialState.currentUser?.image || '')
  const [profileError, setProfileError] = useState('')
  const [searchHandle, setSearchHandle] = useState('')
  const [searchError, setSearchError] = useState('')
  const [activeFriend, setActiveFriend] = useState(null)
  const [messageText, setMessageText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [aiError, setAiError] = useState('')
  const [messages, setMessages] = useState(initialState.messages)
  const [activeSection, setActiveSection] = useState(
    () => ['music', 'ai'].includes(sessionStorage.getItem('Degig_active_tab'))
      ? sessionStorage.getItem('Degig_active_tab')
      : 'messages',
  )

  const changeSection = (section) => {
    sessionStorage.setItem('Degig_active_tab', section)
    setActiveSection(section)
  }

  useEffect(() => {
    if (!currentUser && !storageError) window.location.replace('/login')
  }, [currentUser, storageError])

  const conversation = useMemo(() => {
    if (!currentUser || !activeFriend) return []
    return messages.filter((message) =>
      (message.from === currentUser.handle && message.to === activeFriend.handle) ||
      (message.from === activeFriend.handle && message.to === currentUser.handle),
    )
  }, [activeFriend, currentUser, messages])

  const findFriend = (event) => {
    event.preventDefault()
    setSearchError('')
    setActiveFriend(null)
    const handle = `@${normalizeHandle(searchHandle)}`

    if (!isValidHandle(handle)) {
      setSearchError('Enter a valid @handle (3–20 letters, numbers, or underscores).')
      return
    }

    try {
      const friend = getUsers().find(
        (user) => normalizeHandle(user.handle || '') === normalizeHandle(handle),
      )
      if (!friend || normalizeHandle(handle) === normalizeHandle(currentUser?.handle || '')) {
        setSearchError(normalizeHandle(handle) === normalizeHandle(currentUser?.handle || '')
          ? 'Search for someone else’s handle.'
          : 'No Degig account was found with that handle.')
        return
      }
      setActiveFriend({ name: friend.name, handle: friend.handle, image: friend.image || '' })
      setSearchHandle('')
    } catch (error) {
      setSearchError(error.message || 'Unable to search for that handle.')
    }
  }

  const appendMessage = (message) => {
    const updatedMessages = [...messages, message]
    saveMessages(updatedMessages)
    setMessages(updatedMessages)
  }

  const sendMessage = (event) => {
    event.preventDefault()
    const text = messageText.trim()
    if (!text || !currentUser || !activeFriend) return

    try {
      appendMessage({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        from: currentUser.handle,
        to: activeFriend.handle,
        text,
        createdAt: new Date().toISOString(),
      })
      setMessageText('')
    } catch {
      setStorageError('Unable to save this message. Check your device storage and try again.')
    }
  }

  const saveProfile = (event) => {
    event.preventDefault()
    const name = profileName.trim()
    if (!name) {
      setProfileError('Enter your name before saving.')
      return
    }

    try {
      const updatedUser = { ...currentUser, name, image: profileImage }
      const users = getUsers()
      const userIndex = users.findIndex(
        (user) => normalizeHandle(user.handle || '') === normalizeHandle(currentUser.handle),
      )
      if (userIndex < 0) throw new Error('Your account could not be found. Please sign in again.')
      users[userIndex] = { ...users[userIndex], name, image: profileImage }
      saveUsers(users)
      saveCurrentUser(updatedUser)
      setCurrentUser(updatedUser)
      setProfileError('')
      setProfileOpen(false)
    } catch (error) {
      setProfileError(error.message || 'Unable to save your profile. Check your device storage and try again.')
    }
  }

  const selectProfileImage = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileError('Choose an image file for your profile photo.')
      return
    }
    if (file.size > 1024 * 1024) {
      setProfileError('Profile photos must be 1 MB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileImage(reader.result)
        setProfileError('')
      }
    }
    reader.onerror = () => setProfileError('Unable to read that profile photo.')
    reader.readAsDataURL(file)
  }

  const sendMedia = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !currentUser || !activeFriend) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setStorageError('Choose an image or video file to send.')
      return
    }
    if (file.size > 1024 * 1024) {
      setStorageError('Photos and videos must be 1 MB or smaller because messages are stored on this device.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setStorageError('Unable to read that media file.')
        return
      }
      try {
        appendMessage({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          from: currentUser.handle,
          to: activeFriend.handle,
          media: reader.result,
          mediaType: file.type.startsWith('video/') ? 'video' : 'image',
          mediaName: file.name,
          createdAt: new Date().toISOString(),
        })
        setStorageError('')
      } catch {
        setStorageError('Unable to save this media. Your device storage may be full.')
      }
    }
    reader.onerror = () => setStorageError('Unable to read that media file.')
    reader.readAsDataURL(file)
  }

  const toggleRecording = async () => {
    if (recorderRef.current) {
      recorderRef.current.stop()
      recorderRef.current = null
      setIsRecording(false)
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStorageError('Voice messages are not supported by this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      const recipient = activeFriend
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
        if (chunks.reduce((total, chunk) => total + chunk.size, 0) > 1024 * 1024) {
          setStorageError('Voice messages must be under 1 MB. Please record a shorter message.')
          if (recorder.state !== 'inactive') recorder.stop()
        }
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        setIsRecording(false)
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (audio.size > 1024 * 1024 || !audio.size) return

        const reader = new FileReader()
        reader.onload = () => {
          if (!currentUser || !recipient || typeof reader.result !== 'string') return
          try {
            appendMessage({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              from: currentUser.handle,
              to: recipient.handle,
              audio: reader.result,
              createdAt: new Date().toISOString(),
            })
            setStorageError('')
          } catch {
            setStorageError('Unable to save this voice message. Check your device storage and try again.')
          }
        }
        reader.onerror = () => setStorageError('Unable to read the recorded voice message.')
        reader.readAsDataURL(audio)
      }
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        setIsRecording(false)
        setStorageError('Recording failed. Check your microphone and try again.')
      }
      recorder.start(1000)
      setStorageError('')
      setIsRecording(true)
    } catch (error) {
      setStorageError(error.message || 'Microphone access was denied. Allow microphone access and try again.')
    }
  }

  const searchWithDegigAi = (event) => {
    event.preventDefault()
    const query = aiQuery.trim()
    if (!query) {
      setAiError('Enter something you would like to search for.')
      return
    }

    const searchUrl = new URL('https://duckduckgo.com/')
    searchUrl.searchParams.set('q', query)
    const searchWindow = window.open(searchUrl.toString(), '_blank')
    if (!searchWindow) {
      setAiError('Your browser blocked the search window. Allow pop-ups and try again.')
      return
    }
    searchWindow.opener = null
    setAiError('')
  }

  useEffect(() => () => {
    recorderRef.current?.stop()
  }, [])

  if (!currentUser) {
    return (
      <main className="chat-page">
        <p className={storageError ? 'chat-error' : 'chat-loading'} role={storageError ? 'alert' : 'status'}>
          {storageError || 'Opening Degig…'}
        </p>
      </main>
    )
  }

  return (
    <main className="chat-page">
      <header className="chat-topbar">
        <a className="chat-brand" href="/chat" aria-label="Degig chats">
          <img src="/degig-logo.svg" alt="" />
          <span>Degig</span>
        </a>
        <div className="chat-profile">
          {currentUser.image
            ? <img className="chat-avatar chat-avatar-image" src={currentUser.image} alt="" />
            : <span className="chat-avatar" aria-hidden="true">{currentUser.name?.charAt(0).toUpperCase()}</span>}
          <span>{currentUser.name}</span>
          <button
            className="chat-signout"
            type="button"
            onClick={() => {
              setProfileName(currentUser.name || '')
              setProfileImage(currentUser.image || '')
              setProfileError('')
              setProfileOpen(true)
            }}
          >
            Profile
          </button>
          <button
            className="chat-signout"
            type="button"
            onClick={() => {
              localStorage.removeItem('Degig_current_user')
              window.location.assign('/login')
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="chat-workspace">
        <nav className="chat-app-nav" aria-label="Degig sections">
          <p className="chat-nav-label">WORKSPACE</p>
          <button
            type="button"
            className={`chat-nav-item ${activeSection === 'messages' ? 'chat-nav-active' : ''}`}
            onClick={() => changeSection('messages')}
            aria-current={activeSection === 'messages' ? 'page' : undefined}
          >
            <span className="chat-nav-icon" aria-hidden="true">✉</span>
            Degig Message
          </button>
          <button
            type="button"
            className={`chat-nav-item ${activeSection === 'music' ? 'chat-nav-active' : ''}`}
            onClick={() => changeSection('music')}
            aria-current={activeSection === 'music' ? 'page' : undefined}
          >
            <span className="chat-nav-icon" aria-hidden="true">♫</span>
            Degig Music
          </button>
          <button
            type="button"
            className={`chat-nav-item ${activeSection === 'ai' ? 'chat-nav-active' : ''}`}
            onClick={() => changeSection('ai')}
            aria-current={activeSection === 'ai' ? 'page' : undefined}
          >
            <span className="chat-nav-icon" aria-hidden="true">✦</span>
            Degig AI
          </button>
        </nav>

        {activeSection === 'ai' ? (
          <section className="ai-search-panel" aria-label="Degig AI search">
            <div className="ai-search-content">
              <span className="ai-search-icon" aria-hidden="true">✦</span>
              <h1>What would you like to find?</h1>
              <p>Search the web from Degig. Your search opens in a new tab.</p>
              <form className="ai-search-form" onSubmit={searchWithDegigAi}>
                <label className="sr-only" htmlFor="ai-search-query">Search the web</label>
                <input
                  id="ai-search-query"
                  type="search"
                  placeholder="Ask or search anything…"
                  value={aiQuery}
                  onChange={(event) => setAiQuery(event.target.value)}
                />
                <button type="submit">Search</button>
              </form>
              {aiError && <p className="chat-error" role="alert">{aiError}</p>}
              <p className="ai-search-note">
                Web search is available now. AI-generated answers need an AI service connection.
              </p>
            </div>
          </section>
        ) : activeSection === 'music' ? (
          <section className="chat-layout chat-layout-music" aria-label="Degig Music">
            <Music />
          </section>
        ) : (
          <section className="chat-layout" aria-label="Degig messaging">
            <aside className="chat-sidebar">
              <h1>Find a friend</h1>
              <p>Search by Degig handle to start a conversation.</p>
              <form className="chat-search" onSubmit={findFriend}>
                <label htmlFor="friend-handle">Degig handle</label>
                <input
                  id="friend-handle"
                  type="text"
                  autoComplete="username"
                  placeholder="@oluwa"
                  value={searchHandle}
                  onChange={(event) => setSearchHandle(event.target.value)}
                />
                <button type="submit">Search</button>
                {searchError && <p className="chat-error" role="alert">{searchError}</p>}
              </form>

              {activeFriend && (
                <button
                  type="button"
                  className="chat-contact"
                  onClick={() => setActiveFriend(activeFriend)}
                >
                  {activeFriend.image
                    ? <img className="chat-avatar chat-avatar-image" src={activeFriend.image} alt="" />
                    : <span className="chat-avatar">{activeFriend.name.charAt(0).toUpperCase()}</span>}
                  <span className="chat-contact-details">
                    <strong>{activeFriend.name}</strong>
                    <small>{activeFriend.handle}</small>
                  </span>
                  <span className="chat-contact-arrow" aria-hidden="true">›</span>
                </button>
              )}
              <p className="chat-local-note">Search finds accounts registered on this device.</p>
            </aside>

            <section className="chat-conversation" aria-label="Conversation">
              {activeFriend ? (
                <>
                  <header className="conversation-header">
                    {activeFriend.image
                      ? <img className="chat-avatar chat-avatar-image" src={activeFriend.image} alt="" />
                      : <span className="chat-avatar">{activeFriend.name.charAt(0).toUpperCase()}</span>}
                    <div>
                      <strong>{activeFriend.name}</strong>
                      <small>{activeFriend.handle}</small>
                    </div>
                  </header>
                  <div className="conversation-messages" aria-live="polite">
                    {conversation.length === 0 ? (
                      <p className="conversation-empty">You’re connected. Send the first message.</p>
                    ) : conversation.map((message) => (
                      <div
                        className={`message-bubble ${message.from === currentUser.handle ? 'message-own' : ''}`}
                        key={message.id}
                      >
                        {message.audio && (
                          <audio controls preload="metadata" src={message.audio}>
                            Your browser cannot play this voice message.
                          </audio>
                        )}
                        {message.mediaType === 'image' && (
                          <img className="message-media" src={message.media} alt={message.mediaName || 'Image attachment'} />
                        )}
                        {message.mediaType === 'video' && (
                          <video className="message-media" controls preload="metadata" src={message.media}>
                            Your browser cannot play this video.
                          </video>
                        )}
                        {message.text && <p>{message.text}</p>}
                        <time dateTime={message.createdAt}>
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </time>
                      </div>
                    ))}
                  </div>
                  <form className="conversation-compose" onSubmit={sendMessage}>
                    <input
                      type="text"
                      aria-label="Write a message"
                      placeholder="Write a message…"
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value)}
                    />
                    <input
                      ref={mediaInputRef}
                      className="media-file-input"
                      type="file"
                      accept="image/*,video/*"
                      aria-label="Choose a photo or video to send"
                      onChange={sendMedia}
                    />
                    <button
                      type="button"
                      className="media-message-button"
                      onClick={() => mediaInputRef.current?.click()}
                      aria-label="Attach a photo or video"
                      title="Attach a photo or video"
                    >
                      ▧
                    </button>
                    <button
                      type="button"
                      className={`voice-message-button ${isRecording ? 'voice-message-recording' : ''}`}
                      onClick={toggleRecording}
                      aria-label={isRecording ? 'Stop recording voice message' : 'Record voice message'}
                      title={isRecording ? 'Stop recording' : 'Record a voice message'}
                    >
                      {isRecording ? 'Stop' : '🎙'}
                    </button>
                    <button type="submit" disabled={!messageText.trim()}>Send</button>
                  </form>
                </>
              ) : (
                <div className="conversation-welcome">
                  <img src="/degig-logo.svg" alt="" />
                  <h2>Your conversations start here</h2>
                  <p>Search for a friend using their Degig handle.</p>
                </div>
              )}
            </section>
          </section>
        )}
      </div>
      {profileOpen && (
        <div className="profile-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setProfileOpen(false)
        }}>
          <aside className="profile-panel" aria-labelledby="profile-title">
            <header className="profile-panel-header">
              <div>
                <p className="profile-eyebrow">YOUR ACCOUNT</p>
                <h2 id="profile-title">Edit profile</h2>
              </div>
              <button
                type="button"
                className="profile-close"
                onClick={() => setProfileOpen(false)}
                aria-label="Close profile"
              >
                ×
              </button>
            </header>
            <form className="profile-form" onSubmit={saveProfile}>
              <div className="profile-photo-wrap">
                {profileImage
                  ? <img className="profile-photo" src={profileImage} alt="Profile preview" />
                  : <span className="profile-photo profile-photo-placeholder">
                    {profileName.trim().charAt(0).toUpperCase() || '?'}
                  </span>}
                <label className="profile-photo-button">
                  Add photo
                  <input type="file" accept="image/*" onChange={selectProfileImage} />
                </label>
                {profileImage && (
                  <button type="button" className="profile-remove-photo" onClick={() => setProfileImage('')}>
                    Remove photo
                  </button>
                )}
              </div>
              <label htmlFor="profile-name">Display name</label>
              <input
                id="profile-name"
                type="text"
                maxLength={60}
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
              />
              <label htmlFor="profile-handle">Degig handle</label>
              <input id="profile-handle" type="text" value={currentUser.handle} readOnly />
              <p className="profile-hint">Photos are limited to 1 MB and saved on this device.</p>
              {profileError && <p className="chat-error" role="alert">{profileError}</p>}
              <button className="profile-save-button" type="submit">Save changes</button>
            </form>
          </aside>
        </div>
      )}
      {storageError && <p className="chat-toast" role="alert">{storageError}</p>}
    </main>
  )
}

export default Chat

import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import './Chat.css'
import Music from '../Music.jsx'
import { auth, firebaseConfigError } from '../Firebase.js'
import { askDegigAi } from '../aiStore.js'
import {
  getConversationId,
  MAX_ATTACHMENT_SIZE,
  MAX_VOICE_MESSAGE_SIZE,
  markConversationRead,
  sendAttachmentMessage,
  sendTextMessage,
  subscribeToInbox,
  subscribeToConversation,
} from '../chatStore.js'
import {
  enablePushNotifications,
  disablePushNotifications,
  subscribeToPushMessages,
} from '../pushNotifications.js'
import {
  findUserByHandle,
  getAccountErrorMessage,
  getUserProfile,
  isValidHandle,
  normalizeHandle,
  updateUserProfile,
} from '../userStore.js'

const formatFileSize = (size) => `${(size / (1024 * 1024)).toFixed(1)} MB`

function Chat() {
  const recorderRef = useRef(null)
  const recordingStreamRef = useRef(null)
  const recordingRequestRef = useRef(0)
  const mediaInputRef = useRef(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [storageError, setStorageError] = useState(firebaseConfigError)
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(auth))
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileImage, setProfileImage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [searchHandle, setSearchHandle] = useState('')
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [activeFriend, setActiveFriend] = useState(null)
  const [inboxConversations, setInboxConversations] = useState([])
  const [isInboxLoading, setIsInboxLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState(null)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isSendingVoice, setIsSendingVoice] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [isRequestingRecording, setIsRequestingRecording] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    false,
  )
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false)
  const [notificationToast, setNotificationToast] = useState('')
  const [aiQuery, setAiQuery] = useState('')
  const [aiError, setAiError] = useState('')
  const [aiMessages, setAiMessages] = useState([])
  const [isAiThinking, setIsAiThinking] = useState(false)
  const aiMessagesEndRef = useRef(null)
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false)
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false)
  const [messageState, setMessageState] = useState({ conversationId: '', messages: [] })
  const readCountsRef = useRef(new Map())
  const [activeSection, setActiveSection] = useState(
    () => ['music', 'ai'].includes(sessionStorage.getItem('Degig_active_tab'))
      ? sessionStorage.getItem('Degig_active_tab')
      : 'messages',
  )

  const changeSection = (section) => {
    sessionStorage.setItem('Degig_active_tab', section)
    setActiveSection(section)
    setMobileSectionOpen(true)
  }

  const openInboxConversation = (inboxConversation) => {
    const friendUid = inboxConversation.participants.find((uid) => uid !== currentUser.uid)
    const friendHandle = inboxConversation.handles?.[friendUid]
    if (!friendUid || !friendHandle) {
      setStorageError('Could not open this conversation. Search for the user by handle instead.')
      return
    }
    setActiveFriend({ uid: friendUid, handle: friendHandle, name: friendHandle, image: '' })
    setMobileConversationOpen(true)
    changeSection('messages')
  }

  const handleEnableNotifications = async () => {
    setIsEnablingNotifications(true)
    setStorageError('')
    try {
      await enablePushNotifications(currentUser.uid)
      setNotificationsEnabled(true)
    } catch (error) {
      setStorageError(getAccountErrorMessage(error))
    } finally {
      setIsEnablingNotifications(false)
    }
  }

  useEffect(() => {
    if (!auth) return undefined

    let isMounted = true
    let requestId = 0
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const currentRequestId = ++requestId
      setIsAuthLoading(true)
      setIsInboxLoading(true)
      setCurrentUser(null)

      if (!firebaseUser) {
        setIsAuthLoading(false)
        return
      }

      try {
        const profile = await getUserProfile(firebaseUser.uid)
        if (isMounted && currentRequestId === requestId) {
          setCurrentUser(profile)
          setProfileName(profile.name || '')
          setProfileImage(profile.image || '')
        }
      } catch (error) {
        if (isMounted && currentRequestId === requestId) {
          setStorageError(getAccountErrorMessage(error))
        }
      } finally {
        if (isMounted && currentRequestId === requestId) setIsAuthLoading(false)
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isAuthLoading && !currentUser && !storageError) window.location.replace('/login')
  }, [currentUser, isAuthLoading, storageError])

  const activeConversationId = currentUser && activeFriend
    ? getConversationId(currentUser.uid, activeFriend.uid)
    : ''
  const conversation = messageState.conversationId === activeConversationId
    ? messageState.messages
    : []
  const totalUnreadMessages = inboxConversations.reduce(
    (total, inboxConversation) => total + (inboxConversation.unreadCounts?.[currentUser?.uid] || 0),
    0,
  )

  useEffect(() => {
    if (!currentUser || !activeConversationId || activeSection !== 'messages') return
    const inboxConversation = inboxConversations.find((item) => item.id === activeConversationId)
    if (!inboxConversation) return

    const unreadCount = inboxConversation.unreadCounts?.[currentUser.uid] || 0
    if (!unreadCount) {
      readCountsRef.current.set(activeConversationId, 0)
      return
    }
    if ((readCountsRef.current.get(activeConversationId) || 0) >= unreadCount) return

    readCountsRef.current.set(activeConversationId, unreadCount)
    markConversationRead(activeConversationId, currentUser.uid).catch((error) => {
      readCountsRef.current.set(activeConversationId, 0)
      setStorageError(getAccountErrorMessage(error))
    })
  }, [activeConversationId, activeSection, currentUser, inboxConversations])

  useEffect(() => {
    if (!currentUser || !activeFriend) return undefined

    const conversationId = getConversationId(currentUser.uid, activeFriend.uid)
    return subscribeToConversation(
      currentUser,
      activeFriend,
      (messages) => setMessageState({ conversationId, messages }),
      (error) => setStorageError(getAccountErrorMessage(error)),
    )
  }, [activeFriend, currentUser])

  useEffect(() => {
    if (!currentUser) return undefined
    return subscribeToInbox(
      currentUser.uid,
      (conversations) => {
        setInboxConversations(conversations)
        setIsInboxLoading(false)
        const requestedConversationId = new URLSearchParams(window.location.search).get('conversation')
        const inboxConversation = conversations.find((item) => item.id === requestedConversationId)
        if (inboxConversation) {
          const friendUid = inboxConversation.participants.find((uid) => uid !== currentUser.uid)
          const friendHandle = inboxConversation.handles?.[friendUid]
          if (friendUid && friendHandle) {
            setActiveFriend({ uid: friendUid, handle: friendHandle, name: friendHandle, image: '' })
            setMobileConversationOpen(true)
            sessionStorage.setItem('Degig_active_tab', 'messages')
            setActiveSection('messages')
            setMobileSectionOpen(true)
            window.history.replaceState(null, '', '/chat')
          } else {
            setStorageError('Could not open this conversation. Search for the user by handle instead.')
          }
        }
      },
      (error) => {
        setIsInboxLoading(false)
        setStorageError(getAccountErrorMessage(error))
      },
    )
  }, [currentUser])

  useEffect(() => {
    if (!currentUser || typeof Notification === 'undefined' || Notification.permission !== 'granted') return undefined
    let isMounted = true
    enablePushNotifications(currentUser.uid)
      .then(() => {
        if (isMounted) setNotificationsEnabled(true)
      })
      .catch((error) => {
        if (isMounted) setStorageError(getAccountErrorMessage(error))
      })
    return () => {
      isMounted = false
    }
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return undefined
    let isMounted = true
    let unsubscribe
    subscribeToPushMessages((payload) => {
      if (payload.data?.recipientId && payload.data.recipientId !== currentUser.uid) return
      if (document.visibilityState === 'visible'
        && payload.data?.conversationId === activeConversationId) return
      const title = payload.data?.title || 'New Degig message'
      const body = payload.data?.body || 'Open Degig to read it.'
      setNotificationToast(`${title}: ${body}`)
      window.setTimeout(() => setNotificationToast(''), 6000)
    }).then((stopListening) => {
      if (isMounted) unsubscribe = stopListening
      else stopListening()
    }).catch((error) => {
      if (isMounted) setStorageError(getAccountErrorMessage(error))
    })
    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [activeConversationId, currentUser])

  useEffect(() => {
    if (!pendingAttachment) return undefined
    return () => URL.revokeObjectURL(pendingAttachment.previewUrl)
  }, [pendingAttachment])

  const findFriend = async (event) => {
    event.preventDefault()
    setSearchError('')
    const handle = `@${normalizeHandle(searchHandle)}`

    if (!isValidHandle(handle)) {
      setSearchError('Enter a valid @handle (3–20 letters, numbers, or underscores).')
      return
    }

    setIsSearching(true)
    try {
      const friend = await findUserByHandle(handle)
      if (!friend || friend.uid === currentUser?.uid) {
        setSearchError(normalizeHandle(handle) === normalizeHandle(currentUser?.handle || '')
          ? 'Search for someone else’s handle.'
          : 'No Degig account was found with that handle.')
        return
      }
      setPendingAttachment(null)
      setMessageText('')
      setActiveFriend({
        uid: friend.uid,
        name: friend.name,
        handle: friend.handle,
        image: friend.image || '',
      })
      setMobileConversationOpen(true)
      setSearchHandle('')
    } catch (error) {
      setSearchError(getAccountErrorMessage(error))
    } finally {
      setIsSearching(false)
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    const text = messageText.trim()
    if ((!text && !pendingAttachment) || !currentUser || !activeFriend || isSendingMessage) return

    setIsSendingMessage(true)
    setStorageError('')
    try {
      if (pendingAttachment) {
        await sendAttachmentMessage({
          sender: currentUser,
          recipient: activeFriend,
          file: pendingAttachment.file,
          messageType: pendingAttachment.mediaType,
          text,
          onProgress: setUploadProgress,
        })
        setPendingAttachment(null)
      } else {
        await sendTextMessage(currentUser, activeFriend, text)
      }
      setMessageText('')
    } catch (error) {
      setStorageError(getAccountErrorMessage(error))
    } finally {
      setIsSendingMessage(false)
      setUploadProgress(0)
    }
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    const name = profileName.trim()
    if (!name) {
      setProfileError('Enter your name before saving.')
      return
    }

    try {
      const updatedUser = await updateUserProfile(currentUser.uid, { name, image: profileImage })
      setCurrentUser(updatedUser)
      setProfileError('')
      setProfileOpen(false)
    } catch (error) {
      setProfileError(getAccountErrorMessage(error))
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
    if (file.size > 300 * 1024) {
      setProfileError('Profile photos must be 300 KB or smaller.')
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

  const selectMedia = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const mediaType = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : ''
    if (!mediaType) {
      setStorageError('Choose an image or video file to send.')
      return
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setStorageError('Photos and videos must be 10 MB or smaller.')
      return
    }

    setPendingAttachment({
      file,
      mediaType,
      previewUrl: URL.createObjectURL(file),
    })
    setStorageError('')
  }

  const clearPendingAttachment = () => {
    if (isSendingMessage) return
    setPendingAttachment(null)
  }

  const toggleRecording = async () => {
    if (recorderRef.current) {
      recorderRef.current.stop()
      return
    }

    if (!currentUser || !activeFriend || isRequestingRecording || isSendingMessage || isSendingVoice || pendingAttachment) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStorageError('Voice messages are not supported by this browser.')
      return
    }

    setIsRequestingRecording(true)
    const requestId = ++recordingRequestRef.current
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (requestId !== recordingRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      recordingStreamRef.current = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported?.(type))
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      const chunks = []
      const recipient = activeFriend
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
        if (chunks.reduce((total, chunk) => total + chunk.size, 0) > MAX_VOICE_MESSAGE_SIZE) {
          setStorageError('Voice messages must be 1 MB or smaller. Please record a shorter message.')
          if (recorder.state !== 'inactive') recorder.stop()
        }
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (recordingStreamRef.current === stream) recordingStreamRef.current = null
        recorderRef.current = null
        setIsRecording(false)
        const audio = new Blob(chunks, {
          type: recorder.mimeType || chunks[0]?.type || 'audio/webm',
        })
        if (audio.size > MAX_VOICE_MESSAGE_SIZE) {
          setStorageError('Voice messages must be 1 MB or smaller. Please record a shorter message.')
          return
        }
        if (!audio.size || !currentUser || !recipient) return

        const extension = audio.type.includes('mp4') ? 'm4a' : 'webm'
        const voiceFile = new File([audio], `voice-message.${extension}`, { type: audio.type })
        setIsSendingVoice(true)
        sendAttachmentMessage({
          sender: currentUser,
          recipient,
          file: voiceFile,
          messageType: 'audio',
        }).then(() => {
          setStorageError('')
        }).catch((error) => {
          setStorageError(getAccountErrorMessage(error))
        }).finally(() => {
          setIsSendingVoice(false)
        })
      }
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (recordingStreamRef.current === stream) recordingStreamRef.current = null
        recorderRef.current = null
        setIsRecording(false)
        setStorageError('Recording failed. Check your microphone and try again.')
      }
      recorder.start(1000)
      setStorageError('')
      setIsRecording(true)
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      if (recordingStreamRef.current === stream) recordingStreamRef.current = null
      recorderRef.current = null
      if (requestId === recordingRequestRef.current) {
        setIsRecording(false)
        setStorageError(error.name === 'NotAllowedError'
          ? 'Allow microphone access in your browser settings, then try again.'
          : error.message || 'Microphone access failed. Check your device and try again.')
      }
    } finally {
      if (requestId === recordingRequestRef.current) setIsRequestingRecording(false)
    }
  }

  const handleSignOut = async () => {
    try {
      if (notificationsEnabled) await disablePushNotifications(currentUser.uid)
      await signOut(auth)
      window.location.assign('/login')
    } catch (error) {
      setStorageError(getAccountErrorMessage(error))
    }
  }

  const searchWithDegigAi = (event) => {
    event.preventDefault()
    if (isAiThinking) return
    const query = aiQuery.trim()
    if (!query) {
      setAiError('Enter something you would like to search for.')
      return
    }

    const history = aiMessages.slice(-10).map(({ role, text }) => ({ role, text }))
    if (history[0]?.role === 'assistant') history.shift()
    const userMessageId = crypto.randomUUID()
    setAiMessages((messages) => [...messages, { id: userMessageId, role: 'user', text: query }])
    setAiQuery('')
    setAiError('')
    setIsAiThinking(true)
    askDegigAi({ prompt: query, history })
      .then((answer) => {
        setAiMessages((messages) => [
          ...messages,
          { id: crypto.randomUUID(), role: 'assistant', text: answer },
        ])
      })
      .catch((error) => {
        setAiMessages((messages) => messages.filter((message) => message.id !== userMessageId))
        setAiQuery(query)
        setAiError(getAccountErrorMessage(error))
      })
      .finally(() => setIsAiThinking(false))
  }

  useEffect(() => {
    aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [aiMessages, isAiThinking])

  useEffect(() => () => {
    recordingRequestRef.current += 1
    recorderRef.current?.stop()
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
  }, [])

  if (!currentUser) {
    return (
      <main className="chat-page">
        <p className={storageError ? 'chat-error' : 'chat-loading'} role={storageError ? 'alert' : 'status'}>
          {storageError || (isAuthLoading ? 'Opening Degig…' : 'Redirecting to sign in…')}
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
          <span className="chat-profile-name">{currentUser.name}</span>
          <button
            className="chat-signout"
            type="button"
            onClick={handleEnableNotifications}
            disabled={notificationsEnabled || isEnablingNotifications}
            title={notificationsEnabled ? 'Notifications are enabled on this device' : 'Enable message notifications on this device'}
          >
            {isEnablingNotifications ? 'Enabling…' : notificationsEnabled ? 'Notifications on' : 'Enable alerts'}
          </button>
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
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className={`chat-workspace ${mobileSectionOpen ? 'chat-workspace-mobile-open' : 'chat-workspace-mobile-picker'}`}>
        <div className="mobile-workspace-hint">
          <h1>Welcome to Degig</h1>
          <p>Choose what you’d like to open.</p>
        </div>
        <nav className="chat-app-nav" aria-label="Degig sections">
          <p className="chat-nav-label">WORKSPACE</p>
          <button
            type="button"
            className={`chat-nav-item ${activeSection === 'messages' ? 'chat-nav-active' : ''}`}
            onClick={() => changeSection('messages')}
            aria-current={activeSection === 'messages' ? 'page' : undefined}
          >
            <span className="chat-nav-icon" aria-hidden="true">✉</span>
            <span className="chat-nav-text">Degig Message</span>
            {totalUnreadMessages > 0 && (
              <span className="chat-nav-unread">{totalUnreadMessages > 99 ? '99+' : totalUnreadMessages}</span>
            )}
          </button>
          <button
            type="button"
            className={`chat-nav-item ${activeSection === 'music' ? 'chat-nav-active' : ''}`}
            onClick={() => changeSection('music')}
            aria-current={activeSection === 'music' ? 'page' : undefined}
          >
            <span className="chat-nav-icon" aria-hidden="true">♫</span>
            <span className="chat-nav-text">Degig Music</span>
          </button>
          <button
            type="button"
            className={`chat-nav-item ${activeSection === 'ai' ? 'chat-nav-active' : ''}`}
            onClick={() => changeSection('ai')}
            aria-current={activeSection === 'ai' ? 'page' : undefined}
          >
            <span className="chat-nav-icon" aria-hidden="true">✦</span>
            <span className="chat-nav-text">Degig AI</span>
          </button>
        </nav>

        <section className="chat-section-view">
          <button
            className="mobile-section-back"
            type="button"
            onClick={() => setMobileSectionOpen(false)}
            aria-label="Back to Degig sections"
          >
            <span aria-hidden="true">←</span>
            <span>All sections</span>
          </button>
          {activeSection === 'ai' ? (
            <section className="ai-chat-panel" aria-label="Degig AI assistant">
              <header className="ai-chat-header">
                <div className="ai-chat-brand">
                  <span className="ai-search-icon" aria-hidden="true">✦</span>
                  <div>
                    <h1>Degig AI</h1>
                    <p>Powered by Gemini · Answers stay in Degig</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="ai-new-chat"
                  onClick={() => {
                    setAiMessages([])
                    setAiQuery('')
                    setAiError('')
                  }}
                  disabled={isAiThinking}
                >
                  New chat
                </button>
              </header>
              <div className="ai-chat-history" aria-live="polite">
                {aiMessages.length === 0 ? (
                  <div className="ai-welcome">
                    <span className="ai-welcome-icon" aria-hidden="true">✦</span>
                    <h2>How can I help?</h2>
                    <p>Ask a question and get an answer without leaving Degig.</p>
                    <div className="ai-prompt-suggestions">
                      {[
                        'Explain a difficult idea simply',
                        'Help me write a professional message',
                        'Give me ideas for a project',
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setAiQuery(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : aiMessages.map((message) => (
                  <article
                    className={`ai-message ai-message-${message.role}`}
                    key={message.id}
                  >
                    {message.role === 'assistant' && (
                      <span className="ai-message-icon" aria-hidden="true">✦</span>
                    )}
                    <p>{message.text}</p>
                  </article>
                ))}
                {isAiThinking && (
                  <p className="ai-thinking" role="status">Degig AI is thinking…</p>
                )}
                <div ref={aiMessagesEndRef} />
              </div>
              {aiError && <p className="ai-chat-error" role="alert">{aiError}</p>}
              <form className="ai-chat-compose" onSubmit={searchWithDegigAi}>
                <label className="sr-only" htmlFor="ai-chat-query">Message Degig AI</label>
                <textarea
                  id="ai-chat-query"
                  rows="1"
                  maxLength={2000}
                  placeholder="Message Degig AI…"
                  value={aiQuery}
                  onChange={(event) => setAiQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                  disabled={isAiThinking}
                />
                <button type="submit" disabled={isAiThinking || !aiQuery.trim()}>
                  {isAiThinking ? 'Thinking…' : 'Send'}
                </button>
              </form>
              <p className="ai-disclaimer">AI can make mistakes. Don’t share passwords or private information.</p>
            </section>
          ) : activeSection === 'music' ? (
            <section className="chat-layout chat-layout-music" aria-label="Degig Music">
              <Music />
            </section>
          ) : (
            <section className={`chat-layout ${mobileConversationOpen ? 'chat-layout-mobile-conversation' : ''}`} aria-label="Degig messaging">
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
                  disabled={isSearching || isSendingMessage || isSendingVoice || isRecording || isRequestingRecording}
                />
                <button
                  type="submit"
                  disabled={isSearching || isSendingMessage || isSendingVoice || isRecording || isRequestingRecording}
                >
                  {isSearching ? 'Searching…' : 'Search'}
                </button>
                {searchError && <p className="chat-error" role="alert">{searchError}</p>}
              </form>

              <section className="chat-inbox" aria-label="Recent conversations">
                <h2>Recent chats</h2>
                {isInboxLoading ? (
                  <p className="chat-inbox-empty">Loading chats…</p>
                ) : inboxConversations.length === 0 ? (
                  <p className="chat-inbox-empty">Chats will appear here when someone sends a message.</p>
                ) : (
                  <div className="chat-inbox-list">
                    {inboxConversations.map((inboxConversation) => {
                      const friendUid = inboxConversation.participants.find((uid) => uid !== currentUser.uid)
                      const friendHandle = inboxConversation.handles?.[friendUid] || 'Degig user'
                      const unreadCount = inboxConversation.unreadCounts?.[currentUser.uid] || 0
                      return (
                        <button
                          key={inboxConversation.id}
                          type="button"
                          className={`chat-inbox-item ${activeConversationId === inboxConversation.id ? 'chat-inbox-item-active' : ''}`}
                          onClick={() => openInboxConversation(inboxConversation)}
                          aria-current={activeConversationId === inboxConversation.id ? 'true' : undefined}
                        >
                          <span className="chat-inbox-avatar" aria-hidden="true">
                            {friendHandle.replace(/^@/, '').charAt(0).toUpperCase() || '?'}
                          </span>
                          <span className="chat-inbox-details">
                            <strong>{friendHandle}</strong>
                            <small>{inboxConversation.lastMessage || 'Start a conversation'}</small>
                          </span>
                          {unreadCount > 0 && (
                            <span className="chat-inbox-unread" aria-label={`${unreadCount} unread messages`}>
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

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
              <p className="chat-local-note">
                Messages and attachments sync across devices.
              </p>
            </aside>

            <section className="chat-conversation" aria-label="Conversation">
              {activeFriend ? (
                <>
                  <header className="conversation-header">
                    <button
                      type="button"
                      className="mobile-conversation-back"
                      onClick={() => setMobileConversationOpen(false)}
                      aria-label="Back to conversations"
                    >
                      <span aria-hidden="true">←</span>
                      <span>Chats</span>
                    </button>
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
                        className={`message-bubble ${message.senderId === currentUser.uid ? 'message-own' : ''}`}
                        key={message.id}
                      >
                        {message.messageType === 'audio' && (
                          <audio controls preload="metadata" src={message.mediaUrl}>
                            Your browser cannot play this voice message.
                          </audio>
                        )}
                        {message.messageType === 'image' && (
                          <img className="message-media" src={message.mediaUrl} alt={message.mediaName || 'Image attachment'} />
                        )}
                        {message.messageType === 'video' && (
                          <video className="message-media" controls playsInline preload="metadata" src={message.mediaUrl}>
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
                  {pendingAttachment && (
                    <div className="attachment-preview">
                      {pendingAttachment.mediaType === 'image' ? (
                        <img src={pendingAttachment.previewUrl} alt="Selected image preview" />
                      ) : (
                        <video src={pendingAttachment.previewUrl} controls muted playsInline />
                      )}
                      <div className="attachment-preview-details">
                        <strong>{pendingAttachment.file.name}</strong>
                        <small>{formatFileSize(pendingAttachment.file.size)} · Ready to send</small>
                      </div>
                      <button
                        type="button"
                        className="attachment-preview-remove"
                        onClick={clearPendingAttachment}
                        disabled={isSendingMessage}
                        aria-label="Remove selected attachment"
                        title="Remove attachment"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {isSendingMessage && pendingAttachment && (
                    <p className="attachment-upload-status" role="status">
                      Uploading {pendingAttachment.mediaType}… {uploadProgress}%
                    </p>
                  )}
                  <form className="conversation-compose" onSubmit={sendMessage}>
                    <input
                      type="text"
                      aria-label="Write a message"
                      placeholder={pendingAttachment ? 'Add a caption…' : 'Write a message…'}
                      value={messageText}
                      maxLength={10000}
                      disabled={isSendingMessage || isSendingVoice}
                      onChange={(event) => setMessageText(event.target.value)}
                    />
                    <input
                      ref={mediaInputRef}
                      className="media-file-input"
                      type="file"
                      accept="image/*,video/*"
                      aria-label="Choose a photo or video to send"
                      onChange={selectMedia}
                    />
                    <button
                      type="button"
                      className="media-message-button"
                      onClick={() => mediaInputRef.current?.click()}
                      disabled={isSendingMessage || isSendingVoice || isRecording || isRequestingRecording}
                      aria-label="Add a photo or video"
                      title="Add a photo or video (up to 10 MB)"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className={`voice-message-button ${isRecording ? 'voice-message-recording' : ''}`}
                      onClick={toggleRecording}
                      disabled={isRequestingRecording || isSendingMessage || isSendingVoice || Boolean(pendingAttachment)}
                      aria-label={isRecording ? 'Stop recording voice message' : isSendingVoice ? 'Sending voice message' : 'Record voice message'}
                      title={isRecording ? 'Stop recording and send' : isSendingVoice ? 'Sending voice message' : 'Record a voice message'}
                      aria-pressed={isRecording}
                    >
                      {isRequestingRecording || isSendingVoice ? '…' : isRecording ? '■' : '🎙'}
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingMessage || isSendingVoice || isRecording || (!messageText.trim() && !pendingAttachment)}
                    >
                      {isSendingMessage ? 'Sending…' : 'Send'}
                    </button>
                  </form>
                  {(isRecording || isSendingVoice) && (
                    <p className="voice-recording-status" role="status">
                      {isRecording
                        ? 'Recording voice message. Tap the microphone button to send.'
                        : 'Uploading voice message…'}
                    </p>
                  )}
                </>
              ) : (
                <div className="conversation-welcome">
                  <img src="/degig-logo.svg" alt="" />
                  <h2>Your conversations start here</h2>
                  <p>Search for a friend using their Degig handle.</p>
                  <button
                    className="voice-message-placeholder-button"
                    type="button"
                    disabled
                    aria-label="Choose a friend before recording a voice message"
                    title="Choose a friend before recording"
                  >
                    🎙
                  </button>
                  <p className="voice-message-placeholder-hint">
                    Search for a friend to enable voice messages.
                  </p>
                </div>
              )}
            </section>
          </section>
          )}
        </section>
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
              <p className="profile-hint">Photos are limited to 300 KB. Your profile is shared across devices.</p>
              {profileError && <p className="chat-error" role="alert">{profileError}</p>}
              <button className="profile-save-button" type="submit">Save changes</button>
            </form>
          </aside>
        </div>
      )}
      {storageError && <p className="chat-toast" role="alert">{storageError}</p>}
      {notificationToast && <p className="chat-toast chat-notification-toast" role="status">{notificationToast}</p>}
    </main>
  )
}

export default Chat

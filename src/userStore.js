export const USERS_KEY = 'Degig_user'
export const CURRENT_USER_KEY = 'Degig_current_user'
export const MESSAGES_KEY = 'Degig_messages'

export const normalizeHandle = (handle) => handle.trim().toLowerCase().replace(/^@/, '')

export const isValidHandle = (handle) => /^@[a-z0-9_]{3,20}$/i.test(handle.trim())

const readArray = (key, label) => {
  const saved = localStorage.getItem(key)
  if (!saved) return []

  const parsed = JSON.parse(saved)
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} data is invalid. Please clear the app's saved data and try again.`)
  }
  return parsed
}

export const getUsers = () => readArray(USERS_KEY, 'Account')

export const saveUsers = (users) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export const saveCurrentUser = (user) => {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
}

export const getCurrentUser = () => {
  const saved = localStorage.getItem(CURRENT_USER_KEY)
  if (!saved) return null

  const user = JSON.parse(saved)
  if (!user || typeof user.handle !== 'string') {
    throw new Error('Your saved sign-in is invalid. Please sign in again.')
  }
  return user
}

export const getMessages = () => readArray(MESSAGES_KEY, 'Chat')

export const saveMessages = (messages) => {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
}

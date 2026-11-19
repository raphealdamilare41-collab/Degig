import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signOut,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore'
import { auth, db, firebaseConfigError } from './Firebase.js'

export const normalizeHandle = (handle = '') =>
  String(handle).trim().toLowerCase().replace(/^@/, '')

export const isValidHandle = (handle) => /^@[a-z0-9_]{3,20}$/i.test(handle.trim())

const requireFirebase = () => {
  if (!auth || !db) throw new Error(firebaseConfigError || 'Firebase is unavailable.')
}

export const getAccountErrorMessage = (error) => {
  const messages = {
    'auth/email-already-in-use': 'An account already uses that email address.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/user-not-found': 'No account was found with that email address.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
    'auth/operation-not-allowed': 'Email sign-in is disabled in Firebase. Enable the Email/Password provider and try again.',
    'auth/unauthorized-domain': 'This site is not authorized in Firebase. Add its domain under Authentication → Authorized domains.',
    'auth/invalid-api-key': 'The Firebase API key is invalid. Check the VITE_FIREBASE_API_KEY setting.',
    'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
    'permission-denied': 'Firebase blocked this request. Make sure Firestore is enabled and its security rules are deployed.',
    'storage/unauthorized': 'Firebase Storage blocked the upload. Enable Storage and deploy storage.rules.',
    'storage/quota-exceeded': 'Firebase Storage is over its current quota.',
    'storage/retry-limit-exceeded': 'The upload could not finish. Check your connection and try again.',
    'unavailable': 'Firebase is temporarily unavailable. Check your connection and try again.',
  }
  const code = typeof error?.code === 'string' ? error.code : ''
  if (code.includes('api-key-not-valid')) {
    return 'Firebase rejected the API key. Check VITE_FIREBASE_API_KEY in .env and use the Web API key from the same Firebase project.'
  }
  return messages[code] || error?.message || 'Something went wrong. Please try again.'
}

export const createAccount = async ({ email, password, name, handle }) => {
  requireFirebase()
  const normalizedHandle = `@${normalizeHandle(handle)}`
  const displayName = name.trim()

  if (!displayName || displayName.length > 60) {
    throw new Error('Enter a name between 1 and 60 characters.')
  }
  if (!isValidHandle(normalizedHandle)) {
    throw new Error('Enter a valid @handle (3–20 letters, numbers, or underscores).')
  }
  if (password.length < 6) {
    throw new Error('Use a password with at least 6 characters.')
  }

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
  const handleKey = normalizeHandle(normalizedHandle)
  const userRef = doc(db, 'users', credential.user.uid)
  const handleRef = doc(db, 'handles', handleKey)

  try {
    await runTransaction(db, async (transaction) => {
      const handleSnapshot = await transaction.get(handleRef)
      if (handleSnapshot.exists()) throw new Error('That handle is already taken. Please choose another one.')

      transaction.set(handleRef, { uid: credential.user.uid, handleKey })
      transaction.set(userRef, {
        uid: credential.user.uid,
        handle: normalizedHandle,
        handleKey,
        name: displayName,
        image: '',
        createdAt: Date.now(),
      })
    })
  } catch (error) {
    try {
      await deleteUser(credential.user)
    } catch (cleanupError) {
      throw new Error(
        `Account setup failed: ${getAccountErrorMessage(error)} The temporary sign-in could not be removed: ${getAccountErrorMessage(cleanupError)}`,
        { cause: cleanupError },
      )
    }
    throw error
  }

  return {
    uid: credential.user.uid,
    handle: normalizedHandle,
    handleKey,
    name: displayName,
    image: '',
  }
}

export const signInAccount = async ({ email, password }) => {
  requireFirebase()
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password)

  try {
    return await getUserProfile(credential.user.uid)
  } catch (error) {
    const message = getAccountErrorMessage(error)
    await signOut(auth)
    throw new Error(message, { cause: error })
  }
}

export const sendAccountPasswordReset = async (email) => {
  requireFirebase()
  if (!email.trim()) throw new Error('Enter your email address first.')
  try {
    await sendPasswordResetEmail(auth, email.trim())
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return
    throw error
  }
}

export const getUserProfile = async (uid) => {
  requireFirebase()
  const userSnapshot = await getDoc(doc(db, 'users', uid))
  if (!userSnapshot.exists()) {
    throw new Error('Your account profile was not found. Contact support before creating another account.')
  }

  return userSnapshot.data()
}

export const findUserByHandle = async (handle) => {
  requireFirebase()
  const handleKey = normalizeHandle(handle)
  const handleSnapshot = await getDoc(doc(db, 'handles', handleKey))
  if (!handleSnapshot.exists()) return null

  const profile = await getUserProfile(handleSnapshot.data().uid)
  if (profile.handleKey !== handleKey) {
    throw new Error('The account directory is inconsistent. Please try again later.')
  }
  return profile
}

export const updateUserProfile = async (uid, { name, image }) => {
  requireFirebase()
  const displayName = name.trim()
  if (!displayName || displayName.length > 60) {
    throw new Error('Enter a name between 1 and 60 characters.')
  }
  if (typeof image !== 'string' || image.length > 450000) {
    throw new Error('Profile photos must be 300 KB or smaller.')
  }

  await setDoc(doc(db, 'users', uid), {
    name: displayName,
    image,
    updatedAt: Date.now(),
  }, { merge: true })

  const profile = await getUserProfile(uid)
  return { ...profile, name: displayName, image }
}


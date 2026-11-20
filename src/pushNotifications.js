import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging'
import { db, firebaseApp, firebaseConfig } from './Firebase.js'

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

const requirePushEnvironment = () => {
  if (!db || !firebaseApp) throw new Error('Firebase must be configured before enabling notifications.')
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Push notifications are not supported by this browser.')
  }
  if (!vapidKey) {
    throw new Error('Add VITE_FIREBASE_VAPID_KEY from Firebase Console to enable push notifications.')
  }
}

const getMessagingRegistration = async () => {
  const workerUrl = new URL('/firebase-messaging-sw.js', window.location.origin)
  Object.entries(firebaseConfig).forEach(([key, value]) => {
    if (value) workerUrl.searchParams.set(key, value)
  })
  return navigator.serviceWorker.register(workerUrl.href, { scope: '/' })
}

const getTokenDocumentId = async (token) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const enablePushNotifications = async (userId) => {
  requirePushEnvironment()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked. Allow them in your browser site settings.'
      : 'Allow notifications to receive Degig message alerts.')
  }
  if (!(await isSupported())) throw new Error('Push notifications are not supported by this browser.')

  const serviceWorkerRegistration = await getMessagingRegistration()
  const messaging = getMessaging(firebaseApp)
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  })
  if (!token) throw new Error('Firebase did not create a notification token for this device.')

  const tokenId = await getTokenDocumentId(token)
  await setDoc(doc(db, 'users', userId, 'deviceTokens', tokenId), {
    token,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  return messaging
}

export const disablePushNotifications = async (userId) => {
  requirePushEnvironment()
  const messaging = getMessaging(firebaseApp)
  const registration = await navigator.serviceWorker.getRegistration()
  if (registration) {
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
    if (token) {
      const tokenId = await getTokenDocumentId(token)
      await deleteDoc(doc(db, 'users', userId, 'deviceTokens', tokenId))
    }
  }
  await deleteToken(messaging)
}

export const subscribeToPushMessages = async (onNotification) => {
  if (!firebaseApp || !(await isSupported())) return () => {}
  const unsubscribe = onMessage(getMessaging(firebaseApp), (payload) => {
    onNotification(payload)
  })
  return unsubscribe
}

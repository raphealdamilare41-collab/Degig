import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage'
import { db, storage } from './Firebase.js'

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
export const MAX_VOICE_MESSAGE_SIZE = 1024 * 1024

export const getConversationId = (firstUserId, secondUserId) =>
  [firstUserId, secondUserId].sort().join('_')

const getConversationDetails = (senderId, recipientId) => {
  const participants = [senderId, recipientId].sort()
  return {
    participants,
    conversationId: getConversationId(senderId, recipientId),
  }
}

const requireChatServices = () => {
  if (!db || !storage) {
    throw new Error('Firebase Firestore and Storage must be configured before using chat.')
  }
}

const getMessageFields = (sender, recipient) => ({
  ...getConversationDetails(sender.uid, recipient.uid),
  senderId: sender.uid,
  recipientId: recipient.uid,
  senderHandle: sender.handle,
  recipientHandle: recipient.handle,
})

export const subscribeToConversation = (sender, recipient, onMessages, onError) => {
  requireChatServices()
  const { conversationId } = getConversationDetails(sender.uid, recipient.uid)
  const messagesQuery = query(
    collection(db, 'messages'),
    where('conversationId', '==', conversationId),
    where('participants', 'array-contains', sender.uid),
    orderBy('createdAt', 'asc'),
  )

  return onSnapshot(messagesQuery, (snapshot) => {
    const messages = snapshot.docs
      .map((messageSnapshot) => {
        const message = messageSnapshot.data({ serverTimestamps: 'estimate' })
        const createdAt = message.createdAt?.toDate?.().toISOString() || new Date().toISOString()
        return { ...message, id: messageSnapshot.id, createdAt }
      })
      .filter((message) => message.status === 'sent')
    onMessages(messages)
  }, onError)
}

export const subscribeToInbox = (userId, onConversations, onError) => {
  requireChatServices()
  const inboxQuery = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc'),
  )

  return onSnapshot(inboxQuery, (snapshot) => {
    onConversations(snapshot.docs.map((conversationSnapshot) => {
      const conversation = conversationSnapshot.data()
      return {
        ...conversation,
        id: conversationSnapshot.id,
        lastMessageAt: conversation.lastMessageAt?.toDate?.().toISOString() || '',
      }
    }))
  }, onError)
}

export const markConversationRead = async (conversationId, userId) => {
  requireChatServices()
  await updateDoc(doc(db, 'conversations', conversationId), {
    [`unreadCounts.${userId}`]: 0,
  })
}

export const sendTextMessage = async (sender, recipient, text) => {
  requireChatServices()
  const messageText = text.trim()
  if (!messageText || messageText.length > 10000) {
    throw new Error('Text messages must contain 1–10,000 characters.')
  }

  await setDoc(doc(collection(db, 'messages')), {
    ...getMessageFields(sender, recipient),
    messageType: 'text',
    status: 'sent',
    text: messageText,
    createdAt: serverTimestamp(),
  })
}

export const sendAttachmentMessage = async ({
  sender,
  recipient,
  file,
  messageType,
  text = '',
  onProgress,
}) => {
  requireChatServices()
  const allowedTypes = {
    image: file.type.startsWith('image/'),
    video: file.type.startsWith('video/'),
    audio: file.type.startsWith('audio/'),
  }
  if (!allowedTypes[messageType]) {
    throw new Error('Choose a supported image, video, or audio file.')
  }

  const sizeLimit = messageType === 'audio' ? MAX_VOICE_MESSAGE_SIZE : MAX_ATTACHMENT_SIZE
  if (!file.size || file.size > sizeLimit) {
    throw new Error(messageType === 'audio'
      ? 'Voice messages must be 1 MB or smaller.'
      : 'Photos and videos must be 10 MB or smaller.')
  }

  const messageRef = doc(collection(db, 'messages'))
  const { conversationId } = getConversationDetails(sender.uid, recipient.uid)
  const mediaPath = `chat-media/${sender.uid}/${conversationId}/${messageRef.id}`
  const storageRef = ref(storage, mediaPath)
  const mediaName = (file.name || `voice-message.${messageType}`).slice(0, 255)
  const messageFields = {
    ...getMessageFields(sender, recipient),
    messageType,
    status: 'uploading',
    mediaPath,
    mediaName,
    mediaSize: file.size,
    mediaContentType: file.type,
    createdAt: serverTimestamp(),
  }
  const caption = text.trim()
  if (caption) messageFields.text = caption

  await setDoc(messageRef, messageFields)

  try {
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type })
    await new Promise((resolve, reject) => {
      uploadTask.on('state_changed', (snapshot) => {
        if (snapshot.totalBytes) {
          onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
        }
      }, reject, resolve)
    })

    const mediaUrl = await getDownloadURL(storageRef)
    await updateDoc(messageRef, { mediaUrl, status: 'sent' })
  } catch (error) {
    const cleanupErrors = []
    try {
      await deleteObject(storageRef)
    } catch (cleanupError) {
      if (cleanupError.code !== 'storage/object-not-found') cleanupErrors.push(cleanupError)
    }
    try {
      await deleteDoc(messageRef)
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError)
    }

    if (cleanupErrors.length) {
      const cleanupMessage = cleanupErrors.map((cleanupError) => cleanupError.message).join('; ')
      throw new Error(`Attachment send failed: ${error.message}. Cleanup failed: ${cleanupMessage}`, {
        cause: error,
      })
    }
    throw error
  }
}

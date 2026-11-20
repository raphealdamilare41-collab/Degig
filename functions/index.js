const { initializeApp } = require('firebase-admin/app')
const { FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { logger } = require('firebase-functions')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { defineSecret } = require('firebase-functions/params')
const { HttpsError, onCall } = require('firebase-functions/v2/https')

initializeApp()

const db = getFirestore()
const geminiApiKey = defineSecret('GEMINI_API_KEY')
const leaseDurationMs = 5 * 60 * 1000

const getMessagePreview = (message) => {
  if (message.messageType === 'image') return 'Sent a photo'
  if (message.messageType === 'video') return 'Sent a video'
  if (message.messageType === 'audio') return 'Sent a voice message'
  return String(message.text || 'New message').slice(0, 120)
}

const updateConversationSummary = async (messageId, message) => {
  const deliveryRef = db.collection('messageDeliveries').doc(messageId)
  const conversationRef = db.collection('conversations').doc(message.conversationId)
  const now = Date.now()

  return db.runTransaction(async (transaction) => {
    const deliverySnapshot = await transaction.get(deliveryRef)
    const delivery = deliverySnapshot.data() || {}
    if (delivery.status === 'sent') return false
    if (delivery.leaseUntil?.toMillis() > now) {
      throw new Error('Another notification attempt is still processing this message.')
    }

    if (!delivery.summaryUpdated) {
      const conversationSnapshot = await transaction.get(conversationRef)
      const conversation = conversationSnapshot.data() || {}
      const participants = [message.senderId, message.recipientId].sort()
      const unreadCounts = { ...conversation.unreadCounts }
      unreadCounts[message.senderId] = unreadCounts[message.senderId] || 0
      unreadCounts[message.recipientId] = (unreadCounts[message.recipientId] || 0) + 1
      const messageTime = message.createdAt || FieldValue.serverTimestamp()
      const currentMessageTime = conversation.lastMessageAt
      const isNewest = !currentMessageTime
        || (message.createdAt?.toMillis?.() || Date.now()) >= currentMessageTime.toMillis()
      const preview = getMessagePreview(message)

      if (isNewest) {
        transaction.set(conversationRef, {
          participants,
          handles: {
            [message.senderId]: message.senderHandle,
            [message.recipientId]: message.recipientHandle,
          },
          lastMessageAt: messageTime,
          lastMessage: preview,
          lastMessageType: message.messageType,
          lastMessageSenderId: message.senderId,
          unreadCounts,
        }, { merge: true })
      } else {
        transaction.set(conversationRef, { participants, unreadCounts }, { merge: true })
      }
    }

    transaction.set(deliveryRef, {
      status: 'sending',
      summaryUpdated: true,
      leaseUntil: Timestamp.fromMillis(now + leaseDurationMs),
    }, { merge: true })
    return true
  })
}

const sendPushNotifications = async (messageId, message) => {
  const tokenSnapshot = await db.collection('users')
    .doc(message.recipientId)
    .collection('deviceTokens')
    .get()
  const tokenDocuments = tokenSnapshot.docs
    .map((tokenDocument) => ({ id: tokenDocument.id, token: tokenDocument.get('token') }))
    .filter((device) => typeof device.token === 'string' && device.token.length > 0)
  const deliveryRef = db.collection('messageDeliveries').doc(messageId)

  if (!tokenDocuments.length) {
    await deliveryRef.set({
      status: 'sent',
      leaseUntil: FieldValue.delete(),
    }, { merge: true })
    return
  }

  const preview = getMessagePreview(message)
  const data = {
    messageId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    recipientId: message.recipientId,
    messageType: message.messageType,
    title: message.senderHandle || 'New Degig message',
    body: preview,
  }

  for (let index = 0; index < tokenDocuments.length; index += 500) {
    const batch = tokenDocuments.slice(index, index + 500)
    const response = await getMessaging().sendEachForMulticast({
      tokens: batch.map((device) => device.token),
      data,
    })
    const staleTokenIds = []
    const retryableErrors = []

    response.responses.forEach((result, responseIndex) => {
      if (result.success) return
      const code = result.error?.code || ''
      if (code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token') {
        staleTokenIds.push(batch[responseIndex].id)
      } else {
        retryableErrors.push(result.error || new Error('Firebase Cloud Messaging failed to deliver a notification.'))
      }
    })

    if (staleTokenIds.length) {
      const deleteBatch = db.batch()
      staleTokenIds.forEach((tokenId) => {
        deleteBatch.delete(db.collection('users').doc(message.recipientId)
          .collection('deviceTokens').doc(tokenId))
      })
      await deleteBatch.commit()
    }

    if (retryableErrors.length) {
      await deliveryRef.set({
        status: 'pending',
        leaseUntil: FieldValue.delete(),
      }, { merge: true })
      logger.error('Push delivery failed for one or more devices.', {
        messageId,
        failureCount: retryableErrors.length,
      })
      throw retryableErrors[0]
    }
  }

  await deliveryRef.set({
    status: 'sent',
    leaseUntil: FieldValue.delete(),
  }, { merge: true })
}

exports.deliverMessageNotifications = onDocumentWritten({
  document: 'messages/{messageId}',
  retry: true,
}, async (event) => {
  const before = event.data?.before
  const after = event.data?.after
  if (!after?.exists) return

  const message = after.data()
  if (message.status !== 'sent' || (before?.exists && before.data().status === 'sent')) return
  if (!message.senderId || !message.recipientId || !message.conversationId) {
    logger.error('Cannot notify for a message with incomplete routing data.', {
      messageId: event.params.messageId,
    })
    return
  }

  const claimed = await updateConversationSummary(event.params.messageId, message)
  if (!claimed) return
  try {
    await sendPushNotifications(event.params.messageId, message)
  } catch (error) {
    await db.collection('messageDeliveries').doc(event.params.messageId).set({
      status: 'pending',
      leaseUntil: FieldValue.delete(),
    }, { merge: true })
    throw error
  }
})

exports.askDegigAi = onCall({
  secrets: [geminiApiKey],
  timeoutSeconds: 60,
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to use Degig AI.')

  const prompt = request.data?.prompt
  const history = request.data?.history || []
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().length > 2000) {
    throw new HttpsError('invalid-argument', 'Enter a prompt of up to 2,000 characters.')
  }
  if (!Array.isArray(history) || history.length > 10 || history.some((entry) => (
    !entry
    || !['user', 'assistant'].includes(entry.role)
    || typeof entry.text !== 'string'
    || !entry.text.trim()
    || entry.text.length > 2000
  ))) {
    throw new HttpsError('invalid-argument', 'The conversation history is invalid. Start a new chat and try again.')
  }

  const rateLimitRef = db.collection('aiRateLimits').doc(request.auth.uid)
  const now = Date.now()
  const canSend = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateLimitRef)
    const windowStartedAt = snapshot.get('windowStartedAt')?.toMillis?.() || 0
    const requestCount = now - windowStartedAt < 60_000 ? snapshot.get('requestCount') || 0 : 0
    if (requestCount >= 10) return false
    transaction.set(rateLimitRef, {
      windowStartedAt: now - windowStartedAt < 60_000 ? snapshot.get('windowStartedAt') : Timestamp.fromMillis(now),
      requestCount: requestCount + 1,
    })
    return true
  })
  if (!canSend) throw new HttpsError('resource-exhausted', 'Degig AI is busy for your account. Wait a minute and try again.')

  const contents = history.map((entry) => ({
    role: entry.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: entry.text.trim() }],
  }))
  contents.push({ role: 'user', parts: [{ text: prompt.trim() }] })

  let response
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey.value(),
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: 'You are Degig AI, a helpful assistant inside the Degig messaging app. Be clear, friendly, accurate, and concise. If you are unsure, say so.',
          }],
        },
        contents,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(50_000),
    })
  } catch (error) {
    logger.error('Gemini request failed.', { uid: request.auth.uid, error: error.message })
    throw new HttpsError('unavailable', 'Degig AI could not connect right now. Please try again.')
  }

  if (!response.ok) {
    logger.error('Gemini rejected an AI request.', { uid: request.auth.uid, status: response.status })
    if (response.status === 401 || response.status === 403) {
      throw new HttpsError('failed-precondition', 'The Gemini API key is invalid or does not have access to this model.')
    }
    if (response.status === 429) {
      throw new HttpsError('resource-exhausted', 'Gemini is temporarily rate-limited. Please try again shortly.')
    }
    throw new HttpsError('unavailable', 'Degig AI is temporarily unavailable. Please try again.')
  }

  const result = await response.json()
  const answer = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim()
  if (!answer) {
    throw new HttpsError('unavailable', 'Gemini could not answer that prompt. Please try rephrasing it.')
  }
  return { answer }
})

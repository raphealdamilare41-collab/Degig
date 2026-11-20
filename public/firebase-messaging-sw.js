importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js')

const firebaseConfig = Object.fromEntries(new URLSearchParams(self.location.search))
firebase.initializeApp(firebaseConfig)

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const conversationId = payload.data?.conversationId || ''
  const title = payload.data?.title || 'New Degig message'

  return self.registration.showNotification(title, {
    body: payload.data?.body || 'You have a new message.',
    data: { conversationId },
    tag: conversationId ? `degig-${conversationId}` : undefined,
    icon: '/degig-logo.svg',
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const conversationId = event.notification.data?.conversationId
  const targetUrl = new URL('/chat', self.location.origin)
  if (conversationId) targetUrl.searchParams.set('conversation', conversationId)

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(targetUrl.href)
        return client.focus()
      }
    }
    return self.clients.openWindow(targetUrl.href)
  })())
})

# Degig

## Degig accounts and messaging

Create an account with an email address and a unique handle such as `@oluwa`. Firebase Authentication stores sign-in credentials, and Firestore makes public Degig handles and profiles searchable by other signed-in users across devices. Edit your display name and add a profile photo from the Profile button. Search for an account by handle, then send text, microphone-recorded voice messages, photos, or videos. New messages sync across devices through Firestore; media is uploaded to Firebase Storage. Photos and videos are limited to 10 MB per file, and voice messages to 1 MB. Messages created before cloud chat was enabled remain in the original browser and are not migrated.

### Firebase setup

1. In Firebase Console, enable **Authentication → Email/Password**, add your Vercel domain under **Authorized domains**, and create **Cloud Firestore** and a **Storage** bucket.
2. In Firebase Console **Project settings → Cloud Messaging → Web Push certificates**, generate or copy the key pair. Put its public key in `VITE_FIREBASE_VAPID_KEY`.
3. Cloud Functions require the **Blaze** billing plan; Firebase Storage may also require it and can incur usage charges. Deploy the included rules, indexes, Storage rules, and notification function from the project root, with the Firebase CLI targeting this project: `firebase deploy --only functions,firestore:rules,firestore:indexes,storage`.
4. Copy the Firebase web app configuration into `.env.local` using the keys in `.env.example`. Vite loads this file automatically, and it is ignored by Git. Add the same `VITE_FIREBASE_*` values, including `VITE_FIREBASE_VAPID_KEY`, to the Vercel project's environment variables, then redeploy.

Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey), then from the project folder run `firebase functions:secrets:set GEMINI_API_KEY` and paste the key into the CLI prompt. This key is intentionally not in `.env.example` or Vercel: it must stay private in Firebase Functions secrets. After setting it, deploy with `firebase deploy --only functions`. Gemini API use may incur charges.

Users must select **Enable alerts** in Degig and allow notifications in their browser. The app keeps a recent-chat inbox and unread counts; Firebase Cloud Messaging sends push notifications while the app is in the background. Notifications require HTTPS (localhost is supported for development). On iPhone/iPad, web push requires the site to be installed to the Home Screen and supported by the browser/OS.

The conversation inbox is populated as messages arrive after the notification function is deployed. Existing conversation history is not automatically backfilled; search for the user to reopen an older thread, and it will appear in Recent chats after a new message.

Accounts created before Firebase was connected exist only in that browser and must be created again with an email address to appear in the shared directory. Firebase profile photos are limited to 300 KB. Voice recording requires microphone permission and a secure context such as HTTPS. Firebase Storage usage may require a billing-enabled Firebase plan and can incur charges.

The **Degig AI** section provides an in-app Gemini-powered chat. Its API key is kept in Firebase Functions secrets and requests require a signed-in user; basic per-account request limits help control usage.

## Degig Music (Spotify)

Degig Music is a Spotify-only section in the messaging workspace. Users connect their Spotify account using Spotify's Authorization Code with PKCE flow, then search and play tracks in the Degig page. A Spotify Premium account is required for in-app playback.

1. Create a Spotify app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).
2. Add the exact redirect URI for the local Vite origin, usually `http://localhost:5173/chat`. Add the production origin plus `/chat` when deploying.
3. Copy the Spotify Client ID into a local `.env` file:

   ```env
   VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
   ```

4. Restart the Vite server and open **Degig Music** from the chat sidebar.

The Client ID is public app configuration. Do not put a Spotify Client Secret, private key, or access token in the frontend or commit local `.env` files. OAuth tokens are held in browser session storage. Production deployments should review Spotify's current developer terms, policy, app-mode restrictions, and approval requirements.

Spotify playback is independent of Degig messages. Spotify tracks are not used in status clips; status audio must be uploaded with rights to share it.

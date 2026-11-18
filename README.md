# Degig

## Degig accounts and messaging

Create an account with a unique handle such as `@oluwa`; a phone number is not required. Edit your display name and add a profile photo from the Profile button. Search for other accounts by handle, then send text, microphone-recorded voice messages, photos, or videos. Profile photos and media attachments are limited to 1 MB. Accounts and messages are stored only in the current browser's local storage, so they are not synced across devices or available to other users remotely.

The **Degig AI** section currently opens web results for a search query in a new tab. It does not generate AI answers; an AI service must be connected before that functionality can be offered.

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

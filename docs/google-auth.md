# Google account linking

GuildChat keeps the existing access-code login. Firebase Authentication is used
only as the verified identity layer that links that legacy account to Google.

## Identity contract

- The existing GuildChat `userId` is also the Firebase Authentication UID.
- `authenticateLegacyAccount` verifies the current access code in a Cloud
  Function and returns a short-lived Firebase custom token.
- Profile linking attaches the `google.com` provider to that Firebase user.
- Google login verifies the Google ID token on the server, resolves the already
  linked Firebase provider UID, and returns a custom token for the same
  GuildChat `userId`.
- Email is display-only. It is never used to find or merge accounts.
- No Google-to-user mapping is stored in Realtime Database.

## Firebase and Google Cloud setup

1. Enable **Google** under Firebase Authentication > Sign-in method.
2. Register the SHA-1 fingerprints for every Android signing identity used by
   the app: local debug, EAS preview/production, and Google Play App Signing.
3. Download the refreshed `google-services.json`. It must contain both an
   Android OAuth client for `com.foechat.mobile` and a Web OAuth client with
   `client_type: 3`.
4. Replace both committed configuration copies:
   `google-services.json` and `android/app/google-services.json`.
5. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for the app build to that Web OAuth
   client ID. The value is a public client identifier, not a client secret.
6. Deploy Functions with the `GOOGLE_WEB_CLIENT_ID` parameter set to the exact
   same Web OAuth client ID.
7. Deploy the Functions before distributing the client build, then rebuild the
   native app. This feature is not available in Expo Go.

The committed Google Services files contain the debug Android OAuth client and
the shared Web OAuth client. Add the SHA-1 for every production signing key
(including EAS and Google Play App Signing where applicable), then download and
commit the refreshed files again before distributing that build.

## iOS

The repository currently has no committed iOS native project or
`GoogleService-Info.plist`. Before enabling this flow for an iOS build, register
the iOS Firebase application and bundle ID, add the plist through
`ios.googleServicesFile`, and rebuild through the configured Expo plugin.

## Deployment order

1. Configure the provider, OAuth clients, signing fingerprints, and build env.
2. Deploy `authenticateLegacyAccount`, `getGoogleLinkStatus`,
   `loginWithGoogle`, and `unlinkGoogleAccount`.
3. Ship the native client build.

Existing local sessions continue to open normally. The first link/unlink action
after upgrading asks for the current access code so the app can establish a
server-verifiable Firebase session.

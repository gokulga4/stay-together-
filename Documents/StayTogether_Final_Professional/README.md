# StayTogether

This is the Firebase-only realtime version.

## Local testing without Firebase

If `.env.local` is missing, or `VITE_USE_LOCAL_BACKEND=true` is set, the app
uses a local-only backend backed by this browser's local storage. It includes
sample profiles, a feed post, and a job listing.

Demo credentials:

- Email: `demo@staytogether.local`
- Password: `StayTogether123!`

Local data stays in the current browser and is not shared with Firebase or
other devices. To return to Firebase, add a `.env.local` file using the values
in `.env.example`, then restart the Vite dev server.

## Firebase setup

1. Copy `.env.example` to `.env.local` and fill in your Firebase web app config.
2. Firebase Console → Authentication → Sign-in method → Enable Email/Password.
3. Firebase Console → Firestore Database → Rules.
4. Copy the content of `firestore.rules` and click Publish.
5. Run the app.

The local `.env.local` file is ignored by Git. Vite embeds `VITE_` values in
the browser build, so Firebase web API keys are visible to app users; restrict
the key in Google Cloud where appropriate and secure access with Firebase
Authentication and Firestore Rules. Never put service-account credentials here.

## What this version fixes

- Firebase-backed when configured, with a local browser backend for testing without Firebase.
- Realtime Firestore listeners.
- Login loads existing profile.
- If old profile document ID differs from Firebase Auth UID, app recovers profile by email.
- Logout only signs out. It does not delete profile or app data.
- Firestore rules are adjusted to avoid profile UID mismatch permission errors.

## Commands

```bash
npm install
npm run dev
npm run build
npx cap sync android
npx cap open android
```

## Android APK

Android Studio → Build → Build Bundle(s) / APK(s) → Build APK(s)

# Hub-Mind Android — Private APK Release Guide

## 1. Stable application identity

- **Application ID:** `com.jaystarbliss.hubmind`
- **Version name:** `1.0.0`
- **Version code:** `1`
- **Distribution:** Private APK hosted on the owner's website.
- **Google Play:** Not part of this release plan.

The application ID must not be changed after the first APK has been installed by the owner. Android uses the package ID and signing certificate to recognise updates as the same application.

## 2. Firebase configuration

Register `com.jaystarbliss.hubmind` as an Android app inside the existing Hub-Mind Firebase project. Download its Android-specific `google-services.json` and place it at:

`app/google-services.json`

This file is ignored by Git. Do not commit it. The Android client must use the same Firebase project and named Firestore database as the website.

The Google Services Gradle plugin is applied only when the file exists, allowing a source-only build to compile without the owner's Firebase configuration. Authentication will not work until the configuration is supplied.

## 3. Backend and Gemini

The Android client calls the configured HTTPS base URL (default `https://hub-mind.netlify.app`) at `POST /api/chat`, attaching the current Firebase ID token as a Bearer token.

The Gemini API key must remain in the existing Hub-Mind server/Netlify environment. Never put it in Kotlin source, Gradle BuildConfig, `local.properties`, or the APK.

Gemini Live voice, Firebase conversation sync and cross-device command relay are not yet implemented.

To override the API base URL at build time, provide Gradle property or environment variable:

`HUBMIND_API_BASE_URL=https://your-actual-hubmind-host`

## 4. Release signing

Create an owner-controlled signing key on a secure machine and back it up. Never commit the keystore or passwords.

Example:

```bash
keytool -genkeypair -v -keystore hubmind-release.jks -alias hubmind -keyalg RSA -keysize 2048 -validity 10000
```

Provide these values as local Gradle properties or environment variables:

- `HUBMIND_RELEASE_STORE_FILE`
- `HUBMIND_RELEASE_STORE_PASSWORD`
- `HUBMIND_RELEASE_KEY_ALIAS`
- `HUBMIND_RELEASE_KEY_PASSWORD`

Without all four values, the release variant is intentionally unsigned. Never distribute an unsigned APK and never use Android's public debug keystore as the permanent release signer.

Build from Android Studio or with a locally installed Gradle 8.9+:

```bash
gradle :app:assembleRelease
```

Output:

`app/build/outputs/apk/release/app-release.apk`

The repository currently has no Gradle wrapper files. The GitHub Actions workflow provisions Gradle in its runner; local builds require Android Studio/Gradle installed until a wrapper is added.

## 5. Private update manifest

The updater expects a same-host HTTPS manifest at:

`https://hub-mind.netlify.app/app-version.json`

Example:

```json
{
  "versionCode": 2,
  "versionName": "1.0.1",
  "apkUrl": "https://hub-mind.netlify.app/downloads/hubmind-release.apk",
  "sha256": "64-character-lowercase-sha256-of-the-exact-apk",
  "releaseNotes": "Describe the update.",
  "minSupportedVersionCode": 1
}
```

The APK URL must use HTTPS and the same hostname as `HUBMIND_API_BASE_URL`. The updater checks the SHA-256 digest before offering installation, downloads into app-private storage and uses Android's package installer. The user must authorise installs from Hub-Mind as an unknown app source and confirm installation.

The update checker is a helper and is not yet exposed as a complete Settings UI flow. The website manifest and APK file have not yet been deployed.

## 6. Versioning

Increase `versionCode` for every update. Keep the same application ID and use the exact same signing key. A different signing key will prevent an in-place update over an existing installation.

## 7. Current limitations

A successful APK build or installation does not mean Firebase authentication, live Gemini voice, screenshot capture, conversation sync or cross-device control is operational. See `HUBMIND_ANDROID_TEST_READINESS.md` for the actual feature matrix.

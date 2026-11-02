# Hub-Mind Private APK Release & Update Guide

## 1. Release Configuration Summary

- **Application ID**: `com.aistudio.hubmind.wzyqkp` (Stable, immutable across releases)
- **Version Name**: `2.4.0-native`
- **Version Code**: `240`
- **Target Platform**: Private self-hosted distribution via `https://hub-mind.netlify.app`

---

## 2. In-App Private Update Checker (`HubMindUpdateChecker`)

Hub-Mind includes a native private update checker service:
1. **Manifest Polling**: Checks `https://hub-mind.netlify.app/api/app-version.json`.
2. **Version Comparison**: If `remoteVersionCode > localVersionCode`, prompts user in Settings with release notes.
3. **Verified Download**: Downloads APK to secure cache directory.
4. **Package Installation**: Prompts user via Android's legitimate package installer intent (`ACTION_VIEW` with `application/vnd.android.package-archive`). Data is preserved across seamless upgrades.

---

## 3. Signed APK Creation Instructions

To create the final signed APK using Android Studio / Gradle:

```bash
# 1. Generate release signing key (do not commit to git)
keytool -genkey -v -keystore release.keystore -alias hubmind -keyalg RSA -keysize 2048 -validity 10000

# 2. Build release APK with Gradle
./gradlew assembleRelease
```
The output APK is generated at `app/build/outputs/apk/release/app-release.apk`.

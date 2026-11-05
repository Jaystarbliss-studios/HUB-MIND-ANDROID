package com.example.hubmind.agent

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.JavascriptInterface

/**
 * Narrow bridge from the trusted Hub-Mind web workspace to native Android facilities.
 *
 * It accepts Firebase identity tokens but never returns credentials to JavaScript.
 * Screen capture always opens Android's system consent sheet; the page cannot grant
 * itself screen access or read the screen without a fresh user decision.
 */
class HubMindNativeBridge(
    context: Context,
    private val requestScreenCapture: () -> Unit = {},
    private val stopScreenCapture: () -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val preferences = appContext.getSharedPreferences(
        KEY_PREFERENCES,
        Context.MODE_PRIVATE
    )
    private val transcriptOverlay = JessTranscriptOverlayManager(appContext)

    @JavascriptInterface
    fun onHubMindAuth(userId: String, idToken: String) {
        if (userId.isBlank() || userId.length > 128) return
        if (idToken.isBlank() || idToken.length > 10000) return

        preferences.edit()
            .putString(KEY_USER_ID, userId)
            .putString(KEY_ID_TOKEN, idToken)
            .apply()
    }

    @JavascriptInterface
    fun onHubMindSignOut() {
        preferences.edit()
            .remove(KEY_USER_ID)
            .remove(KEY_ID_TOKEN)
            .apply()
    }

    @JavascriptInterface
    fun getAndroidDeviceId(): String {
        return Settings.Secure.getString(
            appContext.contentResolver,
            Settings.Secure.ANDROID_ID
        )?.takeIf { it.isNotBlank() } ?: "android-device-unavailable"
    }

    @JavascriptInterface
    fun getActiveTargetDeviceId(): String {
        return preferences.getString(KEY_ACTIVE_TARGET_DEVICE_ID, "").orEmpty()
    }

    @JavascriptInterface
    fun onTargetDeviceSelected(deviceId: String) {
        if (deviceId.isBlank() || deviceId.length > 128) return
        preferences.edit().putString(KEY_ACTIVE_TARGET_DEVICE_ID, deviceId).apply()
    }

    @JavascriptInterface
    fun hasTranscriptOverlayPermission(): Boolean = transcriptOverlay.hasPermission

    @JavascriptInterface
    fun onJessTranscript(speaker: String, text: String) {
        if (speaker != "user" && speaker != "jess") return
        if (text.isBlank() || text.length > 12000) return
        transcriptOverlay.show(speaker, text)
    }

    @JavascriptInterface
    fun requestScreenCapture() {
        mainHandler.post {
            try {
                requestScreenCapture.invoke()
            } catch (error: Exception) {
                AndroidScreenShareEvents.emit(
                    AndroidScreenShareEvent("error", error = error.message ?: "Could not request Android screen capture.")
                )
            }
        }
    }

    @JavascriptInterface
    fun stopScreenCapture() {
        mainHandler.post {
            runCatching { stopScreenCapture.invoke() }
        }
    }

    fun close() {
        transcriptOverlay.close()
    }

    companion object {
        const val KEY_PREFERENCES = "hubmind_native_session"
        const val KEY_USER_ID = "userId"
        const val KEY_ID_TOKEN = "idToken"
        const val KEY_ACTIVE_TARGET_DEVICE_ID = "activeTargetDeviceId"
        const val WORKSPACE_HOST = "hub-mind.netlify.app"
    }
}

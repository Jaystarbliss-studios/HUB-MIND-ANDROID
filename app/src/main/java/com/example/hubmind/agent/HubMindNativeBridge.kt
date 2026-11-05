package com.example.hubmind.agent

import android.content.Context
import android.provider.Settings
import android.webkit.JavascriptInterface

/**
 * Narrow bridge from the trusted Hub-Mind web workspace to the native Android agent.
 *
 * The bridge only accepts a Firebase identity token; it never returns credentials to
 * JavaScript. The token is kept in this app's private preferences and is used only by
 * the authenticated device-command foreground service.
 */
class HubMindNativeBridge(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(
        "hubmind_native_session",
        Context.MODE_PRIVATE
    )

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

    companion object {
        const val KEY_PREFERENCES = "hubmind_native_session"
        const val KEY_USER_ID = "userId"
        const val KEY_ID_TOKEN = "idToken"
        const val WORKSPACE_HOST = "hub-mind.netlify.app"
    }
}

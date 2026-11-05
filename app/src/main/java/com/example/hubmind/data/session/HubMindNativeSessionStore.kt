package com.example.hubmind.data.session

import android.webkit.JavascriptInterface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class HubMindSessionCredentials(
    val userId: String,
    val idToken: String
)

/**
 * In-memory only. Firebase ID tokens are never written to SharedPreferences,
 * files, logs or the Android command queue.
 */
object HubMindNativeSessionStore {
    private val _credentials = MutableStateFlow<HubMindSessionCredentials?>(null)
    val credentials: StateFlow<HubMindSessionCredentials?> = _credentials.asStateFlow()

    fun update(userId: String, idToken: String) {
        if (!userId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) return
        if (idToken.isBlank() || idToken.length > 10000) return
        _credentials.value = HubMindSessionCredentials(userId, idToken)
    }

    fun clear() {
        _credentials.value = null
    }
}

/**
 * The only JavaScript-to-native bridge exposed by the trusted Hub-Mind origin.
 * It only passes the currently signed-in Firebase identity to the native
 * command receiver; it cannot execute arbitrary Android actions.
 */
class HubMindAndroidSessionBridge {
    @JavascriptInterface
    fun setSession(userId: String, idToken: String) {
        HubMindNativeSessionStore.update(userId, idToken)
    }

    @JavascriptInterface
    fun clearSession() {
        HubMindNativeSessionStore.clear()
    }
}

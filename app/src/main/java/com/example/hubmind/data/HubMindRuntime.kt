package com.example.hubmind.data

import android.content.Context
import com.example.BuildConfig
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class HubMindRuntimeConfig(
    val apiKey: String,
    val projectId: String,
    val appId: String,
    val authDomain: String,
    val storageBucket: String,
    val messagingSenderId: String,
    val firestoreDatabaseId: String,
    val googleClientId: String
)

object HubMindRuntime {
    @Volatile
    var config: HubMindRuntimeConfig? = null
        private set

    fun setConfig(value: HubMindRuntimeConfig) {
        config = value
    }

    suspend fun loadAndInitializeFirebase(context: Context): FirebaseApp =
        withContext(Dispatchers.IO) {
            val baseUrl = BuildConfig.HUBMIND_API_BASE_URL.trimEnd('/')
            require(baseUrl.startsWith("https://")) {
                "Hub-Mind API must use HTTPS."
            }

            val connection = (URL("$baseUrl/api/config").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 12_000
                readTimeout = 12_000
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Cache-Control", "no-cache")
            }

            val runtimeConfig = try {
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                require(status in 200..299) {
                    "Hub-Mind configuration endpoint returned HTTP $status."
                }
                val root = JSONObject(body)
                val firebase = root.optJSONObject("firebase")
                    ?: throw IllegalStateException("Hub-Mind returned no Firebase configuration.")
                HubMindRuntimeConfig(
                    apiKey = firebase.optString("apiKey"),
                    projectId = firebase.optString("projectId"),
                    appId = firebase.optString("appId"),
                    authDomain = firebase.optString("authDomain"),
                    storageBucket = firebase.optString("storageBucket"),
                    messagingSenderId = firebase.optString("messagingSenderId"),
                    firestoreDatabaseId = firebase.optString("firestoreDatabaseId", "(default)")
                        .ifBlank { "(default)" },
                    googleClientId = root.optString("googleClientId")
                )
            } finally {
                connection.disconnect()
            }

            require(runtimeConfig.apiKey.isNotBlank() && runtimeConfig.apiKey != "dev-api-key") {
                "The Hub-Mind server has no production Firebase Web API key configured."
            }
            require(runtimeConfig.projectId.isNotBlank() && runtimeConfig.projectId != "test-project") {
                "The Hub-Mind server returned an invalid Firebase project ID."
            }
            require(runtimeConfig.appId.isNotBlank() && !runtimeConfig.appId.endsWith(":hubmind")) {
                "The Hub-Mind server returned a placeholder Firebase app ID."
            }

            setConfig(runtimeConfig)

            val existing = FirebaseApp.getApps(context).firstOrNull()
            existing ?: FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setApiKey(runtimeConfig.apiKey)
                    .setApplicationId(runtimeConfig.appId)
                    .setProjectId(runtimeConfig.projectId)
                    .setGcmSenderId(runtimeConfig.messagingSenderId)
                    .setStorageBucket(runtimeConfig.storageBucket)
                    .build()
            )
        }
}

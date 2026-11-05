package com.example.hubmind.agent

import android.content.Context
import android.os.Build
import android.os.BatteryManager
import android.provider.Settings
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Polls the authenticated Hub-Mind command queue while the user-enabled foreground
 * Android agent is running. Commands are scoped by the signed-in Firebase uid and
 * the stable Android ID; all results are acknowledged back to the same server.
 */
class AndroidDeviceCommandWorker(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(
        HubMindNativeBridge.KEY_PREFERENCES,
        Context.MODE_PRIVATE
    )
    private val executor = AndroidUiActionExecutor(appContext)

    private var lastRegistrationAt = 0L

    suspend fun pollOnce() {
        val userId = preferences.getString(HubMindNativeBridge.KEY_USER_ID, null)
            ?.takeIf { it.isNotBlank() } ?: return
        val idToken = preferences.getString(HubMindNativeBridge.KEY_ID_TOKEN, null)
            ?.takeIf { it.isNotBlank() } ?: return
        val deviceId = androidDeviceId()

        val now = System.currentTimeMillis()
        if (now - lastRegistrationAt > REGISTRATION_INTERVAL_MS) {
            registerDevice(idToken, deviceId)
            lastRegistrationAt = now
        }

        val response = postJson(
            path = "/api/devices/poll",
            idToken = idToken,
            body = JSONObject().put("deviceId", deviceId)
        )
        val commands = response.optJSONArray("commands") ?: JSONArray()
        for (index in 0 until commands.length()) {
            val commandJson = commands.optJSONObject(index) ?: continue
            executeAndReport(userId, idToken, deviceId, commandJson)
        }
    }

    private suspend fun registerDevice(idToken: String, deviceId: String) {
        val capabilities = JSONArray().apply {
            put("ANDROID_ACCESSIBILITY")
            put("APP_LAUNCH")
            put("SCREEN_READING")
            put("CLIPBOARD")
            put("GLOBAL_NAVIGATION")
            put("MEDIA_STREAMING")
        }
        val deviceName = listOf(Build.MANUFACTURER, Build.MODEL)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { "Android device" }

        val batteryManager = appContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val batteryPercent = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        postJson(
            path = "/api/devices/register",
            idToken = idToken,
            body = JSONObject()
                .put("deviceId", deviceId)
                .put("deviceName", deviceName.take(120))
                .put("platform", "ANDROID")
                .put("model", Build.MODEL.take(100))
                .put("clientVersion", "1.0.1")
                .put("fullControlActive", true)
                .put("batteryPercent", batteryPercent.takeIf { it in 0..100 })
                .put("capabilities", capabilities)
        )
    }

    private suspend fun executeAndReport(
        userId: String,
        idToken: String,
        deviceId: String,
        payload: JSONObject
    ) {
        val commandId = payload.optString("id")
            .ifBlank { payload.optString("commandId") }
        if (commandId.isBlank()) return

        val actionName = payload.optString("actionType").trim().uppercase()
        val actionType = runCatching { AndroidActionType.valueOf(actionName) }.getOrNull()
        val expiryTimestamp = payload.optLong(
            "expiresAt",
            System.currentTimeMillis() + 30000L
        )
        val requiresConfirmation = payload.optBoolean("requiresConfirmation", false)

        val result = when {
            actionType == null -> AndroidActionResult(
                commandId = commandId,
                actionType = AndroidActionType.GET_SCREEN_HIERARCHY,
                success = false,
                error = "Unsupported Android action '$actionName'."
            )
            requiresConfirmation -> AndroidActionResult(
                commandId = commandId,
                actionType = actionType,
                success = false,
                error = "This action requires confirmation on the Android phone and was not executed remotely."
            )
            expiryTimestamp <= System.currentTimeMillis() -> AndroidActionResult(
                commandId = commandId,
                actionType = actionType,
                success = false,
                error = "Command expired before Android execution."
            )
            else -> executor.executeCommand(
                AndroidCommand(
                    commandId = commandId,
                    actionType = actionType,
                    parameters = payload.optJSONObject("parameters").toParameterMap(),
                    expiryTimestamp = expiryTimestamp,
                    requiresConfirmation = false
                )
            )
        }

        val resultStatus = when {
            !result.success -> "FAILED"
            result.verified -> "COMPLETED"
            else -> "SENT_UNVERIFIED"
        }

        val outputText = buildString {
            append(result.outputText.orEmpty())
            result.hierarchy?.let {
                if (isNotEmpty()) append("\n")
                append("Accessibility hierarchy: ")
                append(it.toString().take(2500))
            }
            result.installedApps?.let { apps ->
                if (isNotEmpty()) append("\n")
                append("Installed apps: ")
                append(apps.take(35).joinToString { app -> "${app.appName} (${app.packageName})" })
            }
        }

        try {
            postJson(
                path = "/api/devices/result",
                idToken = idToken,
                body = JSONObject()
                    .put("deviceId", deviceId)
                    .put("commandId", commandId)
                    .put("status", resultStatus)
                    .put(
                        "result",
                        JSONObject()
                            .put("success", result.success)
                            .put("verified", result.verified)
                            .put("outputText", outputText.take(4000))
                            .put("error", result.error.orEmpty().take(1000))
                            .put("durationMs", result.durationMs)
                    )
            )
        } catch (error: Exception) {
            Log.e(TAG, "Could not acknowledge Android command $commandId", error)
            throw error
        }
    }

    private suspend fun postJson(
        path: String,
        idToken: String,
        body: JSONObject
    ): JSONObject = withContext(Dispatchers.IO) {
        val connection = (URL(API_BASE_URL + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 7000
            readTimeout = 9000
            doOutput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Authorization", "Bearer $idToken")
        }

        try {
            connection.outputStream.use { output ->
                output.write(body.toString().toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                throw IllegalStateException(
                    "Hub-Mind device API returned HTTP $status: ${responseText.take(300)}"
                )
            }
            if (responseText.isBlank()) JSONObject() else JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun androidDeviceId(): String {
        val stableId = Settings.Secure.getString(
            appContext.contentResolver,
            Settings.Secure.ANDROID_ID
        )
        return stableId?.takeIf { it.isNotBlank() } ?: "android-device-unavailable"
    }

    private fun JSONObject?.toParameterMap(): Map<String, Any> {
        if (this == null) return emptyMap()
        val values = linkedMapOf<String, Any>()
        val keys = keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = opt(key)
            when (value) {
                is String, is Number, is Boolean -> values[key] = value
                else -> Unit
            }
        }
        return values
    }

    companion object {
        private const val TAG = "HubMindAndroidAgent"
        private const val API_BASE_URL = "https://hub-mind.netlify.app"
        private const val REGISTRATION_INTERVAL_MS = 60_000L
        const val POLL_INTERVAL_MS = 2500L
    }
}

package com.example.hubmind

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.example.hubmind.agent.AndroidActionType
import com.example.hubmind.agent.AndroidAppLauncher
import com.example.hubmind.agent.AndroidCommand
import com.example.hubmind.agent.AndroidUiActionExecutor
import com.example.hubmind.agent.HubMindAgentForegroundService
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class AndroidNativeBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val bridgeToken: String
) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val actionExecutor = AndroidUiActionExecutor(activity.applicationContext)
    private val appLauncher = AndroidAppLauncher(activity.applicationContext)

    @JavascriptInterface
    fun isAndroidApp(): Boolean = true

    @JavascriptInterface
    fun getDeviceInfo(token: String): String {
        if (!isValidToken(token)) return "{}"
        val battery = getBatteryPercent()
        val prefs = activity.getSharedPreferences("hubmind_native", Context.MODE_PRIVATE)
        val deviceId = prefs.getString("device_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("device_id", it).apply()
        }
        return JSONObject()
            .put("deviceId", "android-phone-$deviceId")
            .put("agentSessionActive", prefs.getBoolean("agent_session_active", false))
            .put("deviceName", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            .put("platform", "ANDROID")
            .put("batteryPercent", battery)
            .put("androidVersion", Build.VERSION.RELEASE ?: "")
            .put("sdkInt", Build.VERSION.SDK_INT)
            .put("model", Build.MODEL ?: "")
            .put("manufacturer", Build.MANUFACTURER ?: "")
            .put("accessibilityEnabled", isAccessibilityEnabledInternal())
            .put("agentVersion", runCatching { activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "1.0.0" }.getOrDefault("1.0.0"))
            .toString()
    }

    @JavascriptInterface
    fun isAccessibilityEnabled(token: String): Boolean =
        isValidToken(token) && isAccessibilityEnabledInternal()

    @JavascriptInterface
    fun openAccessibilitySettings(token: String) {
        if (!isValidToken(token)) return
        activity.runOnUiThread {
            activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
    }

    @JavascriptInterface
    fun startAgentSession(token: String) {
        if (!isValidToken(token)) return
        activity.getSharedPreferences("hubmind_native", Context.MODE_PRIVATE).edit().putBoolean("agent_session_active", true).apply()
        activity.runOnUiThread { HubMindAgentForegroundService.startService(activity) }
    }

    @JavascriptInterface
    fun stopAgentSession(token: String) {
        if (!isValidToken(token)) return
        activity.getSharedPreferences("hubmind_native", Context.MODE_PRIVATE).edit().putBoolean("agent_session_active", false).apply()
        activity.runOnUiThread { HubMindAgentForegroundService.stopService(activity) }
    }

    @JavascriptInterface
    fun executeTool(name: String, argsJson: String, userId: String, token: String, callbackId: String) {
        if (!isValidToken(token)) {
            deliver(callbackId, JSONObject().put("success", false).put("verified", false).put("error", "Native bridge authentication failed."))
            return
        }
        executor.execute {
            val result = try {
                executeAction(name, JSONObject(argsJson.ifBlank { "{}" }))
            } catch (error: Exception) {
                JSONObject().put("success", false).put("verified", false)
                    .put("error", error.message ?: "Android native action failed.")
            }
            deliver(callbackId, result)
        }
    }

    private fun executeAction(toolName: String, args: JSONObject): JSONObject {
        if (toolName != "android_device_action") {
            return JSONObject().put("success", false).put("verified", false).put("error", "Unsupported native tool.")
        }
        val requestedAction = args.optString("actionType").uppercase()
        if (requestedAction.isBlank()) {
            return JSONObject().put("success", false).put("verified", false).put("error", "An Android actionType is required.")
        }

        when (requestedAction) {
            "OPEN_ACCESSIBILITY_SETTINGS" -> {
                activity.runOnUiThread { activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
                return JSONObject().put("success", true).put("verified", false)
                    .put("message", "Opened Android Accessibility Settings. Enable Hub-Mind Accessibility there, then return to Hub-Mind.")
            }
            "START_AGENT_SESSION" -> {
                activity.runOnUiThread { HubMindAgentForegroundService.startService(activity) }
                return JSONObject().put("success", true).put("verified", false)
                    .put("message", "Requested the visible Hub-Mind foreground device-control session.")
            }
            "STOP_AGENT_SESSION" -> {
                activity.runOnUiThread { HubMindAgentForegroundService.stopService(activity) }
                return JSONObject().put("success", true).put("verified", true)
                    .put("message", "Stopped the Hub-Mind foreground device-control session.")
            }
            "OPEN_ACCESSIBILITY_SETTINGS" -> {
                openAccessibilitySettings(bridgeToken)
                return JSONObject().put("success", true).put("verified", false)
                    .put("message", "Opened Android Accessibility Settings. Enable Hub-Mind Accessibility there, then return to Hub-Mind.")
            }
            "START_AGENT_SESSION" -> {
                startAgentSession(bridgeToken)
                return JSONObject().put("success", true).put("verified", false)
                    .put("message", "Started the user-requested Hub-Mind foreground device-control session.")
            }
            "STOP_AGENT_SESSION" -> {
                stopAgentSession(bridgeToken)
                return JSONObject().put("success", true).put("verified", true)
                    .put("message", "Stopped the Hub-Mind foreground device-control session.")
            }
            "GET_DEVICE_STATUS" -> return deviceStatusResult()
            "GET_INSTALLED_APPS" -> return installedAppsResult()
            "OPEN_DEEP_LINK" -> return openDeepLink(args)
            "SET_VOLUME" -> return setVolume(args)
        }

        val actionType = when (requestedAction) {
            "LAUNCH_APP" -> AndroidActionType.OPEN_APP
            "TAP" -> if (args.optString("targetText").isNotBlank() || args.optString("viewId").isNotBlank()) AndroidActionType.CLICK_UI_ELEMENT else AndroidActionType.TAP
            "DOUBLE_TAP" -> AndroidActionType.DOUBLE_TAP
            "LONG_PRESS" -> AndroidActionType.LONG_PRESS
            "CLICK_UI_ELEMENT" -> AndroidActionType.CLICK_UI_ELEMENT
            "SWIPE" -> AndroidActionType.SWIPE
            "SCROLL" -> AndroidActionType.SCROLL
            "TYPE_TEXT" -> AndroidActionType.TYPE_TEXT
            "NAVIGATE_BACK" -> AndroidActionType.NAVIGATE_BACK
            "GO_HOME" -> AndroidActionType.GO_HOME
            "OPEN_RECENTS" -> AndroidActionType.OPEN_RECENTS
            "OPEN_NOTIFICATIONS" -> AndroidActionType.OPEN_NOTIFICATIONS
            "OPEN_QUICK_SETTINGS" -> AndroidActionType.OPEN_QUICK_SETTINGS
            "CLIPBOARD_READ" -> AndroidActionType.GET_CLIPBOARD
            "CLIPBOARD_WRITE" -> AndroidActionType.SET_CLIPBOARD
            "GET_SCREEN_HIERARCHY" -> AndroidActionType.GET_SCREEN_HIERARCHY
            "CAPTURE_SCREEN" -> AndroidActionType.CAPTURE_SCREEN
            else -> return JSONObject().put("success", false).put("verified", false).put("error", "Unsupported Android action: $requestedAction")
        }

        if (actionType !in setOf(AndroidActionType.OPEN_APP, AndroidActionType.GET_INSTALLED_APPS) &&
            !isAccessibilityEnabledInternal()) {
            return JSONObject().put("success", false).put("verified", false)
                .put("error", "Hub-Mind Accessibility is not enabled. Enable it in Android Settings before using phone controls.")
        }

        val parameters = mutableMapOf<String, Any>()
        val keys = args.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = args.opt(key)
            if (value != null && value !== JSONObject.NULL && value !is JSONObject && value !is JSONArray) {
                parameters[key] = value
            }
        }

        val command = AndroidCommand(
            actionType = actionType,
            parameters = parameters,
            requiresConfirmation = requestedAction in setOf("CAPTURE_SCREEN", "CLIPBOARD_READ", "CLIPBOARD_WRITE")
        )
        val result = runBlocking { actionExecutor.executeCommand(command) }
        return actionResultToJson(result)
    }

    private fun deviceStatusResult(): JSONObject {
        val manager = activity.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val battery = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val audio = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return JSONObject()
            .put("success", true)
            .put("verified", true)
            .put("deviceName", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            .put("manufacturer", Build.MANUFACTURER ?: "")
            .put("model", Build.MODEL ?: "")
            .put("androidVersion", Build.VERSION.RELEASE ?: "")
            .put("sdkInt", Build.VERSION.SDK_INT)
            .put("batteryPercent", battery)
            .put("accessibilityEnabled", isAccessibilityEnabledInternal())
            .put("volumePercent", (audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f / audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)).toInt())
            .put("message", "Android device status retrieved.")
    }

    private fun installedAppsResult(): JSONObject {
        val apps = appLauncher.getInstalledApplications()
        val array = JSONArray()
        apps.forEach { app ->
            array.put(JSONObject()
                .put("appName", app.appName)
                .put("packageName", app.packageName)
                .put("isSystemApp", app.isSystemApp))
        }
        return JSONObject().put("success", true).put("verified", true)
            .put("total", apps.size).put("apps", array)
            .put("message", "Retrieved ${apps.size} launchable applications.")
    }

    private fun openDeepLink(args: JSONObject): JSONObject {
        val raw = args.optString("uri")
        val uri = runCatching { Uri.parse(raw) }.getOrNull()
            ?: return JSONObject().put("success", false).put("verified", false).put("error", "Invalid link.")
        if (uri.scheme?.lowercase() !in setOf("https", "http", "mailto", "tel")) {
            return JSONObject().put("success", false).put("verified", false).put("error", "Only HTTP(S), mailto and tel links can be opened.")
        }
        return try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            JSONObject().put("success", true).put("verified", false)
                .put("message", "Android accepted the request to open the link. The destination app has not been independently verified.")
        } catch (error: Exception) {
            JSONObject().put("success", false).put("verified", false).put("error", error.message ?: "Could not open this link.")
        }
    }

    private fun setVolume(args: JSONObject): JSONObject {
        val audio = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val requested = args.optInt("level", -1)
        if (requested !in 0..100) {
            return JSONObject().put("success", false).put("verified", false).put("error", "Volume level must be between 0 and 100.")
        }
        val target = (requested * max / 100f).toInt().coerceIn(0, max)
        return try {
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
            val actual = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
            val percent = (actual * 100f / max).toInt()
            JSONObject().put("success", actual == target).put("verified", actual == target)
                .put("volumePercent", percent).put("message", "Media volume is now $percent percent.")
        } catch (error: Exception) {
            JSONObject().put("success", false).put("verified", false).put("error", error.message ?: "Volume could not be changed.")
        }
    }

    private fun actionResultToJson(result: com.example.hubmind.agent.AndroidActionResult): JSONObject {
        val json = JSONObject()
            .put("success", result.success)
            .put("verified", result.verified)
            .put("message", result.outputText ?: "")
            .put("durationMs", result.durationMs)
        result.error?.let { json.put("error", it) }
        result.hierarchy?.let { json.put("hierarchy", nodeToJson(it)) }
        result.installedApps?.let { apps ->
            val array = JSONArray()
            apps.forEach { app -> array.put(JSONObject().put("appName", app.appName).put("packageName", app.packageName).put("isSystemApp", app.isSystemApp)) }
            json.put("apps", array).put("total", apps.size)
        }
        result.screenshotBase64?.let { image ->
            json.put("evidence", JSONObject().put("imageBase64", image).put("mimeType", result.screenshotMimeType ?: "image/jpeg"))
        }
        return json
    }

    private fun nodeToJson(node: com.example.hubmind.agent.UiNodeInfo): JSONObject {
        val children = JSONArray()
        node.children.forEach { children.put(nodeToJson(it)) }
        return JSONObject()
            .put("id", node.id)
            .put("viewIdResourceName", node.viewIdResourceName ?: "")
            .put("className", node.className ?: "")
            .put("packageName", node.packageName ?: "")
            .put("text", node.text ?: "")
            .put("contentDescription", node.contentDescription ?: "")
            .put("clickable", node.isClickable)
            .put("editable", node.isEditable)
            .put("scrollable", node.isScrollable)
            .put("bounds", JSONObject().put("left", node.boundsInScreen.left).put("top", node.boundsInScreen.top)
                .put("right", node.boundsInScreen.right).put("bottom", node.boundsInScreen.bottom))
            .put("children", children)
    }

    private fun getBatteryPercent(): Int {
        val manager = activity.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
    }

    private fun isAccessibilityEnabledInternal(): Boolean {
        val enabled = Settings.Secure.getString(activity.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        return enabled.split(':').any { it.equals(
            "${activity.packageName}/com.example.hubmind.agent.HubMindAccessibilityService",
            ignoreCase = true
        ) } && com.example.hubmind.agent.HubMindAccessibilityService.isServiceConnected
    }

    private fun isValidToken(candidate: String): Boolean {
        return try {
            MessageDigest.isEqual(bridgeToken.toByteArray(Charsets.UTF_8), candidate.toByteArray(Charsets.UTF_8))
        } catch (_: Exception) { false }
    }

    private fun deliver(callbackId: String, result: JSONObject) {
        val id = JSONObject.quote(callbackId)
        val payload = JSONObject.quote(result.toString())
        webView.post {
            webView.evaluateJavascript("window.__hubMindAndroidResolve && window.__hubMindAndroidResolve($id, $payload)", null)
        }
    }
}

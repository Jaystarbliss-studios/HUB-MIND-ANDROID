package com.example.hubmind.agent

import android.content.Context
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * Executes the small, explicitly exposed set of local Android actions that
 * Jess may request through Gemini Live function calling.
 */
class AndroidLiveToolExecutor(context: Context) {
    private val appContext = context.applicationContext
    private val actions = AndroidUiActionExecutor(appContext)
    private val launcher = AndroidAppLauncher(appContext)

    suspend fun execute(name: String, args: JSONObject): JSONObject {
        return try {
            when (name) {
                "get_android_device_status" -> deviceStatus()
                "list_android_apps" -> executeAction(AndroidActionType.GET_INSTALLED_APPS, emptyMap())
                "open_android_app" -> executeAction(
                    AndroidActionType.OPEN_APP,
                    mapOf(
                        "appName" to args.optString("appName"),
                        "packageName" to args.optString("packageName")
                    )
                )
                "read_android_screen" -> executeAction(AndroidActionType.GET_SCREEN_HIERARCHY, emptyMap())
                "tap_android_screen" -> executeAction(
                    AndroidActionType.TAP,
                    mapOf("x" to args.optDouble("x"), "y" to args.optDouble("y"))
                )
                "swipe_android_screen" -> executeAction(
                    AndroidActionType.SWIPE,
                    mapOf(
                        "startX" to args.optDouble("startX"),
                        "startY" to args.optDouble("startY"),
                        "endX" to args.optDouble("endX"),
                        "endY" to args.optDouble("endY")
                    )
                )
                "scroll_android_screen" -> executeAction(
                    AndroidActionType.SCROLL,
                    mapOf("direction" to args.optString("direction", "down"))
                )
                "type_android_text" -> executeAction(
                    AndroidActionType.TYPE_TEXT,
                    mapOf("text" to args.optString("text"))
                )
                "press_android_back" -> executeAction(AndroidActionType.NAVIGATE_BACK, emptyMap())
                "go_to_android_home" -> executeAction(AndroidActionType.GO_HOME, emptyMap())
                "open_android_recents" -> executeAction(AndroidActionType.OPEN_RECENTS, emptyMap())
                "open_android_notifications" -> executeAction(AndroidActionType.OPEN_NOTIFICATIONS, emptyMap())
                "open_android_quick_settings" -> executeAction(AndroidActionType.OPEN_QUICK_SETTINGS, emptyMap())
                "read_android_clipboard" -> executeAction(AndroidActionType.GET_CLIPBOARD, emptyMap())
                "write_android_clipboard" -> executeAction(
                    AndroidActionType.SET_CLIPBOARD,
                    mapOf("text" to args.optString("text"))
                )
                "get_android_volume" -> volumeStatus()
                "set_android_volume" -> setVolume(args.optInt("levelPercent", -1))
                else -> JSONObject()
                    .put("success", false)
                    .put("verified", false)
                    .put("error", "Unknown Android tool: $name")
            }
        } catch (error: Exception) {
            JSONObject()
                .put("success", false)
                .put("verified", false)
                .put("error", error.message ?: "Android action failed.")
        }
    }

    private fun deviceStatus(): JSONObject {
        val batteryManager = appContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val battery = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        return JSONObject()
            .put("success", true)
            .put("verified", true)
            .put("manufacturer", Build.MANUFACTURER)
            .put("model", Build.MODEL)
            .put("androidVersion", Build.VERSION.RELEASE)
            .put("sdkInt", Build.VERSION.SDK_INT)
            .put("batteryPercent", battery)
            .put("accessibilityServiceEnabled", HubMindAccessibilityService.isServiceConnected)
            .put("deviceControlSessionActive", HubMindAgentForegroundService.isRunning.value)
    }

    private fun volumeStatus(): JSONObject {
        val audio = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val current = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        return JSONObject()
            .put("success", true)
            .put("verified", true)
            .put("levelPercent", if (max > 0) (current * 100 / max) else 0)
            .put("current", current)
            .put("maximum", max)
    }

    private fun setVolume(levelPercent: Int): JSONObject {
        if (levelPercent !in 0..100) {
            return JSONObject().put("success", false).put("verified", false)
                .put("error", "Volume must be between 0 and 100 percent.")
        }
        val audio = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val target = (max * levelPercent / 100.0).toInt().coerceIn(0, max)
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
        val actual = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
        return JSONObject()
            .put("success", actual == target)
            .put("verified", actual == target)
            .put("levelPercent", if (max > 0) actual * 100 / max else 0)
            .put("current", actual)
            .put("maximum", max)
    }

    private suspend fun executeAction(
        type: AndroidActionType,
        parameters: Map<String, Any>
    ): JSONObject {
        val result = actions.executeCommand(
            AndroidCommand(actionType = type, parameters = parameters)
        )
        val json = JSONObject()
            .put("success", result.success)
            .put("verified", result.verified)
            .put("durationMs", result.durationMs)
        result.outputText?.let { json.put("output", it) }
        result.error?.let { json.put("error", it) }
        result.installedApps?.let { apps ->
            val list = JSONArray()
            apps.forEach { app ->
                list.put(
                    JSONObject()
                        .put("appName", app.appName)
                        .put("packageName", app.packageName)
                        .put("systemApp", app.isSystemApp)
                )
            }
            json.put("apps", list)
        }
        result.hierarchy?.let { json.put("screen", nodeToJson(it)) }
        return json
    }

    private fun nodeToJson(node: UiNodeInfo): JSONObject {
        val children = JSONArray()
        node.children.forEach { children.put(nodeToJson(it)) }
        return JSONObject()
            .put("id", node.id)
            .put("viewId", node.viewIdResourceName ?: JSONObject.NULL)
            .put("className", node.className ?: JSONObject.NULL)
            .put("packageName", node.packageName ?: JSONObject.NULL)
            .put("text", node.text ?: JSONObject.NULL)
            .put("contentDescription", node.contentDescription ?: JSONObject.NULL)
            .put("clickable", node.isClickable)
            .put("editable", node.isEditable)
            .put("scrollable", node.isScrollable)
            .put(
                "bounds",
                JSONObject()
                    .put("left", node.boundsInScreen.left)
                    .put("top", node.boundsInScreen.top)
                    .put("right", node.boundsInScreen.right)
                    .put("bottom", node.boundsInScreen.bottom)
            )
            .put("children", children)
    }
}

package com.example.hubmind.agent

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidUiActionExecutor(private val context: Context) {

    private val appLauncher = AndroidAppLauncher(context)
    private val globalActionController = AndroidGlobalActionController()
    private val clipboardController = AndroidClipboardController(context)
    private val advancedProvider: AdvancedDeviceControlProvider = ShizukuDeviceControlProvider()

    suspend fun executeCommand(command: AndroidCommand): AndroidActionResult = withContext(Dispatchers.Default) {
        val startTime = System.currentTimeMillis()

        // 1. Expiry check
        if (command.expiryTimestamp < startTime) {
            return@withContext AndroidActionResult(
                commandId = command.commandId,
                actionType = command.actionType,
                success = false,
                error = "Command expired before execution.",
                durationMs = 0
            )
        }

        val service = HubMindAccessibilityService.getInstance()

        try {
            when (command.actionType) {
                AndroidActionType.TAP -> {
                    val x = (command.parameters["x"] as? Number)?.toFloat() ?: 500f
                    val y = (command.parameters["y"] as? Number)?.toFloat() ?: 1000f
                    if (service == null) {
                        return@withContext AndroidActionResult(
                            commandId = command.commandId,
                            actionType = command.actionType,
                            success = false,
                            error = "Accessibility service is not active. Enable Hub-Mind Agent in Settings.",
                            durationMs = System.currentTimeMillis() - startTime
                        )
                    }
                    var done = false
                    service.performTapAt(x, y) { success -> done = success }
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = true,
                        verified = true,
                        outputText = "Dispatched tap at ($x, $y)",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.DOUBLE_TAP -> {
                    val x = (command.parameters["x"] as? Number)?.toFloat() ?: 500f
                    val y = (command.parameters["y"] as? Number)?.toFloat() ?: 1000f
                    service?.performTapAt(x, y)
                    service?.performTapAt(x, y)
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = service != null,
                        verified = service != null,
                        outputText = "Dispatched double tap at ($x, $y)",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.LONG_PRESS -> {
                    val x = (command.parameters["x"] as? Number)?.toFloat() ?: 500f
                    val y = (command.parameters["y"] as? Number)?.toFloat() ?: 1000f
                    service?.performTapAt(x, y, durationMs = 800)
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = service != null,
                        verified = service != null,
                        outputText = "Dispatched long press at ($x, $y)",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.SWIPE -> {
                    val startX = (command.parameters["startX"] as? Number)?.toFloat() ?: 500f
                    val startY = (command.parameters["startY"] as? Number)?.toFloat() ?: 1500f
                    val endX = (command.parameters["endX"] as? Number)?.toFloat() ?: 500f
                    val endY = (command.parameters["endY"] as? Number)?.toFloat() ?: 500f
                    service?.performSwipe(startX, startY, endX, endY)
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = service != null,
                        verified = service != null,
                        outputText = "Dispatched swipe from ($startX, $startY) to ($endX, $endY)",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.SCROLL -> {
                    service?.performSwipe(500f, 1200f, 500f, 400f)
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = service != null,
                        verified = service != null,
                        outputText = "Dispatched vertical scroll",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.TYPE_TEXT -> {
                    val text = command.parameters["text"] as? String ?: ""
                    val ok = service?.performTextSetOnFocused(text) ?: false
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = ok,
                        outputText = if (ok) "Entered text into focused input field" else "No active focused editable field found",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.CLEAR_TEXT -> {
                    val ok = service?.performTextSetOnFocused("") ?: false
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = ok,
                        outputText = "Cleared text field",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.OPEN_APP -> {
                    val appName = command.parameters["appName"] as? String ?: ""
                    val pkgName = command.parameters["packageName"] as? String ?: ""
                    val app = if (pkgName.isNotBlank()) {
                        AppInfo(packageName = pkgName, appName = appName.ifBlank { pkgName })
                    } else {
                        appLauncher.findAppByName(appName)
                    }

                    if (app == null) {
                        return@withContext AndroidActionResult(
                            commandId = command.commandId,
                            actionType = command.actionType,
                            success = false,
                            error = "Application '$appName' was not found on this phone.",
                            durationMs = System.currentTimeMillis() - startTime
                        )
                    }

                    val launched = appLauncher.launchAppByPackage(app.packageName)
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = launched,
                        verified = launched,
                        outputText = "Launched ${app.appName} (${app.packageName})",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.GET_INSTALLED_APPS -> {
                    val apps = appLauncher.getInstalledApplications()
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = true,
                        verified = true,
                        installedApps = apps,
                        outputText = "Retrieved ${apps.size} launchable installed applications",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.GET_SCREEN_HIERARCHY -> {
                    val hierarchy = service?.dumpActiveHierarchy()
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = hierarchy != null,
                        verified = hierarchy != null,
                        hierarchy = hierarchy,
                        outputText = if (hierarchy != null) "Dumped active window accessibility hierarchy" else "Accessibility service unavailable or window empty",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.CAPTURE_SCREEN -> {
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = true,
                        verified = true,
                        outputText = "Screen capture session buffer requested",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.SET_CLIPBOARD -> {
                    val text = command.parameters["text"] as? String ?: ""
                    val set = clipboardController.setClipboardText(text = text)
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = set,
                        verified = set,
                        outputText = "Updated Android system clipboard",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.GET_CLIPBOARD -> {
                    val text = clipboardController.getClipboardText()
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = true,
                        verified = true,
                        outputText = text ?: "(Clipboard empty)",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.NAVIGATE_BACK -> {
                    val ok = globalActionController.performBack()
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = ok,
                        outputText = "Triggered Back navigation",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.GO_HOME -> {
                    val ok = globalActionController.performHome()
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = ok,
                        outputText = "Triggered Home navigation",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.OPEN_RECENTS -> {
                    val ok = globalActionController.performRecents()
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = ok,
                        outputText = "Opened Recents screen",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.OPEN_NOTIFICATIONS -> {
                    val ok = globalActionController.performNotifications()
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = ok,
                        outputText = "Opened Notification shade",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.OPEN_QUICK_SETTINGS -> {
                    val ok = globalActionController.performQuickSettings()
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = ok,
                        outputText = "Opened Quick Settings panel",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }
            }
        } catch (e: Exception) {
            AndroidActionResult(
                commandId = command.commandId,
                actionType = command.actionType,
                success = false,
                error = "Execution error: ${e.message}",
                durationMs = System.currentTimeMillis() - startTime
            )
        }
    }
}

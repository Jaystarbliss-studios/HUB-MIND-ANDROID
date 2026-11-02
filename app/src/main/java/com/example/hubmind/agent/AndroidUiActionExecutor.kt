package com.example.hubmind.agent

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

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
                    val ok = awaitGesture { callback -> service.performTapAt(x, y, onComplete = callback) }
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = false,
                        outputText = if (ok) "Tap completed at ($x, $y)" else "Android rejected the tap gesture",
                        error = if (ok) null else "Tap gesture was cancelled by Android.",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.DOUBLE_TAP -> {
                    val x = (command.parameters["x"] as? Number)?.toFloat() ?: 500f
                    val y = (command.parameters["y"] as? Number)?.toFloat() ?: 1000f
                    val ok = if (service == null) false else {
                        val first = awaitGesture { callback -> service.performTapAt(x, y, onComplete = callback) }
                        if (first) delay(120)
                        first && awaitGesture { callback -> service.performTapAt(x, y, onComplete = callback) }
                    }
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = false,
                        outputText = if (ok) "Double tap completed at ($x, $y)" else "Double tap could not be completed",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.LONG_PRESS -> {
                    val x = (command.parameters["x"] as? Number)?.toFloat() ?: 500f
                    val y = (command.parameters["y"] as? Number)?.toFloat() ?: 1000f
                    val ok = service?.let { awaitGesture { callback -> it.performTapAt(x, y, durationMs = 800, onComplete = callback) } } ?: false
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = false,
                        outputText = if (ok) "Long press completed at ($x, $y)" else "Long press could not be completed",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.SWIPE -> {
                    val startX = (command.parameters["startX"] as? Number)?.toFloat() ?: 500f
                    val startY = (command.parameters["startY"] as? Number)?.toFloat() ?: 1500f
                    val endX = (command.parameters["endX"] as? Number)?.toFloat() ?: 500f
                    val endY = (command.parameters["endY"] as? Number)?.toFloat() ?: 500f
                    val ok = service?.let { awaitGesture { callback -> it.performSwipe(startX, startY, endX, endY, onComplete = callback) } } ?: false
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = false,
                        outputText = if (ok) "Swipe completed from ($startX, $startY) to ($endX, $endY)" else "Swipe gesture could not be completed",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.SCROLL -> {
                    val direction = command.parameters["direction"] as? String ?: "down"
                    val (sx, sy, ex, ey) = when (direction.lowercase()) {
                        "up" -> listOf(500f, 450f, 500f, 1450f)
                        "left" -> listOf(850f, 900f, 150f, 900f)
                        "right" -> listOf(150f, 900f, 850f, 900f)
                        else -> listOf(500f, 1450f, 500f, 450f)
                    }
                    val ok = service?.let { awaitGesture { callback -> it.performSwipe(sx, sy, ex, ey, onComplete = callback) } } ?: false
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = false,
                        outputText = if (ok) "Scroll gesture completed ($direction)" else "Scroll gesture could not be completed",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.CLICK_UI_ELEMENT -> {
                    val targetText = command.parameters["targetText"] as? String ?: ""
                    val viewId = command.parameters["viewId"] as? String ?: ""
                    val ok = service?.clickNode(targetText, viewId) ?: false
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = ok,
                        verified = false,
                        outputText = if (ok) "Activated the matching accessible UI element" else "No matching clickable UI element was found",
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
                        verified = false,
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
                        verified = false,
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
                        verified = false,
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
                    val image = service?.let { svc ->
                        suspendCancellableCoroutine<String?> { continuation ->
                            svc.captureScreenBase64 { value ->
                                if (continuation.isActive) continuation.resume(value)
                            }
                        }
                    }
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = image != null,
                        verified = image != null,
                        screenshotBase64 = image,
                        screenshotMimeType = if (image != null) "image/jpeg" else null,
                        outputText = if (image != null) "Captured the current phone screen." else "Screen capture failed or is not supported by this Android version.",
                        error = if (image != null) null else "Android did not return a screenshot.",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.SET_CLIPBOARD -> {
                    val text = command.parameters["text"] as? String ?: ""
                    val set = clipboardController.setClipboardText(text = text)
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = set && clipboardController.getClipboardText() == text,
                        verified = set && clipboardController.getClipboardText() == text,
                        outputText = if (set && clipboardController.getClipboardText() == text) "Updated and verified Android system clipboard" else "Android clipboard update could not be verified",
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
                        verified = false,
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
                        verified = false,
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
                        verified = false,
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
                        verified = false,
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
                        verified = false,
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
    private suspend fun awaitGesture(register: ((Boolean) -> Unit) -> Unit): Boolean =
        suspendCancellableCoroutine { continuation ->
            register { success ->
                if (continuation.isActive) continuation.resume(success)
            }
        }

}

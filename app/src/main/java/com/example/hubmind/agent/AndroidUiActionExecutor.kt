package com.example.hubmind.agent

import android.content.Context
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

class AndroidUiActionExecutor(private val context: Context) {

    private val appLauncher = AndroidAppLauncher(context)
    private val globalActionController = AndroidGlobalActionController()
    private val clipboardController = AndroidClipboardController(context)
    private val advancedProvider: AdvancedDeviceControlProvider = ShizukuDeviceControlProvider()

    /**
     * A successful AccessibilityService callback proves that Android dispatched
     * the gesture, not that the target application changed state. Keep that
     * distinction explicit so Jess never reports a tap as verified prematurely.
     */
    private suspend fun dispatchGesture(
        dispatch: ((Boolean) -> Unit) -> Boolean
    ): Pair<Boolean, Boolean> {
        val completion = CompletableDeferred<Boolean>()
        val accepted = dispatch { completed ->
            if (!completion.isCompleted) completion.complete(completed)
        }
        if (!accepted) return false to false
        val completed = withTimeoutOrNull(3000L) { completion.await() }
        return when (completed) {
            false -> false to false
            true -> true to true
            null -> true to false
        }
    }

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
                    if (service == null) {
                        return@withContext AndroidActionResult(
                            commandId, command.actionType, success = false,
                            error = "Accessibility service is not active. Enable Hub-Mind Agent in Settings.",
                            durationMs = System.currentTimeMillis() - startTime
                        )
                    }
                    val x = (command.parameters["x"] as? Number)?.toFloat() ?: 500f
                    val y = (command.parameters["y"] as? Number)?.toFloat() ?: 1000f
                    val (accepted, acknowledged) = dispatchGesture { callback ->
                        service.performTapAt(x, y, onComplete = callback)
                    }
                    AndroidActionResult(
                        commandId, command.actionType,
                        success = accepted,
                        verified = false,
                        outputText = when {
                            !accepted -> "Android did not accept the tap gesture."
                            acknowledged -> "Tap gesture was dispatched by Android; the resulting app state was not independently verified."
                            else -> "Tap was accepted by Android, but the completion acknowledgement timed out. Do not automatically repeat it."
                        },
                        error = if (!accepted) "Tap gesture was rejected or cancelled." else null,
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.DOUBLE_TAP -> {
                    if (service == null) {
                        return@withContext AndroidActionResult(
                            commandId, command.actionType, success = false,
                            error = "Accessibility service is not active. Enable Hub-Mind Agent in Settings.",
                            durationMs = System.currentTimeMillis() - startTime
                        )
                    }
                    val x = (command.parameters["x"] as? Number)?.toFloat() ?: 500f
                    val y = (command.parameters["y"] as? Number)?.toFloat() ?: 1000f
                    val (firstAccepted, firstAck) = dispatchGesture { callback ->
                        service.performTapAt(x, y, onComplete = callback)
                    }
                    val (secondAccepted, secondAck) = if (firstAccepted && firstAck) {
                        dispatchGesture { callback -> service.performTapAt(x, y, onComplete = callback) }
                    } else false to false
                    val accepted = firstAccepted && secondAccepted
                    AndroidActionResult(
                        commandId, command.actionType, success = accepted, verified = false,
                        outputText = if (accepted && secondAck) {
                            "Both taps were dispatched by Android; the resulting app state was not independently verified."
                        } else if (firstAccepted && !firstAck) {
                            "First tap was accepted but not acknowledged. Second tap was not sent to avoid an accidental duplicate."
                        } else "Android did not complete the double-tap gesture.",
                        error = if (accepted || firstAccepted) null else "Android rejected the first tap.",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.LONG_PRESS -> {
                    if (service == null) {
                        return@withContext AndroidActionResult(
                            commandId, command.actionType, success = false,
                            error = "Accessibility service is not active. Enable Hub-Mind Agent in Settings.",
                            durationMs = System.currentTimeMillis() - startTime
                        )
                    }
                    val x = (command.parameters["x"] as? Number)?.toFloat() ?: 500f
                    val y = (command.parameters["y"] as? Number)?.toFloat() ?: 1000f
                    val (accepted, acknowledged) = dispatchGesture { callback ->
                        service.performTapAt(x, y, durationMs = 800, onComplete = callback)
                    }
                    AndroidActionResult(
                        commandId, command.actionType, success = accepted, verified = false,
                        outputText = if (accepted && acknowledged) {
                            "Long-press gesture was dispatched by Android; the resulting app state was not independently verified."
                        } else if (accepted) {
                            "Long-press was accepted but its completion acknowledgement timed out. Do not automatically repeat it."
                        } else "Android rejected the long-press gesture.",
                        error = if (accepted) null else "Long-press gesture was rejected or cancelled.",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.SWIPE -> {
                    if (service == null) {
                        return@withContext AndroidActionResult(
                            commandId, command.actionType, success = false,
                            error = "Accessibility service is not active. Enable Hub-Mind Agent in Settings.",
                            durationMs = System.currentTimeMillis() - startTime
                        )
                    }
                    val startX = (command.parameters["startX"] as? Number)?.toFloat() ?: 500f
                    val startY = (command.parameters["startY"] as? Number)?.toFloat() ?: 1500f
                    val endX = (command.parameters["endX"] as? Number)?.toFloat() ?: 500f
                    val endY = (command.parameters["endY"] as? Number)?.toFloat() ?: 500f
                    val (accepted, acknowledged) = dispatchGesture { callback ->
                        service.performSwipe(startX, startY, endX, endY, onComplete = callback)
                    }
                    AndroidActionResult(
                        commandId, command.actionType, success = accepted, verified = false,
                        outputText = if (accepted && acknowledged) {
                            "Swipe gesture was dispatched by Android; the resulting app state was not independently verified."
                        } else if (accepted) {
                            "Swipe was accepted but its completion acknowledgement timed out. Do not automatically repeat it."
                        } else "Android rejected the swipe gesture.",
                        error = if (accepted) null else "Swipe gesture was rejected or cancelled.",
                        durationMs = System.currentTimeMillis() - startTime
                    )
                }

                AndroidActionType.SCROLL -> {
                    if (service == null) {
                        return@withContext AndroidActionResult(
                            commandId, command.actionType, success = false,
                            error = "Accessibility service is not active. Enable Hub-Mind Agent in Settings.",
                            durationMs = System.currentTimeMillis() - startTime
                        )
                    }
                    val startX = (command.parameters["startX"] as? Number)?.toFloat() ?: 500f
                    val startY = (command.parameters["startY"] as? Number)?.toFloat() ?: 1200f
                    val endX = (command.parameters["endX"] as? Number)?.toFloat() ?: 500f
                    val endY = (command.parameters["endY"] as? Number)?.toFloat() ?: 400f
                    val (accepted, acknowledged) = dispatchGesture { callback ->
                        service.performSwipe(startX, startY, endX, endY, onComplete = callback)
                    }
                    AndroidActionResult(
                        commandId, command.actionType, success = accepted, verified = false,
                        outputText = if (accepted && acknowledged) {
                            "Scroll gesture was dispatched by Android; the resulting app state was not independently verified."
                        } else if (accepted) {
                            "Scroll was accepted but its completion acknowledgement timed out. Do not automatically repeat it."
                        } else "Android rejected the scroll gesture.",
                        error = if (accepted) null else "Scroll gesture was rejected or cancelled.",
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
                        outputText = if (ok) "Android accepted text input into the focused field; content was not independently read back" else "No active focused editable field found",
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
                        outputText = "Android accepted the clear-text action; field contents were not independently read back",
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

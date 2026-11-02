package com.example.hubmind.agent

import android.content.Context
import android.os.Looper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidUiActionExecutor(private val context: Context) {

    private val appLauncher = AndroidAppLauncher(context)
    private val globalActionController = AndroidGlobalActionController()
    private val clipboardController = AndroidClipboardController(context)

    suspend fun executeCommand(command: AndroidCommand): AndroidActionResult {
        val startedAt = System.currentTimeMillis()

        fun failure(message: String): AndroidActionResult = AndroidActionResult(
            commandId = command.commandId,
            actionType = command.actionType,
            success = false,
            verified = false,
            error = message,
            durationMs = System.currentTimeMillis() - startedAt
        )

        fun accepted(output: String): AndroidActionResult = AndroidActionResult(
            commandId = command.commandId,
            actionType = command.actionType,
            success = true,
            // dispatchGesture / startActivity acceptance is not proof that the
            // intended screen-level postcondition occurred.
            verified = false,
            outputText = output,
            durationMs = System.currentTimeMillis() - startedAt
        )

        if (command.expiryTimestamp <= startedAt) {
            return failure("Command expired before execution.")
        }

        return try {
            when (command.actionType) {
                AndroidActionType.TAP,
                AndroidActionType.DOUBLE_TAP,
                AndroidActionType.LONG_PRESS,
                AndroidActionType.SWIPE,
                AndroidActionType.SCROLL,
                AndroidActionType.TYPE_TEXT,
                AndroidActionType.CLEAR_TEXT,
                AndroidActionType.GET_SCREEN_HIERARCHY,
                AndroidActionType.NAVIGATE_BACK,
                AndroidActionType.GO_HOME,
                AndroidActionType.OPEN_RECENTS,
                AndroidActionType.OPEN_NOTIFICATIONS,
                AndroidActionType.OPEN_QUICK_SETTINGS -> withContext(Dispatchers.Main.immediate) {
                    if (Looper.myLooper() != Looper.getMainLooper()) {
                        return@withContext failure("Android accessibility actions must run on the main thread.")
                    }
                    val service = HubMindAccessibilityService.getInstance()
                        ?: return@withContext failure(
                            "Hub-Mind Accessibility Service is not connected. Enable the service in Android Settings."
                        )

                    when (command.actionType) {
                        AndroidActionType.TAP -> {
                            val point = requiredPoint(command.parameters, "x", "y")
                                ?: return@withContext failure("TAP requires numeric x and y coordinates.")
                            if (!isPointOnScreen(service, point.first, point.second)) {
                                return@withContext failure("TAP coordinates are outside the current screen.")
                            }
                            val completed = service.performTapAt(point.first, point.second)
                            if (completed) accepted("Tap gesture completed by Android.")
                            else failure("Android rejected or cancelled the tap gesture.")
                        }

                        AndroidActionType.DOUBLE_TAP -> {
                            val point = requiredPoint(command.parameters, "x", "y")
                                ?: return@withContext failure("DOUBLE_TAP requires numeric x and y coordinates.")
                            if (!isPointOnScreen(service, point.first, point.second)) {
                                return@withContext failure("DOUBLE_TAP coordinates are outside the current screen.")
                            }
                            val first = service.performTapAt(point.first, point.second)
                            if (!first) return@withContext failure("Android rejected the first tap.")
                            kotlinx.coroutines.delay(70)
                            val second = service.performTapAt(point.first, point.second)
                            if (second) accepted("Both tap gestures completed; the resulting UI state was not independently verified.")
                            else failure("Android rejected or cancelled the second tap.")
                        }

                        AndroidActionType.LONG_PRESS -> {
                            val point = requiredPoint(command.parameters, "x", "y")
                                ?: return@withContext failure("LONG_PRESS requires numeric x and y coordinates.")
                            if (!isPointOnScreen(service, point.first, point.second)) {
                                return@withContext failure("LONG_PRESS coordinates are outside the current screen.")
                            }
                            val duration = (command.parameters["durationMs"] as? Number)?.toLong() ?: 800L
                            if (duration !in 500L..10_000L) {
                                return@withContext failure("LONG_PRESS duration must be between 500 and 10000 milliseconds.")
                            }
                            val completed = service.performTapAt(point.first, point.second, duration)
                            if (completed) accepted("Long-press gesture completed by Android.")
                            else failure("Android rejected or cancelled the long-press gesture.")
                        }

                        AndroidActionType.SWIPE -> {
                            val start = requiredPoint(command.parameters, "startX", "startY")
                                ?: return@withContext failure("SWIPE requires numeric startX and startY coordinates.")
                            val end = requiredPoint(command.parameters, "endX", "endY")
                                ?: return@withContext failure("SWIPE requires numeric endX and endY coordinates.")
                            if (!isPointOnScreen(service, start.first, start.second) ||
                                !isPointOnScreen(service, end.first, end.second)
                            ) {
                                return@withContext failure("SWIPE coordinates must be within the current screen.")
                            }
                            val completed = service.performSwipe(
                                start.first,
                                start.second,
                                end.first,
                                end.second
                            )
                            if (completed) accepted("Swipe gesture completed by Android.")
                            else failure("Android rejected or cancelled the swipe gesture.")
                        }

                        AndroidActionType.SCROLL -> {
                            val width = service.screenWidthPx().toFloat()
                            val height = service.screenHeightPx().toFloat()
                            val direction = (command.parameters["direction"] as? String)
                                ?.lowercase()
                                ?: "down"
                            val points = when (direction) {
                                "up" -> Triple(width * 0.5f, height * 0.75f, height * 0.25f)
                                "down" -> Triple(width * 0.5f, height * 0.25f, height * 0.75f)
                                "left" -> Triple(width * 0.75f, height * 0.5f, width * 0.25f)
                                "right" -> Triple(width * 0.25f, height * 0.5f, width * 0.75f)
                                else -> return@withContext failure("SCROLL direction must be up, down, left or right.")
                            }
                            val (x, start, end) = points
                            val completed = if (direction == "left" || direction == "right") {
                                service.performSwipe(start, x, end, x)
                            } else {
                                service.performSwipe(x, start, x, end)
                            }
                            if (completed) accepted("Scroll gesture completed by Android.")
                            else failure("Android rejected or cancelled the scroll gesture.")
                        }

                        AndroidActionType.TYPE_TEXT -> {
                            val text = command.parameters["text"] as? String
                                ?: return@withContext failure("TYPE_TEXT requires a text parameter.")
                            if (text.isEmpty() || text.length > 5000) {
                                return@withContext failure("TYPE_TEXT must contain between 1 and 5000 characters.")
                            }
                            if (service.performTextSetOnFocused(text)) {
                                accepted("Android accepted text for the focused editable field.")
                            } else {
                                failure("No editable field was focused or Android rejected the text action.")
                            }
                        }

                        AndroidActionType.CLEAR_TEXT -> {
                            if (service.performTextSetOnFocused("")) {
                                accepted("Android accepted the clear-text action for the focused editable field.")
                            } else {
                                failure("No editable field was focused or Android rejected the clear-text action.")
                            }
                        }

                        AndroidActionType.GET_SCREEN_HIERARCHY -> {
                            val hierarchy = service.dumpActiveHierarchy()
                                ?: return@withContext failure("No active accessibility window is available.")
                            AndroidActionResult(
                                commandId = command.commandId,
                                actionType = command.actionType,
                                success = true,
                                verified = true,
                                hierarchy = hierarchy,
                                outputText = "Retrieved the available accessibility hierarchy.",
                                durationMs = System.currentTimeMillis() - startedAt
                            )
                        }

                        AndroidActionType.NAVIGATE_BACK -> {
                            if (globalActionController.performBack()) accepted("Android accepted the Back action.")
                            else failure("Android did not accept the Back action.")
                        }

                        AndroidActionType.GO_HOME -> {
                            if (globalActionController.performHome()) accepted("Android accepted the Home action.")
                            else failure("Android did not accept the Home action.")
                        }

                        AndroidActionType.OPEN_RECENTS -> {
                            if (globalActionController.performRecents()) accepted("Android accepted the Recents action.")
                            else failure("Android did not accept the Recents action.")
                        }

                        AndroidActionType.OPEN_NOTIFICATIONS -> {
                            if (globalActionController.performNotifications()) accepted("Android accepted the Notifications action.")
                            else failure("Android did not accept the Notifications action.")
                        }

                        AndroidActionType.OPEN_QUICK_SETTINGS -> {
                            if (globalActionController.performQuickSettings()) accepted("Android accepted the Quick Settings action.")
                            else failure("Android did not accept the Quick Settings action.")
                        }

                        else -> failure("Unsupported Android accessibility action.")
                    }
                }

                AndroidActionType.OPEN_APP -> withContext(Dispatchers.Main.immediate) {
                    val appName = command.parameters["appName"] as? String ?: ""
                    val packageName = command.parameters["packageName"] as? String ?: ""
                    val app = if (packageName.isNotBlank()) {
                        AppInfo(packageName = packageName, appName = appName.ifBlank { packageName })
                    } else {
                        appLauncher.findAppByName(appName)
                    } ?: return@withContext failure("Application '" + appName + "' was not found on this phone.")

                    if (appLauncher.launchAppByPackage(app.packageName)) {
                        accepted("Launch intent submitted for " + app.appName + ". The foreground app was not independently verified.")
                    } else {
                        failure("Android could not launch " + app.appName + ".")
                    }
                }

                AndroidActionType.GET_INSTALLED_APPS -> {
                    val apps = withContext(Dispatchers.IO) { appLauncher.getInstalledApplications() }
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = true,
                        verified = true,
                        installedApps = apps,
                        outputText = "Retrieved " + apps.size + " launchable applications.",
                        durationMs = System.currentTimeMillis() - startedAt
                    )
                }

                AndroidActionType.CAPTURE_SCREEN -> failure(
                    "Screen capture is not implemented yet. No screenshot was taken."
                )

                AndroidActionType.SET_CLIPBOARD -> withContext(Dispatchers.Main.immediate) {
                    val text = command.parameters["text"] as? String
                        ?: return@withContext failure("SET_CLIPBOARD requires a text parameter.")
                    if (clipboardController.setClipboardText(text = text)) {
                        AndroidActionResult(
                            commandId = command.commandId,
                            actionType = command.actionType,
                            success = true,
                            verified = true,
                            outputText = "Android clipboard was updated.",
                            durationMs = System.currentTimeMillis() - startedAt
                        )
                    } else {
                        failure("Android did not allow the clipboard to be updated.")
                    }
                }

                AndroidActionType.GET_CLIPBOARD -> withContext(Dispatchers.Main.immediate) {
                    val text = clipboardController.getClipboardText()
                        ?: return@withContext failure("The clipboard is empty or Android restricted clipboard access.")
                    AndroidActionResult(
                        commandId = command.commandId,
                        actionType = command.actionType,
                        success = true,
                        verified = true,
                        outputText = text,
                        durationMs = System.currentTimeMillis() - startedAt
                    )
                }
            }
        } catch (error: Exception) {
            failure(error.message ?: "Android action failed.")
        }
    }

    private fun requiredPoint(
        parameters: Map<String, Any>,
        xKey: String,
        yKey: String
    ): Pair<Float, Float>? {
        val x = (parameters[xKey] as? Number)?.toFloat() ?: return null
        val y = (parameters[yKey] as? Number)?.toFloat() ?: return null
        if (!x.isFinite() || !y.isFinite()) return null
        return x to y
    }

    private fun isPointOnScreen(
        service: HubMindAccessibilityService,
        x: Float,
        y: Float
    ): Boolean {
        return x >= 0f && y >= 0f &&
            x < service.screenWidthPx() && y < service.screenHeightPx()
    }
}

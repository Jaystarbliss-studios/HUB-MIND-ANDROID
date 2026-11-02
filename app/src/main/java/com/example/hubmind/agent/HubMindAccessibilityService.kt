package com.example.hubmind.agent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.io.ByteArrayOutputStream

class HubMindAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile private var instance: HubMindAccessibilityService? = null
        val isServiceConnected: Boolean get() = instance != null
        fun getInstance(): HubMindAccessibilityService? = instance
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    fun dumpActiveHierarchy(): UiNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return parseNode(root, 0, intArrayOf(300))
    }

    private fun parseNode(node: AccessibilityNodeInfo, depth: Int, budget: IntArray): UiNodeInfo {
        val rect = Rect()
        node.getBoundsInScreen(rect)
        budget[0]--
        val children = mutableListOf<UiNodeInfo>()
        if (depth < 12 && budget[0] > 0) {
            for (i in 0 until node.childCount) {
                if (budget[0] <= 0) break
                val child = node.getChild(i) ?: continue
                children.add(parseNode(child, depth + 1, budget))
            }
        }
        val sensitive = node.isPassword
        return UiNodeInfo(
            id = node.viewIdResourceName ?: "node_${node.hashCode()}",
            viewIdResourceName = node.viewIdResourceName,
            className = node.className?.toString(),
            packageName = node.packageName?.toString(),
            text = if (sensitive) null else node.text?.toString()?.take(500),
            contentDescription = if (sensitive) null else node.contentDescription?.toString()?.take(300),
            isClickable = node.isClickable,
            isEditable = node.isEditable,
            isScrollable = node.isScrollable,
            boundsInScreen = NodeBounds(rect.left, rect.top, rect.right, rect.bottom),
            children = children
        )
    }

    fun clickNode(targetText: String = "", viewId: String = ""): Boolean {
        val root = rootInActiveWindow ?: return false
        val candidates = when {
            viewId.isNotBlank() -> runCatching { root.findAccessibilityNodeInfosByViewId(viewId) }.getOrDefault(emptyList())
            targetText.isNotBlank() -> runCatching { root.findAccessibilityNodeInfosByText(targetText) }.getOrDefault(emptyList())
            else -> emptyList()
        }
        val target = candidates.firstOrNull { it.isEnabled && (it.isClickable || it.parent?.isClickable == true) } ?: return false
        if (target.isClickable) return target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        return target.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
    }

    fun scrollActive(direction: String = "down"): Boolean {
        val root = rootInActiveWindow ?: return false
        val nodes = mutableListOf<AccessibilityNodeInfo>()
        fun collect(node: AccessibilityNodeInfo, depth: Int) {
            if (depth > 12 || nodes.size >= 150) return
            if (node.isScrollable && node.isEnabled) nodes.add(node)
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                collect(child, depth + 1)
            }
        }
        collect(root, 0)
        val target = nodes.maxByOrNull {
            val rect = Rect()
            it.getBoundsInScreen(rect)
            rect.width() * rect.height()
        } ?: root.takeIf { it.isScrollable }
        val action = if (direction.equals("up", true) || direction.equals("left", true)) {
            AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        } else {
            AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        }
        return target?.performAction(action) == true
    }

    fun performGlobal(action: String): Boolean {
        val globalAction = when (action.uppercase()) {
            "BACK", "NAVIGATE_BACK" -> GLOBAL_ACTION_BACK
            "HOME", "GO_HOME" -> GLOBAL_ACTION_HOME
            "RECENTS", "OPEN_RECENTS" -> GLOBAL_ACTION_RECENTS
            "NOTIFICATIONS", "OPEN_NOTIFICATIONS" -> GLOBAL_ACTION_NOTIFICATIONS
            "QUICK_SETTINGS", "OPEN_QUICK_SETTINGS" -> GLOBAL_ACTION_QUICK_SETTINGS
            else -> return false
        }
        return performGlobalAction(globalAction)
    }

    fun performTapAt(x: Float, y: Float, durationMs: Long = 100, onComplete: (Boolean) -> Unit = {}) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs.coerceIn(40, 3000)))
            .build()
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) = onComplete(true)
            override fun onCancelled(gestureDescription: GestureDescription?) = onComplete(false)
        }, null)
    }

    fun performSwipe(
        startX: Float, startY: Float,
        endX: Float, endY: Float,
        durationMs: Long = 300,
        onComplete: (Boolean) -> Unit = {}
    ) {
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs.coerceIn(80, 5000)))
            .build()
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) = onComplete(true)
            override fun onCancelled(gestureDescription: GestureDescription?) = onComplete(false)
        }, null)
    }

    fun performTextSetOnFocused(text: String): Boolean {
        if (text.length > 8000) return false
        val root = rootInActiveWindow ?: return false
        val focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
        if (focus.isPassword) return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    fun captureScreenBase64(onComplete: (String?) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            onComplete(null)
            return
        }
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(screenshot: ScreenshotResult) {
                    try {
                        val hardwareBuffer = screenshot.hardwareBuffer
                        val bitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, screenshot.colorSpace)
                        hardwareBuffer.close()
                        if (bitmap == null) {
                            onComplete(null)
                            return
                        }
                        val scaled = if (bitmap.width > 1600) {
                            val height = (bitmap.height * (1600f / bitmap.width)).toInt()
                            Bitmap.createScaledBitmap(bitmap, 1600, height, true)
                        } else bitmap
                        val output = ByteArrayOutputStream()
                        scaled.compress(Bitmap.CompressFormat.JPEG, 72, output)
                        if (scaled !== bitmap) scaled.recycle()
                        bitmap.recycle()
                        onComplete(Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP))
                    } catch (_: Exception) {
                        onComplete(null)
                    }
                }

                override fun onFailure(errorCode: Int) {
                    onComplete(null)
                }
            })
        } catch (_: Exception) {
            onComplete(null)
        }
    }
}
